(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var pass = null;

  function $(id) { return document.getElementById(id); }

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = I18n.t('appName');
    $('loading').textContent = I18n.t('loading');
    if (pass) render();
  }
  window.onLocaleChange = applyI18n;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function render() {
    var html = '';
    html += '<h1>' + escapeHtml(pass.recipientName) + '</h1>';
    html += '<p class="muted">' + I18n.t('doorValid') + ': <strong>' +
      escapeHtml(pass.startDate) + ' – ' + escapeHtml(pass.endDate) + '</strong></p>';
    html += '<p class="muted">' + I18n.t('doorValidHint') + '</p>';

    if (pass.showOpenDoor) {
      html += '<p style="margin-top:1.5rem;"><button type="button" id="btnDoor" style="font-size:1.15rem;padding:1rem 1.5rem;">' +
        I18n.t('openDoor') + '</button></p>';
    } else {
      html += '<p class="err">' + I18n.t('doorNotValidToday') + '</p>';
    }

    $('content').innerHTML = html;
    $('content').hidden = false;
    $('loading').hidden = true;

    var btn = $('btnDoor');
    if (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        $('ok').hidden = true;
        $('err').hidden = true;
        Api.call('openDoor', { magicToken: token, t: token }).then(function () {
          $('ok').hidden = false;
          $('ok').textContent = I18n.t('doorOpened');
          btn.disabled = false;
        }).catch(function (e) {
          btn.disabled = false;
          $('err').hidden = false;
          $('err').textContent = e.message || I18n.t('error');
        });
      };
    }
  }

  applyI18n();
  if (!token) {
    $('loading').hidden = true;
    $('err').hidden = false;
    $('err').textContent = I18n.t('error');
    return;
  }

  Api.call('getDoorPass', { magicToken: token, t: token }).then(function (res) {
    pass = res.pass;
    render();
  }).catch(function (e) {
    $('loading').hidden = true;
    $('err').hidden = false;
    $('err').textContent = e.message || I18n.t('error');
  });
})();
