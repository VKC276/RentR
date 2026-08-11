(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var booking = null;

  function $(id) { return document.getElementById(id); }

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = I18n.t('appName');
    $('loading').textContent = I18n.t('loading');
    if (booking) render();
  }
  window.onLocaleChange = applyI18n;

  function render() {
    var b = booking;
    var od = b.openDoor || {};
    var html = '';
    html += '<h1>' + I18n.t('bookingNo') + ' ' + escapeHtml(b.bookingNumber) + '</h1>';
    html += '<p>' + I18n.t('status') + ': <strong>' + escapeHtml(b.status) + '</strong></p>';
    html += '<p>' + escapeHtml(b.firstName + ' ' + b.lastName) + ' · ' + escapeHtml(b.email) + ' · ' + escapeHtml(b.phone) + '</p>';
    html += '<p>' + escapeHtml(I18n.t('daysExplain', { start: b.startDate, end: b.endDate, days: b.days })) + '</p>';
    html += '<p>' + escapeHtml((b.pads || []).map(function (p) { return p.name; }).join(', ')) + '</p>';
    html += '<div class="price-box"><strong>' + I18n.t('total') + ': ' + b.priceTotal + ' SEK</strong><div class="muted">' + I18n.t('payNote') + '</div></div>';

    if (od.showOpenDoor) {
      html += '<p style="margin-top:1rem;"><button type="button" id="btnDoor">' + I18n.t('openDoor') + '</button></p>';
    }
    if (od.showConfirmReturn) {
      html += '<p style="margin-top:1rem;"><button type="button" class="warn" id="btnConfirm">' + I18n.t('confirmReturn') + '</button></p>';
    }

    if (['Approved', 'Requested'].indexOf(b.status) >= 0) {
      html += '<p style="margin-top:1rem;"><button type="button" class="ghost" id="btnCancel">' + I18n.t('requestCancel') + '</button></p>';
    }

    $('content').innerHTML = html;
    $('content').hidden = false;
    $('loading').hidden = true;

    var btnDoor = $('btnDoor');
    if (btnDoor) {
      btnDoor.onclick = function () {
        Status.button(btnDoor, I18n.t('busyDoor'), Api.call('openDoor', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
    var btnConfirm = $('btnConfirm');
    if (btnConfirm) {
      btnConfirm.onclick = function () {
        Status.button(btnConfirm, I18n.t('busyReturn'), Api.call('confirmReturn', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
    var btnCancel = $('btnCancel');
    if (btnCancel) {
      btnCancel.onclick = function () {
        if (!confirm(I18n.t('requestCancel') + '?')) return;
        Status.button(btnCancel, I18n.t('busyCancel'), Api.call('guestRequestCancel', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
  }

  function showErr(msg) {
    $('err').hidden = false;
    $('err').textContent = msg || I18n.t('error');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  applyI18n();
  if (!token) {
    $('loading').hidden = true;
    showErr(I18n.t('error'));
    return;
  }
  Status.during(I18n.t('busyBooking'), Api.call('getBookingByToken', { magicToken: token, t: token })).then(function (res) {
    booking = res.booking;
    render();
  }).catch(function (e) {
    $('loading').hidden = true;
    showErr(e.message);
  });
})();
