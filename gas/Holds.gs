/**
 * 15-minute hold locks for selected pads.
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

/**
 * Tidies lapsed rows in one column write. Row-by-row updates put a Sheets round
 * trip per stale hold in front of the guest who is trying to book, and the
 * common case — nothing to expire — now writes nothing at all.
 */
function expireHolds_() {
  var holds = readAllObjects_(SHEET_NAMES.Holds);
  var now = Date.now();
  var rows = [];
  holds.forEach(function (h) {
    if (h.status === 'active' && new Date(h.expiresAt).getTime() < now) rows.push(h._row);
  });
  if (!rows.length) return;

  var column = HEADERS[SHEET_NAMES.Holds].indexOf('status') + 1;
  var firstRow = Math.min.apply(null, rows);
  var lastRow = Math.max.apply(null, rows);
  var range = getSheet_(SHEET_NAMES.Holds).getRange(firstRow, column, lastRow - firstRow + 1, 1);
  var values = range.getValues();
  rows.forEach(function (r) { values[r - firstRow][0] = 'expired'; });
  range.setValues(values);
  invalidateTable_(SHEET_NAMES.Holds);
}

function parsePadIds_(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * replaceHoldToken lets a guest who changed their pad selection swap holds in a
 * single request; releasing first would cost an extra round trip, and the old
 * hold must be ignored while checking so it cannot conflict with itself.
 */
function createHold_(padIds, startDate, endDate, replaceHoldToken) {
  expireHolds_();
  calcDays_(startDate, endDate); // validate
  padIds = (padIds || []).map(String);
  if (!padIds.length) throw softError_('Välj utrustning att boka', 400);

  if (replaceHoldToken) releaseHold_(replaceHoldToken);
  assertPadsAvailable_(padIds, startDate, endDate, null, replaceHoldToken || null);

  var minutes = Number(getConfig_('holdMinutes', '15'));
  var hold = {
    id: uid_(),
    holdToken: randomHex_(24),
    padIds: padIds.join(','),
    startDate: startDate,
    endDate: endDate,
    expiresAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    status: 'active',
    createdAt: nowIso_()
  };
  appendObject_(SHEET_NAMES.Holds, hold);
  return {
    holdToken: hold.holdToken,
    expiresAt: hold.expiresAt,
    holdMinutes: minutes,
    padIds: padIds,
    startDate: startDate,
    endDate: endDate
  };
}

function releaseHold_(holdToken) {
  var hold = findHoldByToken_(holdToken);
  if (!hold) return { ok: true };
  if (hold.status === 'active') {
    updateObjectById_(SHEET_NAMES.Holds, hold.id, { status: 'released' });
  }
  return { ok: true };
}

function findHoldByToken_(token) {
  if (!token) return null;
  var holds = readAllObjects_(SHEET_NAMES.Holds);
  for (var i = 0; i < holds.length; i++) {
    if (String(holds[i].holdToken) === String(token)) return holds[i];
  }
  return null;
}

function requireActiveHold_(holdToken) {
  var hold = findHoldByToken_(holdToken);
  if (!hold || hold.status !== 'active') throw softError_('Hold ogiltig eller utgången', 400);
  if (new Date(hold.expiresAt).getTime() < Date.now()) {
    updateObjectById_(SHEET_NAMES.Holds, hold.id, { status: 'expired' });
    throw softError_('Hold utgången — välj om', 400);
  }
  return hold;
}

/**
 * Expiry is decided from expiresAt, so this needs no sheet write. Marking rows
 * expired here made every availability check a write request; expireHolds_ now
 * only runs on write paths, purely to keep the tab tidy.
 */
function getActiveHolds_() {
  return readAllObjects_(SHEET_NAMES.Holds).filter(function (h) {
    return h.status === 'active' && new Date(h.expiresAt).getTime() >= Date.now();
  });
}

/**
 * Every write bumps the data version, so a cached availability answer can only
 * go stale on its own when a hold lapses by the clock. Cache until that moment,
 * which in practice means the full TTL because holds are rare and short-lived.
 */
function holdAwareTtl_() {
  var now = Date.now();
  var soonest = 0;
  getActiveHolds_().forEach(function (h) {
    var ms = new Date(h.expiresAt).getTime() - now;
    if (ms > 0 && (!soonest || ms < soonest)) soonest = ms;
  });
  if (!soonest) return RESULT_TTL_SEC;
  return Math.max(5, Math.min(RESULT_TTL_SEC, Math.ceil(soonest / 1000)));
}

function assertPadsAvailable_(padIds, startDate, endDate, ignoreBookingId, ignoreHoldToken) {
  var conflicts = findConflicts_(padIds, startDate, endDate, ignoreBookingId, ignoreHoldToken || null);
  if (conflicts.length) {
    throw softError_('Vald utrustning är inte ledig för valt intervall', 409);
  }
}

function findConflicts_(padIds, startDate, endDate, ignoreBookingId, ignoreHoldToken) {
  var conflicts = [];
  var bookings = readAllObjects_(SHEET_NAMES.Bookings);
  var bookingPads = readAllObjects_(SHEET_NAMES.BookingPads);
  var padsByBooking = {};
  bookingPads.forEach(function (bp) {
    if (!padsByBooking[bp.bookingId]) padsByBooking[bp.bookingId] = [];
    padsByBooking[bp.bookingId].push(String(bp.padId));
  });

  bookings.forEach(function (b) {
    if (ignoreBookingId && b.id === ignoreBookingId) return;
    if (!BLOCKING_STATUSES[b.status]) return;
    if (!datesOverlap_(b.startDate, b.endDate, startDate, endDate)) return;
    var bPads = padsByBooking[b.id] || [];
    padIds.forEach(function (pid) {
      if (bPads.indexOf(String(pid)) >= 0) {
        conflicts.push({ type: 'booking', bookingId: b.id, padId: pid });
      }
    });
  });

  getActiveHolds_().forEach(function (h) {
    if (ignoreHoldToken && h.holdToken === ignoreHoldToken) return;
    if (!datesOverlap_(h.startDate, h.endDate, startDate, endDate)) return;
    var hPads = parsePadIds_(h.padIds);
    padIds.forEach(function (pid) {
      if (hPads.indexOf(String(pid)) >= 0) {
        conflicts.push({ type: 'hold', holdId: h.id, padId: pid });
      }
    });
  });

  return conflicts;
}
