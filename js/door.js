(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var pass = null;

  function $(id) { return document.getElementById(id); }

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = I18n.t('appName');
    document.title = I18n.t('appName') + ' — ' + I18n.t('doorPassTitle');
    $('loading').textContent = I18n.t('loading');
    if (pass) render();
  }
  window.onLocaleChange = applyI18n;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function doorStateLabel(od) {
    if (od.doorState === 'active') return I18n.t('doorStateActive');
    if (od.doorState === 'upcoming') {
      return I18n.t('doorStateUpcoming', { date: od.startDate || od.activeDate || '' });
    }
    if (od.doorState === 'passed') return I18n.t('doorStatePassed');
    if (od.doorState === 'revoked') return I18n.t('doorStateRevoked');
    return '';
  }

  function render() {
    var html = '';
    html += '<h1>' + escapeHtml(pass.recipientName) + '</h1>';
    html += '<p class="muted">' + I18n.t('doorValid') + ': <strong>' +
      escapeHtml(pass.startDate) + ' – ' + escapeHtml(pass.endDate) + '</strong></p>';
    html += '<p class="muted">' + I18n.t('doorPassValidHint') + '</p>';

    if (pass.doorUi || pass.showOpenDoor || pass.doorState) {
      var enabled = !!pass.showOpenDoor;
      html += '<div class="door-block">';
      html += '<p class="muted door-hint">' + escapeHtml(I18n.t('openDoorPassHint')) + '</p>';
      html += '<div class="door-row">';
      html += '<button type="button" id="btnDoor" style="font-size:1.15rem;padding:1rem 1.5rem;"' +
        (enabled ? '' : ' disabled') + '>' + I18n.t('openDoor') + '</button>';
      html += '<span class="door-state' + (enabled ? ' is-active' : '') + '">' +
        escapeHtml(doorStateLabel(pass)) + '</span>';
      html += '</div></div>';
    } else {
      html += '<p class="err">' + I18n.t('doorPassNotValidToday') + '</p>';
    }

    $('content').innerHTML = html;
    $('content').hidden = false;
    $('loading').hidden = true;

    var btn = $('btnDoor');
    if (btn && !btn.disabled) {
      btn.onclick = function () {
        $('ok').hidden = true;
        $('err').hidden = true;
        Status.button(btn, I18n.t('busyDoor'), Api.call('openDoor', { magicToken: token, t: token }))
          .then(function () {
            $('ok').hidden = false;
            $('ok').textContent = I18n.t('doorOpened');
          }).catch(function (e) {
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

  Status.during(I18n.t('busyDoorPass'), Api.call('getDoorPass', { magicToken: token, t: token })).then(function (res) {
    pass = res.pass;
    render();
  }).catch(function (e) {
    $('loading').hidden = true;
    $('err').hidden = false;
    $('err').textContent = e.message || I18n.t('error');
  });
})();
