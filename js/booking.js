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

  // The server accepts a cancellation up until the equipment is handed out.
  var CANCELLABLE = ['Requested', 'Approved', 'ChangePending', 'CancelPending'];

  function doorStateLabel(od) {
    var date = od.activeDate || '';
    if (od.doorState === 'active') {
      return od.mode === 'return'
        ? I18n.t('doorStateReturnActive')
        : I18n.t('doorStatePickupActive');
    }
    if (od.doorState === 'upcoming') {
      return od.mode === 'return'
        ? I18n.t('doorStateReturnUpcoming', { date: date })
        : I18n.t('doorStatePickupUpcoming', { date: date });
    }
    if (od.doorState === 'pickupPassed') return I18n.t('doorStatePickupPassed');
    if (od.doorState === 'returnPassed') return I18n.t('doorStateReturnPassed');
    if (od.doorState === 'pickedUp') return I18n.t('doorStatePickedUp');
    if (od.doorState === 'done' || od.doorState === 'returned') return I18n.t('doorStateReturned');
    if (od.doorState === 'passed') return I18n.t('doorStatePassed');
    if (od.doorState === 'revoked') return I18n.t('doorStateRevoked');
    if (od.doorState === 'unavailable') return I18n.t('doorStateUnavailable');
    return '';
  }

  function renderDoorControls(od) {
    if (!od.showConfirmPickup && !od.showConfirmReturn && !od.doorUi) return '';

    var mode = od.mode || (od.showConfirmPickup ? 'pickup' : (od.showConfirmReturn ? 'return' : ''));
    var state = od.doorState || '';
    var lead = '';
    if (od.showConfirmPickup || (mode === 'pickup' && state !== 'pickedUp' && state !== 'pickupPassed')) {
      lead = I18n.t('selfServicePickupExplain');
    } else if (od.showConfirmReturn || mode === 'return') {
      lead = I18n.t('selfServiceReturnExplain');
    } else if (state === 'pickedUp') {
      lead = '';
    } else {
      lead = I18n.t('openDoorHint');
    }

    var html = '<section class="booking-chapter self-service">';
    html += '<h2>' + escapeHtml(I18n.t('selfServiceTitle')) + '</h2>';
    if (lead) html += '<p class="muted chapter-lead">' + escapeHtml(lead) + '</p>';

    if (od.showOpenDoor || state === 'upcoming' || state === 'active') {
      var enabled = !!od.showOpenDoor;
      html += '<p class="door-steps">' + escapeHtml(I18n.t('selfServiceStepOpen')) + '</p>';
      html += '<div class="door-row">';
      html += '<button type="button" id="btnDoor"' + (enabled ? '' : ' disabled') + '>' +
        I18n.t('openDoor') + '</button>';
      html += '<span class="door-state' + (enabled ? ' is-active' : '') + '">' +
        escapeHtml(doorStateLabel(od)) + '</span>';
      html += '</div>';
    }
    if (od.showConfirmPickup) {
      html += '<p class="door-steps">' + escapeHtml(I18n.t('selfServiceStepConfirmPickup')) + '</p>';
      html += '<div class="door-row">';
      html += '<button type="button" class="warn" id="btnConfirmPickup">' + I18n.t('confirmPickup') + '</button>';
      html += '</div>';
    } else if (od.showConfirmReturn) {
      html += '<p class="door-steps">' + escapeHtml(I18n.t('selfServiceStepConfirmReturn')) + '</p>';
      html += '<div class="door-row">';
      html += '<button type="button" class="warn" id="btnConfirmReturn">' + I18n.t('confirmReturn') + '</button>';
      html += '</div>';
    } else if (!od.showOpenDoor && state !== 'upcoming' && state !== 'active') {
      html += '<p class="door-state">' + escapeHtml(doorStateLabel(od)) + '</p>';
    }

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

    var btnDoor = $('btnDoor');
    if (btnDoor && !btnDoor.disabled) {
      btnDoor.onclick = function () {
        Status.button(btnDoor, I18n.t('busyDoor'), Api.call('openDoor', { magicToken: token, t: token }))
          .then(function (res) {
            booking = res.booking;
            render();
          }).catch(function (e) { showErr(e.message); });
      };
    }
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
