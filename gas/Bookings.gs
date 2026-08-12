/**
 * Bookings lifecycle, booking numbers, guest tokens.
 */

function getBookingPads_(bookingId) {
  return readAllObjects_(SHEET_NAMES.BookingPads)
    .filter(function (bp) { return bp.bookingId === bookingId; })
    .map(function (bp) { return bp.padId; });
}

function replaceBookingPads_(bookingId, padIds) {
  var sheet = getSheet_(SHEET_NAMES.BookingPads);
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(bookingId)) sheet.deleteRow(i + 1);
  }
  invalidateTable_(SHEET_NAMES.BookingPads);
  (padIds || []).forEach(function (pid) {
    appendObject_(SHEET_NAMES.BookingPads, { bookingId: bookingId, padId: pid });
  });
}

function createMagicToken_(bookingId) {
  var days = Number(getConfig_('magicLinkDays', '90'));
  var token = randomHex_(32);
  appendObject_(SHEET_NAMES.Tokens, {
    token: token,
    bookingId: bookingId,
    expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
    revoked: false,
    createdAt: nowIso_()
  });
  return token;
}

function resolveMagicToken_(token) {
  if (!token) return null;
  var rows = readAllObjects_(SHEET_NAMES.Tokens);
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    if (String(t.token) !== String(token)) continue;
    if (t.revoked === true || t.revoked === 'true') return null;
    if (new Date(t.expiresAt).getTime() < Date.now()) return null;
    return t;
  }
  return null;
}

function logEvent_(bookingId, type, actor, detail) {
  appendObject_(SHEET_NAMES.BookingEvents, {
    id: uid_(),
    bookingId: bookingId,
    type: type,
    actor: actor || '',
    detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
    at: nowIso_()
  });
}

/**
 * Lookups shared by a whole list of bookings. Building them per booking meant
 * copying the BookingPads and Pads tables once for every row.
 */
function bookingIndex_() {
  var padsByBooking = {};
  readAllObjects_(SHEET_NAMES.BookingPads).forEach(function (bp) {
    var list = padsByBooking[bp.bookingId] || (padsByBooking[bp.bookingId] = []);
    list.push(bp.padId);
  });
  var padMap = {};
  readAllObjects_(SHEET_NAMES.Pads).forEach(function (p) { padMap[p.id] = p; });
  return { padsByBooking: padsByBooking, padMap: padMap };
}

function enrichBooking_(b, index) {
  if (!b) return null;
  index = index || bookingIndex_();
  var padIds = index.padsByBooking[b.id] || [];
  var padMap = index.padMap;
  var priceTotal = b.priceOverride !== '' && b.priceOverride !== null && typeof b.priceOverride !== 'undefined' && String(b.priceOverride) !== ''
    ? Number(b.priceOverride)
    : Number(b.priceTotal);

  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    phone: b.phone,
    startDate: b.startDate,
    endDate: b.endDate,
    days: Number(b.days),
    locale: b.locale || 'sv',
    status: b.status,
    allowSelfPickup: b.allowSelfPickup === true || b.allowSelfPickup === 'true',
    allowSelfReturn: b.allowSelfReturn === true || b.allowSelfReturn === 'true',
    paid: b.paid === true || b.paid === 'true',
    paidAt: b.paidAt || '',
    priceBase: Number(b.priceBase) || 0,
    priceDiscount: Number(b.priceDiscount) || 0,
    priceTotal: priceTotal,
    priceOverride: b.priceOverride === '' ? null : b.priceOverride,
    priceBreakdownJson: b.priceBreakdownJson || '',
    doorOpenedForReturn: b.doorOpenedForReturn === true || b.doorOpenedForReturn === 'true',
    notes: b.notes || '',
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    padIds: padIds,
    pads: padIds.map(function (id) {
      var p = padMap[id];
      return p ? { id: p.id, name: p.name, description: p.description } : { id: id, name: id };
    }),
    openDoor: computeOpenDoorFlags_(b)
  };
}

function computeOpenDoorFlags_(b) {
  var today = todayYmd_();
  var status = b.status;
  var pickup = (b.allowSelfPickup === true || b.allowSelfPickup === 'true') &&
    (status === 'Approved' || status === 'HandedOut') &&
    String(b.startDate) === today;
  var ret = (b.allowSelfReturn === true || b.allowSelfReturn === 'true') &&
    (status === 'HandedOut' || status === 'Approved') &&
    String(b.endDate) === today &&
    status !== 'Returned';
  // After return confirmed, no open door
  if (status === 'Returned') {
    return { showOpenDoor: false, showConfirmReturn: false, mode: null };
  }
  var doorOpenedForReturn = b.doorOpenedForReturn === true || b.doorOpenedForReturn === 'true';
  if (ret && doorOpenedForReturn) {
    return { showOpenDoor: false, showConfirmReturn: true, mode: 'return' };
  }
  if (ret) {
    return { showOpenDoor: true, showConfirmReturn: false, mode: 'return' };
  }
  if (pickup) {
    return { showOpenDoor: true, showConfirmReturn: false, mode: 'pickup' };
  }
  return { showOpenDoor: false, showConfirmReturn: false, mode: null };
}

