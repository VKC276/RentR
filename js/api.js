/**
 * API client for the Google Apps Script web app.
 *
 * The /exec endpoint answers with Access-Control-Allow-Origin: * on both the
 * 302 and the redirect target, so ordinary fetch works cross-origin. Requests
 * are kept "simple" (text/plain body, no custom headers) so the browser never
 * sends a preflight, which GAS cannot answer.
 *
 * GET and JSONP exist as fallbacks for networks that strip POST or CORS. Every
 * request carries a requestId that the backend uses to replay a stored result,
 * so falling back or retrying can never run an action twice.
 */
(function (global) {
  var TIMEOUT_MS = 30000;
  var seq = 0;
  var transport = null;

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
      if (/accounts\.google\.com|ServiceLogin/i.test(text)) {
        throw new Error('Web appen kräver inloggning. Deploya om med "Vem har åtkomst: Alla".');
      }
      // Google sometimes serves a Drive error page instead of the script output.
      // The script itself already ran, so this is safe to retry thanks to requestId.
      var snippet = String(text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 250);
      var err = new Error('Oväntat svar från servern: ' + (snippet || '(tomt svar)'));
      err.retryable = true;
      throw err;
    }
    if (data && data.error) {
      var err = new Error(data.error);
      err.status = data.status || 500;
      err.fromServer = true;
      // The message is Swedish. A page that has to phrase the failure itself
      // switches on code and reads whatever the sentence needs from details.
      if (data.code) err.code = data.code;
      if (data.details) err.details = data.details;
      // The original request is still executing. Asking again is the whole
      // point, not a failure to report.
      if (data.code === 'stillWorking') err.retryable = true;
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
        if (e && e.name === 'AbortError') {
          // Apps Script keeps running after the browser stops listening, so the
          // action may well have succeeded. The requestId lets us ask again for
          // the answer instead of treating this as a broken transport.
          var err = new Error('API timeout (' + action + ')');
          err.retryable = true;
          err.timedOut = true;
          return err;
        }
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

  var RETRIES = 6;

  function newRequestId() {
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /**
   * Repeats the request on Google's transient error page. The body carries a
   * stable requestId, so the backend replays its stored result instead of
   * running the action twice.
   */
  function sendRetrying(name, body, left) {
    if (typeof left !== 'number') left = RETRIES;
    return SENDERS[name](body).catch(function (e) {
      if (!e || !e.retryable || left <= 1) throw e;
      if (typeof api.onRetry === 'function') {
        try { api.onRetry(body.action, RETRIES - left + 1); } catch (hookErr) { /* ignore */ }
      }
      // Waiting out a slow run needs a longer pause than re-fetching after
      // Google served one of its error pages.
      var pause = e.timedOut || e.code === 'stillWorking' ? 2000 : 700;
      return delay(pause).then(function () {
        return sendRetrying(name, body, left - 1);
      });
    });
  }

  /**
   * Walks the transports until one answers. requestId makes a replay harmless,
   * so this needs no separate probe request — the real call is the probe.
   */
  function attemptTransports(order, i, body, lastErr) {
    if (i >= order.length) {
      return Promise.reject(new Error(
        'Kan inte nå API:et. Kontrollera API_BASE_URL och att web appen är deployad för "Alla". (' +
        (lastErr && lastErr.message ? lastErr.message : 'okänt fel') + ')'
      ));
    }
    var name = order[i];
    return sendRetrying(name, body).then(function (res) {
      transport = name;
      return res;
    }).catch(function (e) {
      // A rejection from our own backend means the transport works fine.
      if (e && e.fromServer) {
        transport = name;
        throw e;
      }
      // A timeout says the request was slow, not that this way of sending it is
      // blocked. Retrying it as GET and then JSONP only adds two more waits and
      // leaves the guest staring at a spinner.
      if (e && e.timedOut) {
        transport = name;
        throw e;
      }
      return attemptTransports(order, i + 1, body, e);
    });
  }

  function call(action, payload, sessionToken) {
    // 'action', 'requestId' and 'sessionToken' are reserved; a payload must not
    // use those names or its value is silently replaced here.
    var body = Object.assign({}, payload || {}, { action: action, requestId: newRequestId() });
    if (sessionToken) body.sessionToken = sessionToken;

    if (transport) return sendRetrying(transport, body);
    return attemptTransports(['post', 'get', 'jsonp'], 0, body);
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

  // onRetry is assigned by the UI to report transient Google failures.
  var api = {
    call: call,
    loadPublicConfig: loadPublicConfig,
    getCachedConfig: getCachedConfig,
    cacheConfig: setCachedConfig,
    onRetry: null
  };

  global.Api = api;
})(window);
