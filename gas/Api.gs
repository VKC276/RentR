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

    var result = routeIdempotent_(action, body, sessionToken, e);
    return jsonResponse_(result);
  } catch (err) {
    var body = errorBody_(err);
    return jsonResponse_(body, body.status);
  }
}

/**
 * script.googleusercontent.com intermittently serves a Drive error page instead
 * of the script output. The script has already run at that point, so the client
 * retries with the same requestId and gets the stored response back rather than
 * creating a second booking.
 *
 * Only successful results are stored; a thrown error re-runs on retry.
 */
var IDEM_TTL_SEC = 900;
var IDEM_RUNNING = 'running';
/** How long a duplicate waits for the original to publish before giving up. */
var IDEM_WAIT_MS = 20000;

function idemKey_(requestId) {
  return 'idem_' + String(requestId).slice(0, 64);
}

/**
 * Publishes a result for its requestId before the caller has finished.
 *
 * A slow tail such as sending mail must not keep a waiting retry blocked: once
 * the rows exist the answer is final, so it is safe to hand out.
 */
function publishIdempotentResult_(requestId, value) {
  if (!requestId) return;
  try {
    CacheService.getScriptCache().put(idemKey_(requestId), JSON.stringify(value), IDEM_TTL_SEC);
  } catch (err) {
    // Too large to cache. A retry re-runs, which the availability check catches.
  }
}

function routeIdempotent_(action, body, sessionToken, e) {
  var key = body && body.requestId ? String(body.requestId).slice(0, 64) : '';
  if (!key) return route_(action, body, sessionToken, e);

  var cache = CacheService.getScriptCache();
  var cacheKey = idemKey_(key);
  var hit = cache.get(cacheKey);

  // The marker is claimed before the work starts. Without it a client that gave
  // up waiting and re-sent would run the whole action a second time, and for a
  // booking the second run would find the pads its own first run just took.
  if (!hit) {
    try { cache.put(cacheKey, IDEM_RUNNING, IDEM_TTL_SEC); } catch (err) { /* best effort */ }
  } else {
    var waited = waitForIdempotentResult_(cache, cacheKey, hit);
    if (waited) return waited;
    throw softError_(
      'Din förfrågan behandlas fortfarande. Vänta en stund.', 503, 'stillWorking'
    );
  }

  var result;
  try {
    result = route_(action, body, sessionToken, e);
  } catch (err) {
    // Let the next attempt run for real rather than wait for a result that is
    // never coming.
    try { cache.remove(cacheKey); } catch (e2) { /* best effort */ }
    throw err;
  }
  publishIdempotentResult_(key, result);
  return result;
}

/** Returns the stored result, or null if it never arrived in time. */
function waitForIdempotentResult_(cache, cacheKey, hit) {
  var deadline = Date.now() + IDEM_WAIT_MS;
  while (true) {
    if (hit && hit !== IDEM_RUNNING) {
      try { return JSON.parse(hit); } catch (err) { return null; }
    }
    if (Date.now() >= deadline) return null;
    Utilities.sleep(1000);
    hit = cache.get(cacheKey);
    // The original failed and cleared its marker; nothing left to wait for.
    if (!hit) return null;
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
    // Each round trip costs far more in Google's redirect hop than the script
    // itself takes to run, so the pages fetch everything they need at once.
    case 'getCalendar':
      return {
        config: getPublicConfig_(),
        calendar: getCalendar_(body.from, body.to)
      };
    case 'submitBooking':
      return submitBooking_(body);
    case 'lookupBooking':
      return lookupBooking_(body.bookingNumber, body.email);
    case 'getBookingByToken':
      return { booking: getBookingByToken_(body.magicToken || body.t || e.parameter.t) };
    case 'guestRequestChange':
      return guestRequestChange_(body.magicToken || body.t, body);
    case 'guestRequestCancel':
      return guestCancelBooking_(body.magicToken || body.t);
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
    case 'adminOverview':
      requireAdmin_(sessionToken);
      return adminOverview_(body);
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
    case 'createPad':
      return { pad: createPad_(body, requireAdmin_(sessionToken)) };
    // Removing a resource deactivates it; the row stays so old bookings keep
    // the name of what they rented.
    case 'setPadActive':
      return { pad: setPadActive_(body.padId, body.active, requireAdmin_(sessionToken)) };
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