/**
 * A booking is just a request. Overlaps are allowed here and shown to admins as
 * "Dubbelbokat" so they can reassign equipment — rejecting at submit time only
 * made the guest wait behind a lock for a race that almost never happens.
 *
 * The lock still wraps the counter and the rows: nextBookingNumber_ is a
 * read-modify-write, and two simultaneous submits must not share a number.
 */
function submitBooking_(payload) {
  var padIds = parsePadIds_(payload.padIds);
  var startDate = String(payload.startDate || '');
  var endDate = String(payload.endDate || '');
  if (!padIds.length) throw softError_('Välj utrustning att boka', 400);
  calcDays_(startDate, endDate); // validate the range

  var firstName = String(payload.firstName || '').trim();
  var lastName = String(payload.lastName || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();
  var phone = String(payload.phone || '').trim();
  var locale = ['sv', 'en', 'de'].indexOf(payload.locale) >= 0 ? payload.locale : 'sv';

  if (!firstName || !lastName || !email || !phone) {
    throw softError_('Förnamn, efternamn, e-post och telefon krävs', 400);
  }

  var price = calculatePrice_(padIds, startDate, endDate);

  var created = withPadLock_(function () {
    var bookingNumber = nextBookingNumber_();
    var id = uid_();
    var now = nowIso_();

    appendObject_(SHEET_NAMES.Bookings, {
      id: id,
      bookingNumber: bookingNumber,
      firstName: firstName,
      lastName: lastName,
      email: email,
      phone: phone,
      startDate: startDate,
      endDate: endDate,
      days: price.days,
      locale: locale,
      status: 'Requested',
      allowSelfPickup: false,
      allowSelfReturn: false,
      paid: false,
      paidAt: '',
      priceBase: price.priceBase,
      priceDiscount: price.priceDiscount,
      priceTotal: price.priceTotal,
      priceOverride: '',
      priceBreakdownJson: JSON.stringify(price),
      doorOpenedForReturn: false,
      notes: String(payload.notes || ''),
      createdAt: now,
      updatedAt: now
    });

    padIds.forEach(function (pid) {
      appendObject_(SHEET_NAMES.BookingPads, { bookingId: id, padId: pid });
    });

    return { id: id, bookingNumber: bookingNumber };
  });

  var magic = createMagicToken_(created.id);
  logEvent_(created.id, 'created', email, { bookingNumber: created.bookingNumber });
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, created.id));
  var out = {
    booking: booking,
    bookingNumber: created.bookingNumber,
    magicToken: magic,
    manageUrl: manageUrl_(magic)
  };

  // The booking is complete as far as the guest is concerned. Two mails take
  // seconds that the browser may not wait for, so the answer is handed out
  // before them: a client that already timed out and re-sent gets it now
  // instead of after the mail server.
  publishIdempotentResult_(payload.requestId, out);
  return out;
}

function manageUrl_(token) {
  var base = getConfig_('pagesBaseUrl', '').replace(/\/$/, '');
  return base + '/booking.html?t=' + encodeURIComponent(token);
}

function lookupBooking_(bookingNumber, email) {
  var num = String(bookingNumber || '').trim();
  var em = String(email || '').trim().toLowerCase();
  var bookings = readAllObjects_(SHEET_NAMES.Bookings);
  var found = null;
  for (var i = 0; i < bookings.length; i++) {
    if (String(bookings[i].bookingNumber) === num && String(bookings[i].email).toLowerCase() === em) {
      found = bookings[i];
      break;
    }
  }
  if (!found) throw softError_('Bokning hittades inte', 404);
  var magic = createMagicToken_(found.id);
  return {
    booking: enrichBooking_(found),
    magicToken: magic,
    manageUrl: manageUrl_(magic)
  };
}

function getBookingByToken_(token) {
  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig eller utgången länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  return enrichBooking_(b);
}

