(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('t') || '';
  var booking = null;

  function $(id) { return document.getElementById(id); }

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = I18n.t('appName');
    document.title = I18n.t('appName') + ' — ' + I18n.t('manage');
    $('loading').textContent = I18n.t('loading');
    if (booking) render();
  }
  window.onLocaleChange = applyI18n;

  // The server accepts a cancellation up until the equipment is handed out.
  var CANCELLABLE = ['Requested', 'Approved', 'ChangePending', 'CancelPending'];

  function renderSelfServiceBlock(kind, section) {
    var title = kind === 'pickup'
      ? I18n.t('selfServicePickupTitle')
      : I18n.t('selfServiceReturnTitle');
    var html = '<div class="self-service-block">';
    html += '<h3>' + escapeHtml(title) + '</h3>';

    var phase = section && section.phase ? section.phase : 'notAllowed';
    var date = (section && section.date) || '';
    var startTime = (section && section.startTime) || '06:00';
    var endTime = (section && section.endTime) || '22:00';
    var hoursLabel = I18n.t('selfServiceHours', { start: startTime, end: endTime });

    if (phase === 'notAllowed') {
      html += '<p class="muted">' + escapeHtml(I18n.t('selfServiceNotAvailable')) + '</p>';
    } else if (phase === 'upcoming') {
      html += '<p class="muted">' + escapeHtml(
        kind === 'pickup'
          ? I18n.t('selfServicePickupActivates', { date: date })
          : I18n.t('selfServiceReturnActivates', { date: date })
      ) + '</p>';
      html += '<p class="muted">' + escapeHtml(hoursLabel) + '</p>';
    } else if (phase === 'outsideHours') {
      html += '<p class="muted">' + escapeHtml(I18n.t('selfServiceOutsideHours', {
        start: startTime,
        end: endTime
      })) + '</p>';
    } else if (phase === 'passed') {
      html += '<p class="muted">' + escapeHtml(
        kind === 'pickup'
          ? I18n.t('doorStatePickupPassed')
          : I18n.t('doorStateReturnPassed')
      ) + '</p>';
    } else if (phase === 'done') {
      html += '<p class="door-state is-active">' + escapeHtml(
        kind === 'pickup'
          ? I18n.t('doorStatePickedUp')
          : I18n.t('doorStateReturned')
      ) + '</p>';
    } else if (phase === 'active' || phase === 'confirm') {
      html += '<p class="muted">' + escapeHtml(hoursLabel) + '</p>';
      html += '<p class="door-steps">' + escapeHtml(I18n.t('selfServiceStepOpen')) + '</p>';
      html += '<div class="door-row">';
      html += '<button type="button" id="btnDoor' + (kind === 'pickup' ? 'Pickup' : 'Return') + '">' +
        I18n.t('openDoor') + '</button>';
      html += '</div>';
      if (phase === 'confirm' || (section && section.showConfirm)) {
        html += '<p class="door-steps">' + escapeHtml(
          kind === 'pickup'
            ? I18n.t('selfServiceStepConfirmPickup')
            : I18n.t('selfServiceStepConfirmReturn')
        ) + '</p>';
        html += '<div class="door-row">';
        html += '<button type="button" class="warn" id="btnConfirm' +
          (kind === 'pickup' ? 'Pickup' : 'Return') + '">' +
          I18n.t(kind === 'pickup' ? 'confirmPickup' : 'confirmReturn') + '</button>';
        html += '</div>';
      }
    } else {
      html += '<p class="muted">' + escapeHtml(I18n.t('selfServiceNotAvailable')) + '</p>';
    }

    html += '</div>';
    return html;
  }

  function renderDoorControls(od) {
    if (!od.doorUi && !od.pickup && !od.return) return '';

    var html = '<section class="booking-chapter self-service">';
    html += '<h2>' + escapeHtml(I18n.t('selfServiceTitle')) + '</h2>';
    html += renderSelfServiceBlock('pickup', od.pickup || { phase: 'notAllowed' });
    html += renderSelfServiceBlock('return', od.return || { phase: 'notAllowed' });
    html += '</section>';
    return html;
  }

  function render() {
    var b = booking;
    var od = b.openDoor || {};
    var html = '';
    html += '<h1>' + I18n.t('bookingNo') + ' ' + escapeHtml(b.bookingNumber) + '</h1>';
    html += '<p>' + I18n.t('status') + ': <strong>' + escapeHtml(I18n.statusLabel(b.status)) + '</strong></p>';
    html += '<p>' + escapeHtml(b.firstName + ' ' + b.lastName) + ' · ' + escapeHtml(b.email) + ' · ' + escapeHtml(b.phone) + '</p>';
    html += '<p>' + escapeHtml(I18n.t('daysExplain', { start: b.startDate, end: b.endDate, days: b.days })) + '</p>';
    html += '<p>' + escapeHtml((b.pads || []).map(function (p) { return p.name; }).join(', ')) + '</p>';
    html += '<div class="price-box"><strong>' + I18n.t('total') + ': ' + b.priceTotal + ' SEK</strong><div class="muted">' + I18n.t('payNote') + '</div></div>';

    html += renderDoorControls(od);

    if (CANCELLABLE.indexOf(b.status) >= 0) {
      html += '<p style="margin-top:1rem;"><button type="button" class="ghost" id="btnCancel">' + I18n.t('cancelBooking') + '</button></p>';
    }
    if (b.status === 'Cancelled') {
      html += '<p class="ok">' + I18n.t('cancelDone') + '</p>';
    }

    $('content').innerHTML = html;
    $('content').hidden = false;
    $('loading').hidden = true;

    function wireDoor(btnId) {
      var btn = $(btnId);
      if (!btn || btn.disabled) return;
      btn.onclick = function () {
        Status.button(btn, I18n.t('busyDoor'), Api.call('openDoor', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
    wireDoor('btnDoorPickup');
    wireDoor('btnDoorReturn');

    var btnPickup = $('btnConfirmPickup');
    if (btnPickup) {
      btnPickup.onclick = function () {
        Status.button(btnPickup, I18n.t('busyPickup'), Api.call('confirmPickup', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
    var btnReturn = $('btnConfirmReturn');
    if (btnReturn) {
      btnReturn.onclick = function () {
        Status.button(btnReturn, I18n.t('busyReturn'), Api.call('confirmReturn', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
    var btnCancel = $('btnCancel');
    if (btnCancel) {
      btnCancel.onclick = function () {
        if (!confirm(I18n.t('confirmCancel'))) return;
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
