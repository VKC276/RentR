/**
 * 15-minute hold locks for selected pads.
 */

var BLOCKING_STATUSES = {
  Requested: true,
  Approved: true,
  ChangePending: true,
  CancelPending: true,
  HandedOut: true
};

function expireHolds_() {
  var holds = readAllObjects_(SHEET_NAMES.Holds);
  var now = Date.now();
  holds.forEach(function (h) {
    if (h.status !== 'active') return;
    if (new Date(h.expiresAt).getTime() < now) {
      updateObjectById_(SHEET_NAMES.Holds, h.id, { status: 'expired' });
    }
  });
}

function parsePadIds_(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

function createHold_(padIds, startDate, endDate) {
  expireHolds_();
  calcDays_(startDate, endDate); // validate
  padIds = (padIds || []).map(String);
  if (!padIds.length) throw softError_('Välj minst en crashpad', 400);

  assertPadsAvailable_(padIds, startDate, endDate, null);

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
  expireHolds_();
  var hold = findHoldByToken_(holdToken);
  if (!hold || hold.status !== 'active') throw softError_('Hold ogiltig eller utgången', 400);
  if (new Date(hold.expiresAt).getTime() < Date.now()) {
    updateObjectById_(SHEET_NAMES.Holds, hold.id, { status: 'expired' });
    throw softError_('Hold utgången — välj om', 400);
  }
  return hold;
}

function consumeHold_(holdToken) {
  var hold = requireActiveHold_(holdToken);
  updateObjectById_(SHEET_NAMES.Holds, hold.id, { status: 'consumed' });
  return hold;
}

function getActiveHolds_() {
  expireHolds_();
  return readAllObjects_(SHEET_NAMES.Holds).filter(function (h) {
    return h.status === 'active' && new Date(h.expiresAt).getTime() >= Date.now();
  });
}

function assertPadsAvailable_(padIds, startDate, endDate, ignoreBookingId) {
  var conflicts = findConflicts_(padIds, startDate, endDate, ignoreBookingId, null);
  if (conflicts.length) {
    throw softError_('En eller flera crashpads är inte lediga för valt intervall', 409);
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