function guestRequestChange_(token, payload) {
  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  if (['Approved', 'Requested'].indexOf(b.status) < 0) {
    throw softError_('Ändring kan inte begäras i nuvarande status', 400);
  }

  var patch = { status: 'ChangePending', updatedAt: nowIso_() };
  var detail = { requested: payload };
  var padIds = null;

  if (payload.startDate && payload.endDate && payload.padIds) {
    padIds = payload.padIds.map(String);
    var price = calculatePrice_(padIds, payload.startDate, payload.endDate);
    patch.startDate = payload.startDate;
    patch.endDate = payload.endDate;
    patch.days = price.days;
    patch.priceBase = price.priceBase;
    patch.priceDiscount = price.priceDiscount;
    patch.priceTotal = price.priceTotal;
    patch.priceBreakdownJson = JSON.stringify(price);
  }

  if (padIds) {
    replaceBookingPads_(b.id, padIds);
    updateObjectById_(SHEET_NAMES.Bookings, b.id, patch);
  } else {
    updateObjectById_(SHEET_NAMES.Bookings, b.id, patch);
  }

  logEvent_(b.id, 'change_requested', b.email, detail);
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  return { booking: booking };
}

/**
 * Once equipment is handed out or returned, the booking has already happened;
 * anything from there on has to go through an admin. CancelPending only occurs
 * on rows left over from the old flow, where an admin approved the cancellation.
 */
var GUEST_CANCELLABLE_STATUSES = ['Requested', 'Approved', 'ChangePending', 'CancelPending'];

/**
 * Cancels on the spot. Only BLOCKING_STATUSES reserve the pads, so leaving them
 * frees the dates, and the write bumps the data version, which rebuilds the
 * cached calendar and availability answers.
 */
function guestCancelBooking_(token) {
  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  if (GUEST_CANCELLABLE_STATUSES.indexOf(b.status) < 0) {
    throw softError_(
      'Bokningen kan inte avbokas när den har status ' +
      statusLabel_(b.status, b.locale || 'sv') + '. Kontakta oss om något behöver ändras.',
      400
    );
  }
  updateObjectById_(SHEET_NAMES.Bookings, b.id, { status: 'Cancelled', updatedAt: nowIso_() });
  logEvent_(b.id, 'cancelled', b.email, { by: 'guest' });
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  return { booking: booking };
}

function listBookingsAdmin_(query) {
  var all = readAllObjects_(SHEET_NAMES.Bookings);
  var number = query && query.bookingNumber ? String(query.bookingNumber).trim().toLowerCase() : '';
  var status = query && query.status ? String(query.status) : '';
  var doubleOnly = status === 'DoubleBooked';

  // Conflicts are weighed against every blocking booking, not just the filtered
  // view — otherwise a Requested row would miss its clash with an Approved one.
  var index = bookingIndex_();
  var conflicts = computeConflicts_(all, index);

  var rows = all;
  if (number) {
    rows = rows.filter(function (b) {
      return String(b.bookingNumber).toLowerCase().indexOf(number) >= 0;
    });
  }
  if (status && !doubleOnly) {
    rows = rows.filter(function (b) { return b.status === status; });
  }
  rows.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  var list = rows.map(function (b) {
    var e = enrichBooking_(b, index);
    e.conflicts = conflicts[b.id] || [];
    e.doubleBooked = e.conflicts.length > 0;
    return e;
  });
  if (doubleOnly) {
    list = list.filter(function (b) { return b.doubleBooked; });
  }
  return list;
}

/**
 * Shared pads on overlapping dates among bookings that still occupy equipment.
 * The stored status stays Requested/Approved/… — "Dubbelbokat" is only how the
 * admin UI labels the computed flag.
 */
