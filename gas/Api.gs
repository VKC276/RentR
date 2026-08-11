/**
 * JSON API router with CORS.
 */

function handleApi_(e) {
  try {
    ensureSchema();
    var method = (e && e.parameter && e.parameter.method) || 'GET';
    var action = (e && e.parameter && e.parameter.action) || '';
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }
    // Allow action in body for POST
    if (body.action) action = body.action;
    if (body.method) method = body.method;

    var sessionToken = (e && e.parameter && e.parameter.token) || body.sessionToken || body.token || '';
    // Prefer Authorization-like fields from body
    if (body.sessionToken) sessionToken = body.sessionToken;

    var result = route_(action, body, sessionToken, e);
    return jsonResponse_(result);
  } catch (err) {
    var status = err.status || 500;
    return jsonResponse_({ error: err.message || String(err), status: status }, status);
  }
}

function route_(action, body, sessionToken, e) {
  e = e || {};
  if (!e.parameter) e.parameter = {};
  switch (action) {
    case 'ping':
      return { ok: true, time: nowIso_() };
    case 'setup':
      return ensureSchema(true);
    case 'getPublicConfig':
      return getPublicConfig_();
    case 'getAvailability':
      return getAvailability_(body.startDate || e.parameter.startDate, body.endDate || e.parameter.endDate);
    case 'createHold':
      return createHold_(body.padIds, body.startDate, body.endDate);
    case 'releaseHold':
      return releaseHold_(body.holdToken);
    case 'submitBooking':
      return submitBooking_(body);
    case 'lookupBooking':
      return lookupBooking_(body.bookingNumber, body.email);
    case 'getBookingByToken':
      return { booking: getBookingByToken_(body.magicToken || body.t || e.parameter.t) };
    case 'guestRequestChange':
      return guestRequestChange_(body.magicToken || body.t, body);
    case 'guestRequestCancel':
      return guestRequestCancel_(body.magicToken || body.t);
    case 'openDoor':
      return openDoor_(body.magicToken || body.t);
    case 'confirmReturn':
      return confirmReturn_(body.magicToken || body.t);
    case 'getDoorPass':
      return getDoorPassByToken_(body.magicToken || body.t || e.parameter.t);
    case 'createDoorPass':
      return createAndSendDoorPass_(body, requireAdmin_(sessionToken));
    case 'listDoorPasses':
      requireAdmin_(sessionToken);
      return { passes: listDoorPasses_() };
    case 'revokeDoorPass':
      requireAdmin_(sessionToken);
      return revokeDoorPass_(body.passId || body.id);

    case 'login':
      return loginAdmin_(body.email, body.password);
    case 'logout':
      revokeSession_(sessionToken || body.sessionToken);
      return { ok: true };
    case 'me':
      return { user: requireAdmin_(sessionToken) };
    case 'listBookings':
      requireAdmin_(sessionToken);
      return { bookings: listBookingsAdmin_(body) };
    case 'adminUpdateBooking':
      return adminUpdateBooking_(body.bookingId, body, requireAdmin_(sessionToken));
    case 'availablePadsForBooking':
      requireAdmin_(sessionToken);
      return { pads: availablePadsForBooking_(body.bookingId) };
    case 'listUsers':
      requireAdmin_(sessionToken);
      return { users: listUsers_() };
    case 'createUser':
      return { user: createUser_(body, requireAdmin_(sessionToken)) };
    case 'updateUser':
      return { user: updateUser_(body.userId, body, requireAdmin_(sessionToken)) };
    case 'deleteUser':
      return deleteUser_(body.userId, requireAdmin_(sessionToken));
    case 'listPads':
      requireAdmin_(sessionToken);
      return { pads: listPadsAdmin_() };
    case 'updatePad':
      requireAdmin_(sessionToken);
      return { pad: updatePad_(body.padId, body) };
    case 'listPricingRules':
      requireAdmin_(sessionToken);
      return { rules: listPricingRulesAdmin_() };
    case 'savePricingRule':
      requireAdmin_(sessionToken);
      return { rule: savePricingRule_(body) };
    case 'deletePricingRule':
      requireAdmin_(sessionToken);
      return deletePricingRule_(body.id);
    case 'pollDoor':
      return pollDoorCommand_(body.apiKey || e.parameter.apiKey);
    case 'completeDoor':
      return completeDoorCommand_(body.apiKey || e.parameter.apiKey, body.commandId);
    default:
      throw softError_('Unknown action: ' + action, 400);
  }
}

function jsonResponse_(obj, status) {
  // Apps Script ContentService cannot set HTTP status easily on web apps;
  // embed status in body for client handling.
  var out = obj || {};
  if (status && !out.status) out.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
