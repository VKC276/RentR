(function (global) {
  var seq = 0;
  var pending = {};
  var iframe = null;
  var ready = false;
  var readyWaiters = [];
  var BRIDGE_TIMEOUT_MS = 60000;

  function apiBase() {
    var cfg = global.APP_CONFIG || {};
    if (!cfg.API_BASE_URL || cfg.API_BASE_URL.indexOf('REPLACE_ME') >= 0) {
      throw new Error('Sätt API_BASE_URL i js/config.js');
    }
    return cfg.API_BASE_URL.replace(/\/$/, '');
  }

  function ensureBridge() {
    return new Promise(function (resolve, reject) {
      if (ready && iframe) {
        resolve();
        return;
      }
      readyWaiters.push({ resolve: resolve, reject: reject });
      if (iframe) return;

      var src = apiBase() + '?bridge=1';
      iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = 'RentR API';
      iframe.style.cssText = 'display:none;width:0;height:0;border:0;position:absolute';
      iframe.setAttribute('aria-hidden', 'true');

      var bootTimer = setTimeout(function () {
        failReady(new Error('API bridge timeout — kontrollera GAS-deploy (Anyone) och Bridge.html'));
      }, BRIDGE_TIMEOUT_MS);

      function onReady() {
        if (ready) return;
        ready = true;
        clearTimeout(bootTimer);
        var list = readyWaiters.splice(0);
        list.forEach(function (w) { w.resolve(); });
      }

      function failReady(err) {
        clearTimeout(bootTimer);
        var list = readyWaiters.splice(0);
        list.forEach(function (w) { w.reject(err); });
      }

      global.addEventListener('message', function (event) {
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

      iframe.onload = function () {
        // Ask bridge to confirm (in case ready fired before listener)
        try {
          iframe.contentWindow.postMessage({ type: 'rentR-ping' }, '*');
        } catch (e) { /* cross-origin until loaded */ }
        // Also resolve after short delay if ready message already came
        setTimeout(function () {
          if (!ready) {
            try {
              iframe.contentWindow.postMessage({ type: 'rentR-ping' }, '*');
            } catch (e2) {}
          }
        }, 1500);
      };

      iframe.onerror = function () {
        failReady(new Error('API network error — kunde inte ladda GAS-bridge'));
      };

      document.body.appendChild(iframe);
    });
  }

  function call(action, payload, sessionToken) {
    return ensureBridge().then(function () {
      return new Promise(function (resolve, reject) {
        var id = 'c' + (++seq) + '_' + Date.now();
        var timer = setTimeout(function () {
          delete pending[id];
          reject(new Error('API timeout (' + action + ')'));
        }, BRIDGE_TIMEOUT_MS);
        pending[id] = { resolve: resolve, reject: reject, timer: timer };
        iframe.contentWindow.postMessage({
          type: 'rentR-call',
          id: id,
          action: action,
          payload: payload || {},
          sessionToken: sessionToken || ''
        }, '*');
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
