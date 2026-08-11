(function (global) {
  var cbSeq = 0;

  function apiUrl() {
    var cfg = global.APP_CONFIG || {};
    if (!cfg.API_BASE_URL || cfg.API_BASE_URL.indexOf('REPLACE_ME') >= 0) {
      return Promise.reject(new Error('Sätt API_BASE_URL i web/js/config.js'));
    }
    return cfg.API_BASE_URL;
  }

  function call(action, payload, sessionToken) {
    return new Promise(function (resolve, reject) {
      var base;
      try {
        base = (global.APP_CONFIG && global.APP_CONFIG.API_BASE_URL) || '';
        if (!base || base.indexOf('REPLACE_ME') >= 0) {
          reject(new Error('Sätt API_BASE_URL i web/js/config.js'));
          return;
        }
      } catch (e) {
        reject(e);
        return;
      }

      var name = '__gas_cb_' + (++cbSeq) + '_' + Date.now();
      var body = Object.assign({}, payload || {}, { action: action });
      if (sessionToken) body.sessionToken = sessionToken;

      var params = [
        'action=' + encodeURIComponent(action),
        'callback=' + encodeURIComponent(name),
        'payload=' + encodeURIComponent(JSON.stringify(body))
      ];
      if (sessionToken) params.push('sessionToken=' + encodeURIComponent(sessionToken));

      var script = document.createElement('script');
      var timer = setTimeout(function () {
        cleanup();
        reject(new Error('API timeout'));
      }, 45000);

      function cleanup() {
        clearTimeout(timer);
        delete global[name];
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
        reject(new Error('API network error'));
      };
      document.head.appendChild(script);
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
