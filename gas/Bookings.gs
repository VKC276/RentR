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

function submitBooking_(payload) {
  // The hold is only consumed once the booking rows exist. Consuming it up
  // front meant any later failure burned it, and the retry hit
  // "Hold ogiltig eller utgången" while the countdown still looked fine.
  var hold = requireActiveHold_(payload.holdToken);
  var padIds = parsePadIds_(hold.padIds);
  var startDate = hold.startDate;
  var endDate = hold.endDate;

  var firstName = String(payload.firstName || '').trim();
  var lastName = String(payload.lastName || '').trim();
  var email = String(payload.email || '').trim().toLowerCase();
  var phone = String(payload.phone || '').trim();
  var locale = ['sv', 'en', 'de'].indexOf(payload.locale) >= 0 ? payload.locale : 'sv';

  if (!firstName || !lastName || !email || !phone) {
    throw softError_('Förnamn, efternamn, e-post och telefon krävs', 400);
  }

  // This booking's own hold must not count as a conflict against itself.
  assertPadsAvailable_(padIds, startDate, endDate, null, hold.holdToken);
  var price = calculatePrice_(padIds, startDate, endDate);
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

  updateObjectById_(SHEET_NAMES.Holds, hold.id, { status: 'consumed' });

  var magic = createMagicToken_(id);
  logEvent_(id, 'created', email, { bookingNumber: bookingNumber });
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, id));
  try {
    mailBookingCreated_(booking, magic);
    mailAdminNewRequest_(booking);
  } catch (e) {
    // mail failure should not roll back booking
  }
  return {
    booking: booking,
    bookingNumber: bookingNumber,
    magicToken: magic,
    manageUrl: manageUrl_(magic)
  };
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

  if (payload.startDate && payload.endDate && payload.padIds) {
    var padIds = payload.padIds.map(String);
    assertPadsAvailable_(padIds, payload.startDate, payload.endDate, b.id);
    var price = calculatePrice_(padIds, payload.startDate, payload.endDate);
    patch.startDate = payload.startDate;
    patch.endDate = payload.endDate;
    patch.days = price.days;
    patch.priceBase = price.priceBase;
    patch.priceDiscount = price.priceDiscount;
    patch.priceTotal = price.priceTotal;
    patch.priceBreakdownJson = JSON.stringify(price);
    replaceBookingPads_(b.id, padIds);
  }

  updateObjectById_(SHEET_NAMES.Bookings, b.id, patch);
  logEvent_(b.id, 'change_requested', b.email, detail);
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  try { mailAdminChange_(booking); } catch (e) {}
  return { booking: booking };
}

function guestRequestCancel_(token) {
  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  if (['Approved', 'Requested', 'ChangePending'].indexOf(b.status) < 0) {
    throw softError_('Avbokning kan inte begäras i nuvarande status', 400);
  }
  updateObjectById_(SHEET_NAMES.Bookings, b.id, { status: 'CancelPending', updatedAt: nowIso_() });
  logEvent_(b.id, 'cancel_requested', b.email, {});
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  try { mailAdminCancel_(booking); } catch (e) {}
  return { booking: booking };
}

function listBookingsAdmin_(query) {
  var rows = readAllObjects_(SHEET_NAMES.Bookings);
  var number = query && query.bookingNumber ? String(query.bookingNumber).trim().toLowerCase() : '';
  var status = query && query.status ? String(query.status) : '';

  // Filter first: resolving pads and door flags for rows that are about to be
  // discarded is most of the work on a filtered view.
  if (number) {
    rows = rows.filter(function (b) {
      return String(b.bookingNumber).toLowerCase().indexOf(number) >= 0;
    });
  }
  if (status) {
    rows = rows.filter(function (b) { return b.status === status; });
  }
  rows.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  var index = bookingIndex_();
  return rows.map(function (b) { return enrichBooking_(b, index); });
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
    } else if (b.status === 'CancelPending') {
      // reject cancel -> back to Approved
      patch.status = 'Approved';
    } else {
      throw softError_('Kan inte godkänna i status ' + b.status, 400);
    }
  } else if (action === 'reject') {
    if (b.status === 'Requested') patch.status = 'Rejected';
    else if (b.status === 'ChangePending') {
      patch.status = 'Approved';
    } else if (b.status === 'CancelPending') {
      // reject cancellation → keep booking
      patch.status = 'Approved';
    } else throw softError_('Kan inte avslå i status ' + b.status, 400);
  } else if (action === 'approveCancel') {
    patch.status = 'Cancelled';
  } else if (action === 'handOut') {
    if (payload.padId) {
      var newPad = String(payload.padId);
      assertPadsAvailable_([newPad], b.startDate, b.endDate, b.id);
      replaceBookingPads_(b.id, [newPad]);
      var price = calculatePrice_([newPad], b.startDate, b.endDate);
      patch.priceBase = price.priceBase;
      patch.priceDiscount = price.priceDiscount;
      patch.priceTotal = price.priceTotal;
      patch.priceBreakdownJson = JSON.stringify(price);
    }
    patch.status = 'HandedOut';
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
  try {
    if (action === 'approve' || action === 'reject' || action === 'approveCancel' || action === 'handOut' || action === 'return') {
      mailGuestStatus_(booking);
    }
  } catch (e) {}
  return { booking: booking };
}

function availablePadsForBooking_(bookingId) {
  var b = findById_(SHEET_NAMES.Bookings, bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  var avail = getAvailability_(b.startDate, b.endDate);
  // include currently assigned pads as available for swap
  var current = getBookingPads_(bookingId);
  avail.pads.forEach(function (p) {
    if (current.indexOf(p.id) >= 0) p.available = true;
  });
  return avail.pads.filter(function (p) { return p.available; });
}
