(function () {
  var state = {
    config: null,
    startDate: '',
    endDate: '',
    selected: [],
    hold: null,
    timerId: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = I18n.t('appName');
    $('navFind').textContent = I18n.t('find');
    $('titleBook').textContent = I18n.t('book');
    $('lblStart').textContent = I18n.t('start');
    $('lblEnd').textContent = I18n.t('end');
    $('btnCheck').textContent = I18n.t('check');
    $('titlePads').textContent = I18n.t('available');
    $('btnHold').textContent = I18n.t('continue');
    $('lblFirst').textContent = I18n.t('firstName');
    $('lblLast').textContent = I18n.t('lastName');
    $('lblEmail').textContent = I18n.t('email');
    $('lblPhone').textContent = I18n.t('phone');
    $('lblNotes').textContent = I18n.t('notes');
    $('btnSubmit').textContent = I18n.t('submit');
    $('holdLabel').textContent = I18n.t('holdLeft');
    $('payNote').textContent = I18n.t('payNote');
    $('thanksTitle').textContent = I18n.t('thanks');
    $('lblBookingNo').textContent = I18n.t('bookingNo');
    updateDaysHint();
    updatePriceBox();
  }

  window.onLocaleChange = applyI18n;

  function updateDaysHint() {
    var s = $('startDate').value;
    var e = $('endDate').value;
    if (!s || !e) { $('daysHint').textContent = ''; return; }
    var days = Pricing.calcDays(s, e);
    $('daysHint').textContent = days > 0
      ? I18n.t('daysExplain', { start: s, end: e, days: days })
      : '';
  }

  function showErr(id, msg) {
    var el = $(id);
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function renderPads(pads) {
    var grid = $('padGrid');
    grid.innerHTML = '';
    state.selected = [];
    $('btnHold').disabled = true;
    pads.forEach(function (p) {
      var div = document.createElement('div');
      div.className = 'pad' + (p.available ? '' : ' unavailable');
      div.innerHTML = '<strong>' + escapeHtml(p.name) + '</strong><div class="muted">' +
        (p.available ? (p.pricePerDay + ' ' + ((state.config && state.config.currency) || 'SEK') + '/dygn') : I18n.t('unavailable')) +
        '</div>';
      if (p.available) {
        div.addEventListener('click', function () {
          var idx = state.selected.indexOf(p.id);
          if (idx >= 0) state.selected.splice(idx, 1);
          else state.selected.push(p.id);
          div.classList.toggle('selected');
          $('btnHold').disabled = state.selected.length === 0;
          updatePriceBox();
        });
      }
      grid.appendChild(div);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /**
   * Pads and prices cannot be rendered without the config, so a failed initial
   * load is retried here rather than leaving the page in a half-broken state.
   */
  function ensureConfig() {
    if (state.config) return Promise.resolve(state.config);
    return Api.loadPublicConfig().then(function (cfg) {
      state.config = cfg;
      $('brand').textContent = cfg.appName || I18n.t('appName');
      return cfg;
    });
  }

  function updatePriceBox() {
    if (!state.config || !state.startDate || !state.endDate || !state.selected.length) {
      if ($('priceBox')) $('priceBox').innerHTML = '';
      return;
    }
    var price = Pricing.calculatePrice(state.config, state.selected, state.startDate, state.endDate);
    $('priceBox').innerHTML =
      '<div class="muted">' + escapeHtml(I18n.t('daysExplain', { start: state.startDate, end: state.endDate, days: price.days })) + '</div>' +
      '<div>' + I18n.t('base') + ': ' + price.priceBase + ' ' + price.currency + '</div>' +
      (price.priceDiscount ? '<div>' + I18n.t('discount') + ': −' + price.priceDiscount + ' ' + price.currency + '</div>' : '') +
      '<div><strong>' + I18n.t('total') + ': ' + price.priceTotal + ' ' + price.currency + '</strong></div>';
  }

  function startTimer(expiresAt) {
    if (state.timerId) clearInterval(state.timerId);
    function tick() {
      var ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        $('holdTimer').textContent = '00:00';
        clearInterval(state.timerId);
        showErr('errForm', I18n.t('holdExpired'));
        $('btnSubmit').disabled = true;
        return;
      }
      var m = Math.floor(ms / 60000);
      var s = Math.floor((ms % 60000) / 1000);
      $('holdTimer').textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    tick();
    state.timerId = setInterval(tick, 1000);
  }

  $('startDate').addEventListener('change', updateDaysHint);
  $('endDate').addEventListener('change', updateDaysHint);

  $('btnCheck').addEventListener('click', function () {
    showErr('errDates');
    var s = $('startDate').value;
    var e = $('endDate').value;
    if (!s || !e || Pricing.calcDays(s, e) < 1) {
      showErr('errDates', I18n.t('error'));
      return;
    }
    state.startDate = s;
    state.endDate = e;
    $('btnCheck').disabled = true;
    ensureConfig().then(function () {
      return Api.call('getAvailability', { startDate: s, endDate: e });
    }).then(function (res) {
      $('btnCheck').disabled = false;
      $('stepPads').hidden = false;
      $('stepForm').hidden = true;
      renderPads(res.pads || []);
      updatePriceBox();
    }).catch(function (err) {
      $('btnCheck').disabled = false;
      showErr('errDates', err.message || I18n.t('error'));
    });
  });

  $('btnHold').addEventListener('click', function () {
    showErr('errPads');
    if (!state.selected.length) return;
    $('btnHold').disabled = true;
    // An earlier hold of ours would otherwise block the pads we are re-picking.
    var prev = state.hold;
    state.hold = null;
    var released = prev
      ? Api.call('releaseHold', { holdToken: prev.holdToken }).catch(function () {})
      : Promise.resolve();

    released.then(function () {
      return Api.call('createHold', {
        padIds: state.selected,
        startDate: state.startDate,
        endDate: state.endDate
      });
    }).then(function (hold) {
      state.hold = hold;
      $('stepForm').hidden = false;
      $('btnSubmit').disabled = false;
      startTimer(hold.expiresAt);
      updatePriceBox();
      $('btnHold').disabled = false;
      window.scrollTo({ top: $('stepForm').offsetTop - 20, behavior: 'smooth' });
    }).catch(function (err) {
      $('btnHold').disabled = false;
      showErr('errPads', err.message || I18n.t('error'));
    });
  });

  $('btnCancelHold').addEventListener('click', function () {
    if (state.hold) {
      Api.call('releaseHold', { holdToken: state.hold.holdToken }).catch(function () {});
    }
    state.hold = null;
    $('stepForm').hidden = true;
    if (state.timerId) clearInterval(state.timerId);
  });

  $('btnSubmit').addEventListener('click', function () {
    showErr('errForm');
    if (!state.hold) return;
    var payload = {
      holdToken: state.hold.holdToken,
      firstName: $('firstName').value.trim(),
      lastName: $('lastName').value.trim(),
      email: $('email').value.trim(),
      phone: $('phone').value.trim(),
      notes: $('notes').value.trim(),
      locale: I18n.getLocale()
    };
    if (!payload.firstName || !payload.lastName || !payload.email || !payload.phone) {
      showErr('errForm', I18n.t('error'));
      return;
    }
    $('btnSubmit').disabled = true;
    Api.call('submitBooking', payload).then(function (res) {
      if (state.timerId) clearInterval(state.timerId);
      $('stepDates').hidden = true;
      $('stepPads').hidden = true;
      $('stepForm').hidden = true;
      $('stepThanks').hidden = false;
      $('thanksText').textContent = I18n.t('thanks');
      $('bookingNumber').textContent = res.bookingNumber;
      $('manageLink').href = res.manageUrl || ('booking.html?t=' + encodeURIComponent(res.magicToken));
      $('manageLink').textContent = I18n.t('manage');
    }).catch(function (err) {
      $('btnSubmit').disabled = false;
      showErr('errForm', err.message || I18n.t('error'));
    });
  });

  ensureConfig().then(function () {
    applyI18n();
  }).catch(function (err) {
    applyI18n();
    showErr('errDates', err.message || I18n.t('error'));
  });
})();
