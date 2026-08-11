/**
 * Shared status banner.
 *
 * Apps Script calls take a moment, so every request says what it is doing
 * instead of only greying out a button. Nested calls are counted, so the
 * banner stays up until the last one finishes.
 */
(function (global) {
  var el = null;
  var depth = 0;

  function node() {
    if (el && el.isConnected) return el;
    el = document.getElementById('statusBar');
    if (!el) {
      el = document.createElement('div');
      el.id = 'statusBar';
      document.body.appendChild(el);
    }
    el.className = 'status-bar';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    return el;
  }

  function render(text, kind) {
    var n = node();
    n.innerHTML = '';
    if (kind !== 'error') {
      var spin = document.createElement('span');
      spin.className = 'status-spinner';
      n.appendChild(spin);
    }
    var label = document.createElement('span');
    label.textContent = text;
    n.appendChild(label);
    n.classList.toggle('is-error', kind === 'error');
    n.classList.add('is-visible');
  }

  function show(text) {
    depth++;
    render(text, 'busy');
  }

  /** Replaces the text of an ongoing operation without changing the depth. */
  function update(text) {
    if (depth > 0) render(text, 'busy');
  }

  function hide() {
    depth = Math.max(0, depth - 1);
    if (depth === 0 && el) el.classList.remove('is-visible', 'is-error');
  }

  /** Shows a message that stays until the next call, e.g. a failure. */
  function fail(text) {
    depth = 0;
    render(text, 'error');
    setTimeout(function () {
      if (depth === 0 && el) el.classList.remove('is-visible', 'is-error');
    }, 6000);
  }

  /** Wraps a promise so the banner is always cleared, success or not. */
  function during(text, promise) {
    show(text);
    return promise.then(function (res) {
      hide();
      return res;
    }, function (err) {
      hide();
      throw err;
    });
  }

  global.Status = { show: show, update: update, hide: hide, fail: fail, during: during };

  // Runs after all synchronous scripts, so Api and I18n are available whatever
  // order the page loads them in.
  function attachRetryNotice() {
    if (!global.Api) return;
    global.Api.onRetry = function () {
      update(global.I18n ? global.I18n.t('busyRetry') : 'Försöker igen…');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachRetryNotice);
  } else {
    attachRetryNotice();
  }
})(window);
