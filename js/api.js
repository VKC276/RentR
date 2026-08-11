/**
 * API client for Google Apps Script web apps.
 *
 * GAS /exec always redirects (script.google.com → googleusercontent.com).
 * That is normal. We work around it by:
 *  1) Primary: HtmlService iframe bridge (?bridge=1) + google.script.run + postMessage
 *  2) Fallback: JSONP <script> load (browser follows redirects; referrerPolicy=no-referrer)
 */
(function (global) {
  var seq = 0;
  var pending = {};
  var iframe = null;
  var ready = false;
  var readyWaiters = [];
  var bridgeFailed = false;
  var BRIDGE_TIMEOUT_MS = 90000;
  var CALL_TIMEOUT_MS = 90000;

  function apiBase() {
    var cfg = global.APP_CONFIG || {};
    if (!cfg.API_BASE_URL || cfg.API_BASE_URL.indexOf('REPLACE_ME') >= 0) {
      throw new Error('Sätt API_BASE_URL i js/config.js');
    }
    return String(cfg.API_BASE_URL).replace(/\/$/, '');
  }

  function isGasContentOrigin(origin) {
    if (!origin) return false;
    return (
      origin.indexOf('https://script.google.com') === 0 ||
      origin.indexOf('https://script.googleusercontent.com') === 0 ||
      origin.indexOf('https://n-') === 0 // occasional GAS host variants
    );
  }

  function ensureBridge() {
    return new Promise(function (resolve, reject) {
      if (bridgeFailed) {
        reject(new Error('bridge unavailable'));
        return;
      }
      if (ready && iframe) {
        resolve();
        return;
      }

      readyWaiters.push({ resolve: resolve, reject: reject });
      if (iframe) return;

      var src = apiBase() + '?bridge=1&t=' + Date.now();
      iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'RentR API';
      iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute;left:-9999px';
      iframe.setAttribute('aria-hidden', 'true');
      // Allow GAS redirect + script.run inside frame
      iframe.setAttribute('referrerpolicy', 'no-referrer');

      var bootTimer = setTimeout(function () {
        failReady(new Error('API bridge timeout'));
      }, BRIDGE_TIMEOUT_MS);

      var pingTimer = null;

      function onReady() {
        if (ready) return;
        ready = true;
        clearTimeout(bootTimer);
        if (pingTimer) clearInterval(pingTimer);
        var list = readyWaiters.splice(0);
        list.forEach(function (w) { w.resolve(); });
      }

      function failReady(err) {
        clearTimeout(bootTimer);
        if (pingTimer) clearInterval(pingTimer);
        bridgeFailed = true;
        var list = readyWaiters.splice(0);
        list.forEach(function (w) { w.reject(err); });
      }

      global.addEventListener('message', function (event) {
        // After redirect, event.origin is googleusercontent.com — accept both
        if (!isGasContentOrigin(event.origin) && event.data && event.data.type === 'rentR-result') {
          // still accept result payloads if structure matches (some embeds differ)
        }
        var data = event.data || {};
        if (data.type === 'rentR-ready') {
          onReady();
          return;
        }
        if (data.type !== 'rentR-result' || !data.id) return;
        var p = pending[data.id];
        if (!p) return;
        delete pending[data.id];
        clearTimeout(p.timer);
        if (data.ok) {
          var result = data.result;
          if (result && result.error) {
            var err = new Error(result.error);
            err.status = result.status || 500;
            p.reject(err);
          } else {
            p.resolve(result);
          }
        } else {
          p.reject(new Error(data.error || 'API-fel'));
        }
      });

      function ping() {
        try {
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'rentR-ping' }, '*');
          }
        } catch (e) { /* redirect in progress */ }
      }

      iframe.onload = function () {
        // Redirect may complete here; keep pinging until ready
        ping();
        var tries = 0;
        pingTimer = setInterval(function () {
          if (ready) {
            clearInterval(pingTimer);
            return;
          }
          tries++;
          ping();
          if (tries > 40) clearInterval(pingTimer);
        }, 500);
      };

      iframe.onerror = function () {
        failReady(new Error('API bridge network error'));
      };

      (document.body || document.documentElement).appendChild(iframe);
    });
  }

  function callViaBridge(action, payload, sessionToken) {
    return ensureBridge().then(function () {
      return new Promise(function (resolve, reject) {
        var id = 'c' + (++seq) + '_' + Date.now();
        var timer = setTimeout(function () {
          delete pending[id];
          reject(new Error('API timeout (' + action + ')'));
        }, CALL_TIMEOUT_MS);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        try {
          iframe.contentWindow.postMessage({
            type: 'rentR-call',
            id: id,
            action: action,
            payload: payload || {},
            sessionToken: sessionToken || ''
          }, '*');
        } catch (e) {
          clearTimeout(timer);
          delete pending[id];
          reject(e);
        }
      });
    });
  }

  /**
   * JSONP fallback — <script src> follows GAS redirects automatically.
   */
  function callViaJsonp(action, payload, sessionToken) {
    return new Promise(function (resolve, reject) {
      var base = apiBase();
      var name = '__gas_cb_' + (++seq) + '_' + Date.now();
      var body = Object.assign({}, payload || {}, { action: action });
      if (sessionToken) body.sessionToken = sessionToken;

      var params = [
        'action=' + encodeURIComponent(action),
        'callback=' + encodeURIComponent(name),
        'payload=' + encodeURIComponent(JSON.stringify(body)),
        '_=' + Date.now()
      ];
      if (sessionToken) params.push('sessionToken=' + encodeURIComponent(sessionToken));

      var script = document.createElement('script');
      script.async = true;
      script.referrerPolicy = 'no-referrer';

      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('API timeout (' + action + ')'));
      }, CALL_TIMEOUT_MS);

      function cleanup() {
        clearTimeout(timer);
        try { delete global[name]; } catch (e) { global[name] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      global[name] = function (data) {
        cleanup();
        if (data && data.error) {
          var err = new Error(data.error);
          err.status = data.status || 500;
          reject(err);
        } else {
          resolve(data);
        }
      };

      script.src = base + (base.indexOf('?') >= 0 ? '&' : '?') + params.join('&');
      script.onerror = function () {
        cleanup();
        reject(new Error('API network error (JSONP efter redirect)'));
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function call(action, payload, sessionToken) {
    return callViaBridge(action, payload, sessionToken).catch(function (bridgeErr) {
      // Bridge can fail if iframe/third-party cookies blocked; JSONP still follows redirects
      return callViaJsonp(action, payload, sessionToken).catch(function (jsonpErr) {
        var msg = (bridgeErr && bridgeErr.message ? bridgeErr.message : 'bridge') +
          ' → ' + (jsonpErr && jsonpErr.message ? jsonpErr.message : 'jsonp');
        return Promise.reject(new Error('API-fel: ' + msg));
      });
    });
  }

  function getCachedConfig() {
    try {
      var raw = sessionStorage.getItem('publicConfig');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setCachedConfig(cfg) {
    sessionStorage.setItem('publicConfig', JSON.stringify(cfg));
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
