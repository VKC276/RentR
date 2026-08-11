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
      throw softError_('Ogiltig crashpad: ' + pid, 400);
    }
    var price = Number(pad.pricePerDay);
    if (!price || isNaN(price)) price = defaultPrice;
    perDaySum += price;
    padLines.push({ padId: pid, name: pad.name, pricePerDay: price });
  });

  if (!padLines.length) throw softError_('Välj minst en crashpad', 400);

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

function listPadsAdmin_() {
  return readAllObjects_(SHEET_NAMES.Pads).sort(function (a, b) {
    return Number(a.sortOrder) - Number(b.sortOrder);
  });
}

function updatePad_(padId, payload) {
  var pad = findById_(SHEET_NAMES.Pads, padId);
  if (!pad) throw softError_('Pad saknas', 404);
  var patch = {};
  ['name', 'description', 'pricePerDay', 'active', 'sortOrder'].forEach(function (k) {
    if (typeof payload[k] !== 'undefined') patch[k] = payload[k];
  });
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
