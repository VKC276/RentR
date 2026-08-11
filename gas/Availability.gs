/**
 * Availability for date ranges.
 */

function getAvailability_(startDate, endDate) {
  calcDays_(startDate, endDate); // validate before caching on the key
  // Short TTL: a hold lapsing frees a pad without any write to invalidate on.
  return cachedResult_('avail_' + startDate + '_' + endDate, function () {
    return computeAvailability_(startDate, endDate);
  }, 30);
}

function activePads_() {
  var fallbackPrice = Number(getConfig_('defaultPricePerDay', '150'));
  return readAllObjects_(SHEET_NAMES.Pads)
    .filter(function (p) { return p.active === true || p.active === 'true'; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pricePerDay: Number(p.pricePerDay) || fallbackPrice,
        sortOrder: Number(p.sortOrder)
      };
    });
}

/**
 * Which pads are taken on each single day of a period. The booking calendar
 * colours every pad in every date cell from this, and can then work out the
 * availability of any range inside the period without asking again.
 */
function getCalendar_(from, to) {
  calcDays_(from, to);
  // Short TTL: a hold lapsing frees a pad without any write to invalidate on.
  return cachedResult_('cal_' + from + '_' + to, function () {
    return computeCalendar_(from, to);
  }, 30);
}

function computeCalendar_(from, to) {
  var pads = activePads_();
  var padIndex = {};
  pads.forEach(function (p, i) { padIndex[String(p.id)] = i; });

  var blocked = {};

  function block(padIds, startDate, endDate) {
    if (!startDate || !endDate) return;
    if (!datesOverlap_(startDate, endDate, from, to)) return;
    var indices = padIds
      .map(function (id) { return padIndex[String(id)]; })
      .filter(function (i) { return i !== undefined; });
    if (!indices.length) return;
    eachDate_(maxDate_(startDate, from), minDate_(endDate, to), function (date) {
      var day = blocked[date] || (blocked[date] = {});
      indices.forEach(function (i) { day[i] = true; });
    });
  }

  var padsByBooking = {};
  readAllObjects_(SHEET_NAMES.BookingPads).forEach(function (bp) {
    var list = padsByBooking[bp.bookingId] || (padsByBooking[bp.bookingId] = []);
    list.push(bp.padId);
  });

  readAllObjects_(SHEET_NAMES.Bookings).forEach(function (b) {
    if (!BLOCKING_STATUSES[b.status]) return;
    block(padsByBooking[b.id] || [], b.startDate, b.endDate);
  });

  getActiveHolds_().forEach(function (h) {
    block(parsePadIds_(h.padIds), h.startDate, h.endDate);
  });

  var days = [];
  eachDate_(from, to, function (date) {
    var day = blocked[date] || {};
    days.push({
      date: date,
      blocked: Object.keys(day).map(Number).sort(function (a, b) { return a - b; })
    });
  });

  return { from: from, to: to, pads: pads, days: days };
}

function computeAvailability_(startDate, endDate) {
  var pads = activePads_();

  var bookings = readAllObjects_(SHEET_NAMES.Bookings).filter(function (b) {
    return BLOCKING_STATUSES[b.status] && datesOverlap_(b.startDate, b.endDate, startDate, endDate);
  });
  var bookingPads = readAllObjects_(SHEET_NAMES.BookingPads);
  var blocked = {};

  bookings.forEach(function (b) {
    bookingPads.forEach(function (bp) {
      if (bp.bookingId === b.id) blocked[bp.padId] = true;
    });
  });

  getActiveHolds_().forEach(function (h) {
    if (!datesOverlap_(h.startDate, h.endDate, startDate, endDate)) return;
    parsePadIds_(h.padIds).forEach(function (pid) {
      blocked[pid] = true;
    });
  });

  return {
    startDate: startDate,
    endDate: endDate,
    days: calcDays_(startDate, endDate),
    pads: pads.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pricePerDay: p.pricePerDay,
        available: !blocked[p.id]
      };
    })
  };
}

function getPublicConfig_() {
  return cachedResult_('publicConfig', computePublicConfig_);
}

function computePublicConfig_() {
  var pads = activePads_();

  var rules = getActivePricingRules_().map(function (r) {
    return {
      id: r.id,
      dimension: r.dimension,
      minValue: Number(r.minValue),
      percentOff: Number(r.percentOff),
      label: r.label
    };
  });

  return {
    appName: getConfig_('appName', 'Crashpad Booking'),
    currency: getConfig_('currency', 'SEK'),
    holdMinutes: Number(getConfig_('holdMinutes', '15')),
    defaultPricePerDay: Number(getConfig_('defaultPricePerDay', '150')),
    pagesBaseUrl: getConfig_('pagesBaseUrl', ''),
    pads: pads,
    pricingRules: rules
  };
}
