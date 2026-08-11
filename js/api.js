/**
 * API client for the Google Apps Script web app.
 *
 * The /exec endpoint answers with Access-Control-Allow-Origin: * on both the
 * 302 and the redirect target, so ordinary fetch works cross-origin. Requests
 * are kept "simple" (text/plain body, no custom headers) so the browser never
 * sends a preflight, which GAS cannot answer.
 *
 * GET and JSONP exist as fallbacks for networks that strip POST or CORS.
 * The working transport is detected once and reused, so a request is never
 * replayed on another transport after it may already have reached the server.
 */
(function (global) {
  var TIMEOUT_MS = 30000;
  var seq = 0;
  var transport = null;
  var detecting = null;

  var READ_ACTIONS = {
    ping: 1, getPublicConfig: 1, getAvailability: 1, lookupBooking: 1,
    getBookingByToken: 1, getDoorPass: 1, me: 1, listBookings: 1, listUsers: 1,
    listPads: 1, listPricingRules: 1, listDoorPasses: 1, availablePadsForBooking: 1
  };

  function apiBase() {
    var cfg = global.APP_CONFIG || {};
    if (!cfg.API_BASE_URL || cfg.API_BASE_URL.indexOf('REPLACE_ME') >= 0) {
      throw new Error('Sätt API_BASE_URL i js/config.js');
    }
    return String(cfg.API_BASE_URL).replace(/\/$/, '');
  }

  function parseResult(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (/<\s*html/i.test(text) || /accounts\.google\.com/i.test(text)) {
        throw new Error('Web appen returnerade en inloggningssida. Deploya om med "Vem har åtkomst: Alla".');
      }
      throw new Error('Ogiltigt svar från servern');
    }
    if (data && data.error) {
      var err = new Error(data.error);
      err.status = data.status || 500;
      err.fromServer = true;
      throw err;
    }
    return data;
  }

  function withTimeout(action) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, TIMEOUT_MS);
    return {
      signal: ctrl ? ctrl.signal : undefined,
      done: function () { clearTimeout(timer); },
      wrap: function (e) {
        if (e && e.name === 'AbortError') return new Error('API timeout (' + action + ')');
        return e;
      }
    };
  }

  function sendPost(body) {
    var t = withTimeout(body.action);
    return fetch(apiBase(), {
      method: 'POST',
      // text/plain keeps this a CORS simple request (no preflight)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      t.done();
      return r.text();
    }).then(parseResult).catch(function (e) {
      t.done();
      throw t.wrap(e);
    });
  }

  function sendGet(body) {
    var t = withTimeout(body.action);
    var base = apiBase();
    var url = base + (base.indexOf('?') >= 0 ? '&' : '?') +
      'action=' + encodeURIComponent(body.action) +
      '&payload=' + encodeURIComponent(JSON.stringify(body)) +
      '&_=' + Date.now();
    return fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      t.done();
      return r.text();
    }).then(parseResult).catch(function (e) {
      t.done();
      throw t.wrap(e);
    });
  }

  function sendJsonp(body) {
    return new Promise(function (resolve, reject) {
      var base = apiBase();
      var name = '__gas_cb_' + (++seq) + '_' + Date.now();
      var script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'no-referrer';

      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('API timeout (' + body.action + ')'));
      }, TIMEOUT_MS);

      function cleanup() {
        clearTimeout(timer);
        try { delete global[name]; } catch (e) { global[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      global[name] = function (data) {
        cleanup();
        try {
          resolve(parseResult(JSON.stringify(data)));
        } catch (e) {
          reject(e);
        }
      };

      script.src = base + (base.indexOf('?') >= 0 ? '&' : '?') +
        'action=' + encodeURIComponent(body.action) +
        '&callback=' + encodeURIComponent(name) +
        '&payload=' + encodeURIComponent(JSON.stringify(body)) +
        '&_=' + Date.now();
      script.onerror = function () {
        cleanup();
        reject(new Error('API network error'));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  var SENDERS = { post: sendPost, get: sendGet, jsonp: sendJsonp };

  /**
   * Tries each transport with a ping until one answers, then remembers it.
   */
  function detectTransport() {
    if (transport) return Promise.resolve(transport);
    if (detecting) return detecting;

    var order = ['post', 'get', 'jsonp'];
    var attempt = function (i, lastErr) {
      if (i >= order.length) {
        return Promise.reject(new Error(
          'Kan inte nå API:et. Kontrollera API_BASE_URL och att web appen är deployad för "Alla". (' +
          (lastErr && lastErr.message ? lastErr.message : 'okänt fel') + ')'
        ));
      }
      var name = order[i];
      return SENDERS[name]({ action: 'ping' }).then(function () {
        transport = name;
        return name;
      }).catch(function (e) {
        if (e && e.fromServer) {
          // Reached the backend; the transport itself is fine.
          transport = name;
          return name;
        }
        return attempt(i + 1, e);
      });
    };

    detecting = attempt(0, null).then(function (name) {
      detecting = null;
      return name;
    }, function (e) {
      detecting = null;
      throw e;
    });
    return detecting;
  }

  function call(action, payload, sessionToken) {
    var body = Object.assign({}, payload || {}, { action: action });
    if (sessionToken) body.sessionToken = sessionToken;

    if (transport) return SENDERS[transport](body);

    // A read can double as the probe; anything that writes waits for a ping
    // so a failed request is never replayed on a second transport.
    if (READ_ACTIONS[action]) {
      return sendPost(body).then(function (res) {
        transport = 'post';
        return res;
      }).catch(function (e) {
        if (e && e.fromServer) {
          transport = 'post';
          throw e;
        }
        return detectTransport().then(function (name) {
          return SENDERS[name](body);
        });
      });
    }

    return detectTransport().then(function (name) {
      return SENDERS[name](body);
    });
  }

  function getCachedConfig() {
    try {
      var raw = sessionStorage.getItem('publicConfig');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCachedConfig(cfg) {
    try { sessionStorage.setItem('publicConfig', JSON.stringify(cfg)); } catch (e) { /* private mode */ }
  }

  function loadPublicConfig(force) {
    if (!force) {
      var cached = getCachedConfig();
      if (cached) return Promise.resolve(cached);
    }
    return call('getPublicConfig', {}).then(function (cfg) {
      setCachedConfig(cfg);
      return cfg;
    });
  }

  global.Api = {
    call: call,
    loadPublicConfig: loadPublicConfig,
    getCachedConfig: getCachedConfig
  };
})(window);