function computeConflicts_(rows, index) {
  var blocking = rows.filter(function (b) { return BLOCKING_STATUSES[b.status]; });
  var out = {};
  blocking.forEach(function (b) { out[b.id] = []; });

  for (var i = 0; i < blocking.length; i++) {
    for (var j = i + 1; j < blocking.length; j++) {
      var a = blocking[i];
      var b = blocking[j];
      if (!datesOverlap_(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
      var padsA = index.padsByBooking[a.id] || [];
      var padsB = index.padsByBooking[b.id] || [];
      var shared = padsA.filter(function (id) { return padsB.indexOf(id) >= 0; });
      if (!shared.length) continue;
      shared.forEach(function (padId) {
        var pad = index.padMap[padId];
        var name = pad ? pad.name : padId;
        out[a.id].push({
          padId: padId,
          padName: name,
          otherId: b.id,
          otherNumber: b.bookingNumber,
          otherGuest: (b.firstName + ' ' + b.lastName).trim(),
          otherStart: b.startDate,
          otherEnd: b.endDate,
          otherStatus: b.status
        });
        out[b.id].push({
          padId: padId,
          padName: name,
          otherId: a.id,
          otherNumber: a.bookingNumber,
          otherGuest: (a.firstName + ' ' + a.lastName).trim(),
          otherStart: a.startDate,
          otherEnd: a.endDate,
          otherStatus: a.status
        });
      });
    }
  }
  return out;
}

/**
 * The whole admin page in one cached answer. Every admin sees the same data and
 * every write bumps the data version, so the cache clears itself the moment a
 * booking changes; the filter is part of the key.
 */
function adminOverview_(query) {
  var key = 'adminOverview_' +
    ((query && query.bookingNumber) || '') + '_' +
    ((query && query.status) || '');
  return cachedResult_(key, function () {
    return {
      bookings: listBookingsAdmin_(query),
      pads: listPadsAdmin_(),
      rules: listPricingRulesAdmin_(),
      users: listUsers_(),
      passes: listDoorPasses_()
    };
  });
}

function adminUpdateBooking_(bookingId, payload, actor) {
  var b = findById_(SHEET_NAMES.Bookings, bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  var patch = { updatedAt: nowIso_() };
  var action = payload.op;

  if (action === 'approve') {
    if (b.status === 'Requested' || b.status === 'ChangePending') {
      patch.status = 'Approved';
    } else {
      throw softError_('Kan inte godkänna i status ' + b.status, 400);
    }
  } else if (action === 'reject') {
    if (b.status === 'Requested') patch.status = 'Rejected';
    else if (b.status === 'ChangePending') {
      patch.status = 'Approved';
    } else throw softError_('Kan inte avslå i status ' + b.status, 400);
  } else if (action === 'handOut') {
    if (payload.padId) {
      var newPad = String(payload.padId);
      var price = calculatePrice_([newPad], b.startDate, b.endDate);
      replaceBookingPads_(b.id, [newPad]);
      patch.priceBase = price.priceBase;
      patch.priceDiscount = price.priceDiscount;
      patch.priceTotal = price.priceTotal;
      patch.priceBreakdownJson = JSON.stringify(price);
    }
    patch.status = 'HandedOut';
  } else if (action === 'setPads') {
    var nextPads = parsePadIds_(payload.padIds);
    if (!nextPads.length) throw softError_('Välj minst en utrustning', 400);
    if (['Returned', 'Cancelled', 'Rejected'].indexOf(b.status) >= 0) {
      throw softError_('Utrustningen kan inte ändras i status ' + b.status, 400);
    }
    var nextPrice = calculatePrice_(nextPads, b.startDate, b.endDate);
    replaceBookingPads_(b.id, nextPads);
    patch.priceBase = nextPrice.priceBase;
    patch.priceDiscount = nextPrice.priceDiscount;
    patch.priceTotal = nextPrice.priceTotal;
    patch.priceBreakdownJson = JSON.stringify(nextPrice);
  } else if (action === 'return') {
    patch.status = 'Returned';
    patch.doorOpenedForReturn = false;
  } else if (action === 'setPaid') {
    patch.paid = !!payload.paid;
    patch.paidAt = payload.paid ? nowIso_() : '';
  } else if (action === 'setFlags') {
    if (typeof payload.allowSelfPickup !== 'undefined') patch.allowSelfPickup = !!payload.allowSelfPickup;
    if (typeof payload.allowSelfReturn !== 'undefined') patch.allowSelfReturn = !!payload.allowSelfReturn;
  } else if (action === 'setPriceOverride') {
    patch.priceOverride = payload.priceOverride === null || payload.priceOverride === '' ? '' : Number(payload.priceOverride);
  } else if (action === 'setNotes') {
    patch.notes = String(payload.notes || '');
  } else {
    throw softError_('Okänd action', 400);
  }

  updateObjectById_(SHEET_NAMES.Bookings, bookingId, patch);
  logEvent_(bookingId, action, actor.email, payload);
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, bookingId));
  return { booking: booking };
}

function availablePadsForBooking_(bookingId) {
  var b = findById_(SHEET_NAMES.Bookings, bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  var current = getBookingPads_(bookingId);
  var assigned = {};
  current.forEach(function (id) { assigned[String(id)] = true; });

  // Ignore this booking so its own pads are not marked "taken by itself".
  // What remains taken is a real overlap with somebody else.
  var taken = {};
  findUnavailablePadIds_(
    activePads_().map(function (p) { return String(p.id); }),
    b.startDate,
    b.endDate,
    bookingId
  ).forEach(function (id) { taken[String(id)] = true; });

  return activePads_().map(function (p) {
    var id = String(p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      pricePerDay: p.pricePerDay,
      assigned: !!assigned[id],
      available: !taken[id]
    };
  });
}
