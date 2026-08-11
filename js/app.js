(function () {
  var state = {
    config: null,
    startDate: '',
    endDate: '',
    selected: [],
    hold: null,
    timerId: null,
    month: null,
    pads: [],
    // 'YYYY-MM-DD' -> { padIndex: true }, merged across every month loaded.
    blocked: {},
    loadedMonths: {}
  };

  var $ = function (id) { return document.getElementById(id); };

  var BCP47 = { sv: 'sv-SE', en: 'en-GB', de: 'de-DE' };

  function locale() {
    return BCP47[I18n.getLocale()] || 'sv-SE';
  }

  function ymd(d) {
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  function monthKey(d) {
    return ymd(d).slice(0, 7);
  }

  // Bare 'YYYY-MM-DD' parses as UTC, which lands on the previous day west of
  // Greenwich, so dates are always built in local time.
  function parseYmd(s) {
    return new Date(s + 'T00:00:00');
  }

  function eachDate(startDate, endDate, fn) {
    var d = parseYmd(startDate);
    var end = parseYmd(endDate);
    while (d <= end) {
      fn(ymd(d));
      d.setDate(d.getDate() + 1);
    }
  }

  function applyI18n() {
    I18n.renderLangSwitcher($('lang'));
    $('brand').textContent = (state.config && state.config.appName) || I18n.t('appName');
    $('navFind').textContent = I18n.t('find');
    $('titleBook').textContent = I18n.t('book');
    $('legFree').textContent = I18n.t('legendFree');
    $('legTaken').textContent = I18n.t('legendTaken');
    $('btnClearDates').textContent = I18n.t('clearDates');
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
    renderCalendar();
    updateDaysHint();
    updatePriceBox();
  }

  window.onLocaleChange = applyI18n;

  function updateDaysHint() {
    var hint = $('daysHint');
    if (!state.startDate) { hint.textContent = I18n.t('pickStart'); return; }
    if (!state.endDate) { hint.textContent = I18n.t('pickEnd'); return; }
    var days = Pricing.calcDays(state.startDate, state.endDate);
    hint.textContent = I18n.t('daysExplain', {
      start: state.startDate, end: state.endDate, days: days
    });
  }

  function showErr(id, msg) {
    var el = $(id);
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function useConfig(cfg) {
    state.config = cfg;
    $('brand').textContent = cfg.appName || I18n.t('appName');
  }

  function absorbCalendar(cal) {
    state.pads = cal.pads || [];
    (cal.days || []).forEach(function (d) {
      var set = {};
      (d.blocked || []).forEach(function (i) { set[i] = true; });
      state.blocked[d.date] = set;
    });
    state.loadedMonths[cal.from.slice(0, 7)] = true;
  }

  /**
   * A month of per-day availability arrives in one request, which is what lets
   * the range selection recolour instantly instead of asking the server again.
   */
  function loadMonth(date) {
    var key = monthKey(date);
    if (state.loadedMonths[key]) return Promise.resolve();
    var from = new Date(date.getFullYear(), date.getMonth(), 1);
    var to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return Api.call('getCalendar', { from: ymd(from), to: ymd(to) }).then(function (res) {
      if (res.config) {
        useConfig(res.config);
        Api.cacheConfig(res.config);
      }
      absorbCalendar(res.calendar);
    });
  }

  function ensureMonths(startDate, endDate) {
    var pending = [];
    var d = parseYmd(startDate.slice(0, 7) + '-01');
    var last = parseYmd(endDate.slice(0, 7) + '-01');
    while (d <= last) {
      if (!state.loadedMonths[monthKey(d)]) pending.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
    return Promise.all(pending.map(loadMonth));
  }

  function renderCalendar() {
    var grid = $('calendar');
    if (!state.month) { grid.innerHTML = ''; return; }

    var year = state.month.getFullYear();
    var month = state.month.getMonth();
    $('calMonth').textContent = new Intl.DateTimeFormat(locale(), {
      month: 'long', year: 'numeric'
    }).format(state.month);

    var html = '';
    var dowFmt = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    for (var w = 0; w < 7; w++) {
      // 2024-01-01 was a Monday, so this walks Monday-first weekday names.
      html += '<div class="cal-dow">' + escapeHtml(dowFmt.format(new Date(2024, 0, 1 + w))) + '</div>';
    }

    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;
    for (var b = 0; b < lead; b++) html += '<div class="cal-day blank"></div>';

    var today = ymd(new Date());
    var total = new Date(year, month + 1, 0).getDate();
    for (var day = 1; day <= total; day++) {
      html += dayCell(ymd(new Date(year, month, day)), day, today);
    }
    grid.innerHTML = html;
  }

  function dayCell(date, dayNum, today) {
    var taken = state.blocked[date] || {};
    var free = 0;
    var dots = state.pads.map(function (p, i) {
      if (!taken[i]) free++;
      return '<i class="' + (taken[i] ? 'taken' : '') + '" title="' + escapeHtml(p.name) + '"></i>';
    }).join('');

    var cls = ['cal-day'];
    if (date < today) cls.push('past');
    else if (state.pads.length && free === 0) cls.push('full');
    if (state.startDate && state.endDate && date > state.startDate && date < state.endDate) cls.push('in-range');
    if (date === state.startDate) cls.push('range-start');
    if (date === state.endDate) cls.push('range-end');

    return '<div class="' + cls.join(' ') + '" data-date="' + date + '"' +
      ' aria-label="' + date + ': ' + free + '/' + state.pads.length + '">' +
      '<span class="dnum">' + dayNum + '</span>' +
      '<div class="cal-pads">' + dots + '</div></div>';
  }

  /**
   * A pad is bookable for the period only if it is free on every single day of
   * it, which the calendar data already tells us without another request.
   */
  function padsForRange(startDate, endDate) {
    var busy = {};
    eachDate(startDate, endDate, function (date) {
      var taken = state.blocked[date] || {};
      Object.keys(taken).forEach(function (i) { busy[i] = true; });
    });
    return state.pads.map(function (p, i) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pricePerDay: p.pricePerDay,
        available: !busy[i]
      };
    });
  }

  function selectDate(date) {
    if (!state.startDate || state.endDate || date < state.startDate) {
      state.startDate = date;
      state.endDate = '';
    } else {
      state.endDate = date;
    }

    $('btnClearDates').hidden = !state.startDate;
    renderCalendar();
    updateDaysHint();

    if (!state.endDate) {
      $('stepPads').hidden = true;
      $('stepForm').hidden = true;
      return;
    }

    showErr('errDates');
    ensureMonths(state.startDate, state.endDate).then(function () {
      renderCalendar();
      $('stepPads').hidden = false;
      $('stepForm').hidden = true;
      var pads = padsForRange(state.startDate, state.endDate);
      renderPads(pads);
      var anyFree = pads.some(function (p) { return p.available; });
      if (!anyFree) showErr('errPads', I18n.t('noneAvailable'));
      updatePriceBox();
      window.scrollTo({ top: $('stepPads').offsetTop - 20, behavior: 'smooth' });
    }).catch(function (err) {
      showErr('errDates', err.message || I18n.t('error'));
    });
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

  $('calendar').addEventListener('click', function (ev) {
    var cell = ev.target.closest('.cal-day');
    if (!cell || cell.classList.contains('blank') || cell.classList.contains('past')) return;
    selectDate(cell.getAttribute('data-date'));
  });

  function stepMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    renderCalendar();
    $('calendar').classList.add('cal-loading');
    loadMonth(state.month).then(function () {
      renderCalendar();
    }).catch(function (err) {
      showErr('errDates', err.message || I18n.t('error'));
    }).then(function () {
      $('calendar').classList.remove('cal-loading');
    });
  }

  $('calPrev').addEventListener('click', function () { stepMonth(-1); });
  $('calNext').addEventListener('click', function () { stepMonth(1); });

  $('btnClearDates').addEventListener('click', function () {
    state.startDate = '';
    state.endDate = '';
    state.selected = [];
    $('btnClearDates').hidden = true;
    $('stepPads').hidden = true;
    $('stepForm').hidden = true;
    renderCalendar();
    updateDaysHint();
  });

  $('btnHold').addEventListener('click', function () {
    showErr('errPads');
    if (!state.selected.length) return;
    // An earlier hold of ours would otherwise block the pads we are re-picking.
    var prev = state.hold;
    state.hold = null;
    var work = (prev
      ? Api.call('releaseHold', { holdToken: prev.holdToken }).catch(function () {})
      : Promise.resolve()
    ).then(function () {
      return Api.call('createHold', {
        padIds: state.selected,
        startDate: state.startDate,
        endDate: state.endDate
      });
    });

    Status.button($('btnHold'), I18n.t('busyHold'), work).then(function (hold) {
      state.hold = hold;
      $('stepForm').hidden = false;
      $('btnSubmit').disabled = false;
      startTimer(hold.expiresAt);
      updatePriceBox();
      window.scrollTo({ top: $('stepForm').offsetTop - 20, behavior: 'smooth' });
    }).catch(function (err) {
      showErr('errPads', err.message || I18n.t('error'));
    });
  });

  $('btnCancelHold').addEventListener('click', function () {
    if (state.hold) {
      Status.button(
        $('btnCancelHold'),
        I18n.t('busyRelease'),
        Api.call('releaseHold', { holdToken: state.hold.holdToken })
      ).catch(function () {});
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
    Status.button($('btnSubmit'), I18n.t('busySubmit'), Api.call('submitBooking', payload)).then(function (res) {
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
      showErr('errForm', err.message || I18n.t('error'));
    });
  });

  var cached = Api.getCachedConfig();
  if (cached) useConfig(cached);
  state.month = new Date();
  state.month.setDate(1);
  applyI18n();

  Status.during(I18n.t('busyCalendar'), loadMonth(state.month)).then(function () {
    renderCalendar();
  }).catch(function (err) {
    showErr('errDates', err.message || I18n.t('error'));
  });
})();
