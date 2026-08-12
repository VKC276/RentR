/**
 * Pricing engine — days inclusive of start and end.
 */

function calcDays_(startDate, endDate) {
  var s = parseYmd_(startDate);
  var e = parseYmd_(endDate);
  if (!s || !e || e < s) throw softError_('Ogiltigt datumintervall', 400);
  var ms = e.getTime() - s.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function parseYmd_(ymd) {
  var m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatYmd_(d) {
  var m = d.getMonth() + 1;
  var day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

function eachDate_(startDate, endDate, fn) {
  var d = parseYmd_(startDate);
  var end = parseYmd_(endDate);
  if (!d || !end) return;
  while (d <= end) {
    fn(formatYmd_(d));
    d.setDate(d.getDate() + 1);
  }
}

// Dates are stored as YYYY-MM-DD, so plain string comparison orders them.
function minDate_(a, b) { return String(a) < String(b) ? String(a) : String(b); }
function maxDate_(a, b) { return String(a) > String(b) ? String(a) : String(b); }

function datesOverlap_(aStart, aEnd, bStart, bEnd) {
  var as = parseYmd_(aStart).getTime();
  var ae = parseYmd_(aEnd).getTime();
  var bs = parseYmd_(bStart).getTime();
  var be = parseYmd_(bEnd).getTime();
  return as <= be && bs <= ae;
}

function getActivePricingRules_() {
  return readAllObjects_(SHEET_NAMES.PricingRules).filter(function (r) {
    return r.active === true || r.active === 'true';
  });
}

function bestRule_(rules, dimension, value) {
  var best = null;
  rules.forEach(function (r) {
    if (r.dimension !== dimension) return;
    var min = Number(r.minValue);
    if (value >= min) {
      if (!best || Number(r.minValue) > Number(best.minValue)) best = r;
    }
  });
  return best;
}

function calculatePrice_(padIds, startDate, endDate) {
  var days = calcDays_(startDate, endDate);
  var defaultPrice = Number(getConfig_('defaultPricePerDay', '150'));
  var pads = readAllObjects_(SHEET_NAMES.Pads);
  var padMap = {};
  pads.forEach(function (p) { padMap[p.id] = p; });

  var perDaySum = 0;
  var padLines = [];
  (padIds || []).forEach(function (pid) {
    var pad = padMap[pid];
    if (!pad || (pad.active === false || pad.active === 'false')) {
      throw softError_('Ogiltig utrustning: ' + pid, 400);
    }
    var price = Number(pad.pricePerDay);
    if (!price || isNaN(price)) price = defaultPrice;
    perDaySum += price;
    padLines.push({ padId: pid, name: pad.name, pricePerDay: price });
  });

  if (!padLines.length) throw softError_('Välj utrustning att boka', 400);

  var base = perDaySum * days;
  var rules = getActivePricingRules_();
  var dayRule = bestRule_(rules, 'days', days);
  var padRule = bestRule_(rules, 'pads', padLines.length);

  var afterDays = base;
  var dayPct = dayRule ? Number(dayRule.percentOff) : 0;
  if (dayPct) afterDays = base * (1 - dayPct / 100);

  var afterPads = afterDays;
  var padPct = padRule ? Number(padRule.percentOff) : 0;
  if (padPct) afterPads = afterDays * (1 - padPct / 100);

  var discount = Math.round((base - afterPads) * 100) / 100;
  var total = Math.round(afterPads * 100) / 100;

  return {
    days: days,
    currency: getConfig_('currency', 'SEK'),
    padLines: padLines,
    priceBase: Math.round(base * 100) / 100,
    priceDiscount: discount,
    priceTotal: total,
    discounts: {
      days: dayRule ? { minValue: Number(dayRule.minValue), percentOff: dayPct, label: dayRule.label } : null,
      pads: padRule ? { minValue: Number(padRule.minValue), percentOff: padPct, label: padRule.label } : null
    },
    explanation: {
      inclusive: true,
      startDate: startDate,
      endDate: endDate,
      days: days
    }
  };
}

/**
 * How many bookings still reserve each pad and have not run out. The admin list
 * shows this before deactivating, so taking a resource out of circulation is
 * never a surprise.
 */
function openBookingsByPad_() {
  var today = todayYmd_();
  var openBookings = {};
  readAllObjects_(SHEET_NAMES.Bookings).forEach(function (b) {
    if (BLOCKING_STATUSES[b.status] && String(b.endDate) >= today) openBookings[b.id] = true;
  });
  var counts = {};
  readAllObjects_(SHEET_NAMES.BookingPads).forEach(function (bp) {
    if (openBookings[bp.bookingId]) counts[bp.padId] = (counts[bp.padId] || 0) + 1;
  });
  return counts;
}

function listPadsAdmin_() {
  var counts = openBookingsByPad_();
  return readAllObjects_(SHEET_NAMES.Pads).sort(function (a, b) {
    return Number(a.sortOrder) - Number(b.sortOrder);
  }).map(function (p) {
    // The sheet gives back either a checkbox boolean or the text; the admin
    // page should not have to know which.
    p.active = p.active === true || p.active === 'true';
    p.openBookings = counts[p.id] || 0;
    return p;
  });
}

/** A price nobody could have meant, so a slip of the keyboard is caught here. */
var MAX_PRICE_PER_DAY = 100000;

function parsePricePerDay_(value) {
  var price = Number(value);
  if (value === '' || value === null || typeof value === 'undefined' ||
      !isFinite(price) || price < 0 || price > MAX_PRICE_PER_DAY) {
    throw softError_('Pris per dygn måste vara ett tal mellan 0 och ' + MAX_PRICE_PER_DAY, 400);
  }
  return price;
}

/** Keeps the seeded pad-01… ids going, skipping any number already in use. */
function nextPadId_(pads) {
  var taken = {};
  var highest = 0;
  pads.forEach(function (p) {
    taken[String(p.id)] = true;
    var m = String(p.id).match(/^pad-(\d+)$/);
    if (m) highest = Math.max(highest, Number(m[1]));
  });
  var id;
  do {
    highest++;
    id = 'pad-' + pad(highest, 2);
  } while (taken[id]);
  return id;
}

function createPad_(payload, actor) {
  var name = String(payload.name || '').trim();
  if (!name) throw softError_('Namn krävs', 400);
  var price = parsePricePerDay_(payload.pricePerDay);

  var pads = readAllObjects_(SHEET_NAMES.Pads);
  var lastOrder = 0;
  pads.forEach(function (p) {
    var order = Number(p.sortOrder);
    if (isFinite(order)) lastOrder = Math.max(lastOrder, order);
  });

  var row = {
    id: nextPadId_(pads),
    name: name,
    description: String(payload.description || '').trim(),
    pricePerDay: price,
    active: true,
    sortOrder: lastOrder + 1
  };
  appendObject_(SHEET_NAMES.Pads, row);
  logEvent_(row.id, 'pad_created', actor.email, { name: row.name, pricePerDay: row.pricePerDay });
  return row;
}

/**
 * Removing a resource means deactivating it. BookingPads refers to this id, so
 * deleting the row would leave past bookings unable to name what was rented.
 * activePads_ is what the guest calendar and availability are built from, so
 * dropping out of it is enough to take the resource off the market — and the
 * write bumps the data version, which clears the cached answers.
 */
function setPadActive_(padId, active, actor) {
  var padRow = findById_(SHEET_NAMES.Pads, padId);
  if (!padRow) throw softError_('Utrustning saknas', 404);
  var next = active === true || active === 'true';
  updateObjectById_(SHEET_NAMES.Pads, padId, { active: next });
  logEvent_(padId, next ? 'pad_activated' : 'pad_deactivated', actor.email, { name: padRow.name });
  return listPadsAdmin_().filter(function (p) { return p.id === padId; })[0];
}

function updatePad_(padId, payload) {
  var pad = findById_(SHEET_NAMES.Pads, padId);
  if (!pad) throw softError_('Pad saknas', 404);
  var patch = {};
  ['name', 'description', 'pricePerDay', 'active', 'sortOrder'].forEach(function (k) {
    if (typeof payload[k] !== 'undefined') patch[k] = payload[k];
  });
  if (typeof patch.pricePerDay !== 'undefined') patch.pricePerDay = parsePricePerDay_(patch.pricePerDay);
  updateObjectById_(SHEET_NAMES.Pads, padId, patch);
  return findById_(SHEET_NAMES.Pads, padId);
}

function listPricingRulesAdmin_() {
  return readAllObjects_(SHEET_NAMES.PricingRules);
}

function savePricingRule_(payload) {
  if (payload.id) {
    var existing = findById_(SHEET_NAMES.PricingRules, payload.id);
    if (!existing) throw softError_('Regel saknas', 404);
    updateObjectById_(SHEET_NAMES.PricingRules, payload.id, {
      dimension: payload.dimension,
      minValue: payload.minValue,
      percentOff: payload.percentOff,
      active: payload.active !== false,
      label: payload.label || ''
    });
    return findById_(SHEET_NAMES.PricingRules, payload.id);
  }
  var row = {
    id: uid_(),
    dimension: payload.dimension,
    minValue: payload.minValue,
    percentOff: payload.percentOff,
    active: payload.active !== false,
    label: payload.label || ''
  };
  appendObject_(SHEET_NAMES.PricingRules, row);
  return row;
}

function deletePricingRule_(id) {
  if (!deleteRowById_(SHEET_NAMES.PricingRules, id)) throw softError_('Regel saknas', 404);
  return { ok: true };
}
