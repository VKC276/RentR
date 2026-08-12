/**
 * Availability for date ranges, and the conflict check every write path runs
 * before it reserves equipment.
 */

/**
 * CancelPending is kept because rows from the old flow, where an admin had to
 * approve a cancellation, must keep reserving their dates until someone decides
 * what to do with them. A guest cancellation now writes Cancelled directly.
 */
var BLOCKING_STATUSES = {
  Requested: true,
  Approved: true,
  ChangePending: true,
  CancelPending: true,
  HandedOut: true
};

function parsePadIds_(value) {
  var list = Array.isArray(value)
    ? value.map(String)
    : String(value || '').split(',').map(function (s) { return s.trim(); });
  var seen = {};
  return list.filter(function (id) {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

/**
 * A check that says a pad is free is only worth anything if nobody can take it
 * between the answer and the write that acts on it. Two guests submitting the
 * same pad in the same second would otherwise both be told it was free, and
 * both get a booking, with neither of them seeing the collision message.
 *
 * The lock is script-wide: guests are anonymous, and what must not be handed
 * out twice is the equipment in the one shared spreadsheet.
 *
 * 15 seconds is chosen against the client's 30-second request timeout — long
 * enough to queue behind a few submissions, short enough that the wait plus the
 * writes still fit inside one request.
 */
var PAD_LOCK_WAIT_MS = 15000;
var padLockHeld_ = false;

function withPadLock_(work) {
  // A nested call must not take the lock again: the inner release would drop
  // the outer guard while its writes were still to come. No path nests today,
  // and this keeps it that way if one ever does.
  if (padLockHeld_) return work();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PAD_LOCK_WAIT_MS)) {
    throw softError_('Systemet är upptaget just nu. Ingenting bokades — försök igen om en stund.', 503, 'systemBusy');
  }
  padLockHeld_ = true;
  try {
    // Rows read before the lock describe the spreadsheet as it was before
    // whoever we just waited for wrote theirs, so the check inside has to read
    // the sheet again rather than answer from this request's memo.
    forgetTable_(SHEET_NAMES.Bookings);
    forgetTable_(SHEET_NAMES.BookingPads);
    return work();
  } finally {
    padLockHeld_ = false;
    lock.releaseLock();
  }
}

/**
 * Nothing reserves equipment between picking it and sending the request, so
 * this is the only thing standing between two guests who chose the same pad.
 * Every caller must run it inside withPadLock_, before its first write.
 *
 * The unavailable pads travel to the client as data rather than as a finished
 * sentence: the guest pages are read in three languages and build their own.
 */
function assertPadsAvailable_(padIds, startDate, endDate, ignoreBookingId) {
  var taken = findUnavailablePadIds_(padIds, startDate, endDate, ignoreBookingId);
  if (!taken.length) return;
  var pads = describePads_(taken);
  var names = pads.map(function (p) { return p.name; }).join(', ');
  throw softError_(
    'Inte längre ledig för valt intervall: ' + names,
    409,
    'padsUnavailable',
    { unavailablePads: pads }
  );
}

/** Ids of the requested pads that a blocking booking already occupies. */
function findUnavailablePadIds_(padIds, startDate, endDate, ignoreBookingId) {
  var wanted = {};
  padIds.forEach(function (id) { wanted[String(id)] = true; });

  var padsByBooking = {};
  readAllObjects_(SHEET_NAMES.BookingPads).forEach(function (bp) {
    var list = padsByBooking[bp.bookingId] || (padsByBooking[bp.bookingId] = []);
    list.push(String(bp.padId));
  });

  var taken = {};
  readAllObjects_(SHEET_NAMES.Bookings).forEach(function (b) {
    if (ignoreBookingId && b.id === ignoreBookingId) return;
    if (!BLOCKING_STATUSES[b.status]) return;
    if (!datesOverlap_(b.startDate, b.endDate, startDate, endDate)) return;
    (padsByBooking[b.id] || []).forEach(function (pid) {
      if (wanted[pid]) taken[pid] = true;
    });
  });

  // Keep the order the guest picked them in, so the sentence reads the same way
  // the selection looked.
  return padIds.map(String).filter(function (id) { return taken[id]; });
}

/** Pairs pad ids with their names, falling back to the id for a deleted pad. */
function describePads_(padIds) {
  var names = {};
  readAllObjects_(SHEET_NAMES.Pads).forEach(function (p) {
    names[String(p.id)] = p.name;
  });
  return padIds.map(function (id) {
    return { id: String(id), name: names[String(id)] || String(id) };
  });
}

/**
 * Cached answers are keyed on a data version that every write bumps, so a new
 * booking is visible on the next request and the TTL is only a backstop for a
 * version that fell out of cache.
 */
function getAvailability_(startDate, endDate) {
  calcDays_(startDate, endDate); // validate before caching on the key
  return cachedResult_('avail_' + startDate + '_' + endDate, function () {
    return computeAvailability_(startDate, endDate);
  });
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
  return cachedResult_('cal_' + from + '_' + to, function () {
    return computeCalendar_(from, to);
  });
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
    appName: getConfig_('appName', APP_NAME),
    currency: getConfig_('currency', 'SEK'),
    defaultPricePerDay: Number(getConfig_('defaultPricePerDay', '150')),
    pagesBaseUrl: getConfig_('pagesBaseUrl', ''),
    pads: pads,
    pricingRules: rules
  };
}
