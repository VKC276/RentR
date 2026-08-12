(function () {
  var state = {
    config: null,
    startDate: '',
    endDate: '',
    selected: [],
    // Pads the server refused on the last submit, kept so the message can be
    // rebuilt when the guest switches language.
    conflictPads: null,
    month: null,
    pads: [],
    // 'YYYY-MM-DD' -> { padIndex: true }, merged across every month loaded.
    blocked: {},
    loadedMonths: {},
    fetchedMonths: {}
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
    $('brand').textContent = I18n.t('appName');
    $('navFind').textContent = I18n.t('find');
    $('titleBook').textContent = I18n.t('book');
    $('legFree').textContent = I18n.t('legendFree');
    $('legTaken').textContent = I18n.t('legendTaken');
    $('btnClearDates').textContent = I18n.t('clearDates');
    $('titlePads').textContent = I18n.t('available');
    $('btnContinue').textContent = I18n.t('continue');
    $('titleForm').textContent = I18n.t('details');
    $('lblFirst').textContent = I18n.t('firstName');
    $('lblLast').textContent = I18n.t('lastName');
    $('lblEmail').textContent = I18n.t('email');
    $('lblPhone').textContent = I18n.t('phone');
    $('lblNotes').textContent = I18n.t('notes');
    $('btnBackToPads').textContent = I18n.t('back');
    $('btnSubmit').textContent = I18n.t('submit');
    $('payNote').textContent = I18n.t('payNote');
    $('thanksTitle').textContent = I18n.t('thanks');
    $('lblBookingNo').textContent = I18n.t('bookingNo');
    renderConflict();
    renderCalendar();
    // The pad cards carry translated text too, and they are built by hand
    // rather than from a table of element ids.
    if (!$('stepPads').hidden && state.startDate && state.endDate) {
      renderPads(padsForRange(state.startDate, state.endDate), state.selected.slice());
    }
    updateDateSummary();
    updatePriceBox();
  }

  window.onLocaleChange = applyI18n;

  /** The year only earns its space when the booking is not in the current one. */
  function fmtDate(date) {
    var d = parseYmd(date);
    var opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return new Intl.DateTimeFormat(locale(), opts).format(d);
  }

  function dayCount(days) {
    return days + ' ' + I18n.t(days === 1 ? 'dayUnitOne' : 'dayUnitMany');
  }

  /** Says what the next click on the calendar will do, and nothing else. */
  function updateDatePrompt() {
    var done = !!(state.startDate && state.endDate);
    var step = state.startDate ? 2 : 1;
    $('calPrompt').classList.toggle('is-done', done);
    $('calPromptStep').textContent = done ? '✓' : String(step);
    $('calPromptStep').setAttribute(
      'aria-label', done ? I18n.t('datesChosen') : I18n.t('stepOfTwo', { n: step })
    );
    $('calPromptTitle').textContent = done
      ? I18n.t('datesChosen')
      : I18n.t(state.startDate ? 'pickEnd' : 'pickStart');
    $('calPromptHint').textContent = I18n.t(done ? 'pickAgainHint' : 'sameDayHint');
  }

  function updateDateSummary() {
    updateDatePrompt();
    var box = $('dateSummary');
    box.hidden = !state.startDate;
    if (!state.startDate) { updateSummaryPrice(); return; }
    $('dsStartLabel').textContent = I18n.t('start');
    $('dsEndLabel').textContent = I18n.t('end');
    $('dsStart').textContent = fmtDate(state.startDate);
    $('dsEnd').textContent = state.endDate ? fmtDate(state.endDate) : I18n.t('endPending');
    $('dsEndLeg').classList.toggle('is-pending', !state.endDate);
    $('dsDays').hidden = !state.endDate;
    if (state.endDate) {
      $('dsDays').textContent = dayCount(Pricing.calcDays(state.startDate, state.endDate));
    }
    $('dsNote').textContent = I18n.t(
      state.startDate === state.endDate ? 'singleDayNote' : 'fullDaysNote'
    );
    updateSummaryPrice();
  }

  function showErr(id, msg) {
    var el = $(id);
    if (!msg) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = msg;
  }

  function scrollToEl(el) {
    var top = el.getBoundingClientRect().top + window.pageYOffset - 20;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /** "A, B och C" — the last separator is a word, and words are translated. */
  function joinNames(names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' ' + I18n.t('listAnd') + ' ' + names[names.length - 1];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // The product name is the same everywhere, so the brand comes from i18n and
  // not from the config the API happens to return.
  function useConfig(cfg) {
    state.config = cfg;
  }

  function padSignature(pads) {
    return (pads || []).map(function (p) { return p.id; }).join(',');
  }

  function absorbCalendar(cal) {
    // blocked holds pad *indexes*, so everything already gathered points at the
    // wrong pads as soon as admin adds or deactivates a resource. The first
    // answer that shows a different set of pads throws the old picture away,
    // stored months included.
    if (state.pads.length && padSignature(cal.pads) !== padSignature(state.pads)) {
      state.blocked = {};
      state.loadedMonths = {};
      state.fetchedMonths = {};
      forgetStoredMonths();
    }
    state.pads = cal.pads || [];
    (cal.days || []).forEach(function (d) {
      var set = {};
      (d.blocked || []).forEach(function (i) { set[i] = true; });
      state.blocked[d.date] = set;
    });
    state.loadedMonths[cal.from.slice(0, 7)] = true;
  }

  var STORE_PREFIX = 'calMonth_';
  var MAX_STALE_MS = 6 * 3600 * 1000;

  function readStoredMonth(key) {
    try {
      var rec = JSON.parse(localStorage.getItem(STORE_PREFIX + key));
      if (!rec || Date.now() - rec.ts > MAX_STALE_MS) return null;
      return rec.calendar;
    } catch (e) { return null; }
  }

  function storeMonth(key, calendar) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify({ ts: Date.now(), calendar: calendar }));
    } catch (e) { /* quota or private mode */ }
  }

  function forgetStoredMonths() {
    try {
      Object.keys(localStorage)
        .filter(function (k) { return k.indexOf(STORE_PREFIX) === 0; })
        .forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* private mode */ }
  }

  /**
   * Paints from the last answer we saw so the month appears at once, and still
   * refreshes behind it. The server rechecks the selection when the request is
   * submitted, so a stale screen can cost the guest a retry but never produce a
   * double booking.
   */
  function primeFromStore(date) {
    var cal = readStoredMonth(monthKey(date));
    // A stored month from before a resource changed would mix its pad indexes
    // with the ones already on screen; leave it and wait for the server.
    if (!cal || (state.pads.length && padSignature(cal.pads) !== padSignature(state.pads))) return false;
    absorbCalendar(cal);
    return true;
  }

  /**
   * A month of per-day availability arrives in one request, which is what lets
   * the range selection recolour instantly instead of asking the server again.
   */
  function loadMonth(date) {
    var key = monthKey(date);
    if (state.fetchedMonths[key]) return Promise.resolve();
    state.fetchedMonths[key] = true;
    var from = new Date(date.getFullYear(), date.getMonth(), 1);
    var to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return Api.call('getCalendar', { from: ymd(from), to: ymd(to) }).then(function (res) {
      if (res.config) {
        useConfig(res.config);
        Api.cacheConfig(res.config);
      }
      absorbCalendar(res.calendar);
      storeMonth(key, res.calendar);
    }).catch(function (err) {
      delete state.fetchedMonths[key];
      throw err;
    });
  }

  function ensureMonths(startDate, endDate) {
    var pending = [];
    var d = parseYmd(startDate.slice(0, 7) + '-01');
    var last = parseYmd(endDate.slice(0, 7) + '-01');
    while (d <= last) {
      if (!state.loadedMonths[monthKey(d)] && !primeFromStore(d)) pending.push(new Date(d));
      d.setMonth(d.getMonth() + 1);
    }
    return Promise.all(pending.map(function (m) { return loadMonth(m); }));
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
    hideConflict();
    if (!state.startDate || state.endDate || date < state.startDate) {
      state.startDate = date;
      state.endDate = '';
    } else {
      state.endDate = date;
    }

    $('btnClearDates').hidden = !state.startDate;
    renderCalendar();
    updateDateSummary();

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

  /**
   * keepIds re-selects what the guest had picked before, which is what makes a
   * refused booking a small correction rather than a restart: only the pad that
   * was lost is missing from the selection afterwards.
   */
  function renderPads(pads, keepIds) {
    var keep = {};
    (keepIds || []).forEach(function (id) { keep[id] = true; });
    var grid = $('padGrid');
    grid.innerHTML = '';
    state.selected = [];
    pads.forEach(function (p) {
      var selected = p.available && !!keep[p.id];
      if (selected) state.selected.push(p.id);
      var div = document.createElement('div');
      div.className = 'pad' + (p.available ? '' : ' unavailable') + (selected ? ' selected' : '');
      div.innerHTML = '<strong>' + escapeHtml(p.name) + '</strong><div class="muted">' +
        escapeHtml(p.available
          ? p.pricePerDay + ' ' + ((state.config && state.config.currency) || 'SEK') + I18n.t('perDay')
          : I18n.t('unavailable')) +
        '</div>';
      if (p.available) {
        div.addEventListener('click', function () {
          var idx = state.selected.indexOf(p.id);
          if (idx >= 0) state.selected.splice(idx, 1);
          else state.selected.push(p.id);
          div.classList.toggle('selected');
          $('btnContinue').disabled = state.selected.length === 0;
          updatePriceBox();
        });
      }
      grid.appendChild(div);
    });
    $('btnContinue').disabled = state.selected.length === 0;
  }

  function currentPrice() {
    if (!state.config || !state.startDate || !state.endDate || !state.selected.length) return null;
    return Pricing.calculatePrice(state.config, state.selected, state.startDate, state.endDate);
  }

  function priceRow(label, value, cls) {
    return '<div class="ds-price-row' + (cls ? ' ' + cls : '') + '">' +
      '<span>' + escapeHtml(label) + '</span>' +
      '<span class="ds-price-val">' + escapeHtml(value) + '</span></div>';
  }

  function priceRows(price) {
    return '<div class="ds-price-list">' +
      priceRow(I18n.t('base'), price.priceBase + ' ' + price.currency) +
      (price.priceDiscount
        ? priceRow(I18n.t('discount'), '−' + price.priceDiscount + ' ' + price.currency, 'is-discount')
        : '') +
      priceRow(I18n.t('total'), price.priceTotal + ' ' + price.currency, 'is-total') +
      '</div>';
  }

  function updateSummaryPrice() {
    var box = $('dsPrice');
    if (!state.startDate || !state.endDate) { box.hidden = true; box.innerHTML = ''; return; }
    var price = currentPrice();
    box.hidden = false;
    box.innerHTML = price
      ? priceRows(price)
      : '<p class="ds-pending muted">' + escapeHtml(I18n.t('priceAfterPads')) + '</p>';
  }

  function updatePriceBox() {
    updateSummaryPrice();
    var box = $('priceBox');
    if (!box) return;
    var price = currentPrice();
    if (!price) { box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="ds-price-head muted">' +
      escapeHtml(fmtDate(state.startDate) + ' – ' + fmtDate(state.endDate) + ' · ' + dayCount(price.days)) +
      '</div>' + priceRows(price);
  }

  function renderConflict() {
    var pads = state.conflictPads;
    var box = $('conflictAlert');
    if (!pads || !pads.length) {
      box.hidden = true;
      return;
    }
    var names = joinNames(pads.map(function (p) { return p.name || p.id; }));
    $('conflictTitle').textContent = I18n.t('conflictTitle');
    $('conflictText').textContent = I18n.t(pads.length === 1 ? 'conflictOne' : 'conflictMany', { pads: names });
    $('conflictHint').textContent = I18n.t('conflictHint');
    box.hidden = false;
  }

  function hideConflict() {
    if (!state.conflictPads) return;
    state.conflictPads = null;
    renderConflict();
  }

  /**
   * Throws away every cached copy of the calendar, on this machine and in the
   * answer the server would otherwise repeat, so the booking that caused the
   * collision is actually visible afterwards.
   */
  function reloadCalendarFresh() {
    forgetStoredMonths();
    state.blocked = {};
    state.loadedMonths = {};
    state.fetchedMonths = {};
    return Promise.all([
      loadMonth(state.month),
      ensureMonths(state.startDate, state.endDate)
    ]);
  }

  /**
   * The guest asked for equipment somebody else got first. Nothing was booked,
   * which the page has to say without any room for doubt, so the form goes away
   * and an alert takes its place next to the choice that has to be made again.
   */
  function showConflict(pads) {
    var keep = state.selected.slice();
    state.conflictPads = pads;
    renderConflict();
    $('stepForm').hidden = true;
    scrollToEl($('conflictAlert'));
    $('conflictAlert').focus({ preventScroll: true });

    Status.during(I18n.t('busyCalendar'), reloadCalendarFresh()).then(function () {
      renderCalendar();
      renderPads(padsForRange(state.startDate, state.endDate), keep);
      updatePriceBox();
    }).catch(function (err) {
      showErr('errPads', err.message || I18n.t('error'));
    });
  }

  $('calendar').addEventListener('click', function (ev) {
    var cell = ev.target.closest('.cal-day');
    if (!cell || cell.classList.contains('blank') || cell.classList.contains('past')) return;
    selectDate(cell.getAttribute('data-date'));
  });

  function stepMonth(delta) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + delta, 1);
    var known = state.loadedMonths[monthKey(state.month)] || primeFromStore(state.month);
    renderCalendar();
    if (!known) $('calendar').classList.add('cal-loading');
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
    hideConflict();
    $('btnClearDates').hidden = true;
    $('stepPads').hidden = true;
    $('stepForm').hidden = true;
    renderCalendar();
    updateDateSummary();
  });

  // Nothing is reserved here any more: the selection is only carried to the
  // form, and the server has the last word when the request is sent.
  $('btnContinue').addEventListener('click', function () {
    showErr('errPads');
    hideConflict();
    if (!state.selected.length) return;
    $('stepForm').hidden = false;
    updatePriceBox();
    scrollToEl($('stepForm'));
  });

  $('btnBackToPads').addEventListener('click', function () {
    showErr('errForm');
    $('stepForm').hidden = true;
    scrollToEl($('stepPads'));
  });

  $('btnSubmit').addEventListener('click', function () {
    showErr('errForm');
    hideConflict();
    if (!state.selected.length || !state.startDate || !state.endDate) return;
    var payload = {
      padIds: state.selected.slice(),
      startDate: state.startDate,
      endDate: state.endDate,
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
      forgetStoredMonths();
      $('stepDates').hidden = true;
      $('stepPads').hidden = true;
      $('stepForm').hidden = true;
      $('stepThanks').hidden = false;
      $('thanksText').textContent = I18n.t('thanks');
      $('bookingNumber').textContent = res.bookingNumber;
      $('manageLink').href = res.manageUrl || ('booking.html?t=' + encodeURIComponent(res.magicToken));
      $('manageLink').textContent = I18n.t('manage');
    }).catch(function (err) {
      var taken = err && err.code === 'padsUnavailable' && err.details && err.details.unavailablePads;
      if (taken && taken.length) {
        showConflict(taken);
        return;
      }
      // Too many submissions at once. The selection is still good, so the form
      // stays as it is and the guest only has to press again.
      if (err && err.code === 'systemBusy') {
        showErr('errForm', I18n.t('tryAgainSoon'));
        return;
      }
      showErr('errForm', err.message || I18n.t('error'));
    });
  });

  var cached = Api.getCachedConfig();
  if (cached) useConfig(cached);
  state.month = new Date();
  state.month.setDate(1);
  var primed = primeFromStore(state.month);
  applyI18n();

  // Only make the user wait when there is nothing to show yet.
  var initial = loadMonth(state.month);
  (primed ? initial : Status.during(I18n.t('busyCalendar'), initial)).then(function () {
    renderCalendar();
  }).catch(function (err) {
    showErr('errDates', err.message || I18n.t('error'));
  });
})();
