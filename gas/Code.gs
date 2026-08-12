/**
 * Web app entry points.
 * Deploy as web app: Execute as Me, Who has access: Anyone.
 *
 * ContentService responses carry Access-Control-Allow-Origin: * through the
 * /exec redirect, so the frontend talks to this with plain fetch. doGet also
 * supports ?callback= for a JSONP fallback.
 */

/** Product name. The Config key appName overrides it per installation. */
var APP_NAME = 'VKK Rental';

function doGet(e) {
  e = e || { parameter: {} };

  var action = e.parameter.action || 'ping';
  try {
    ensureSchema();
    var body = {};
    if (e.parameter.payload) {
      try { body = JSON.parse(e.parameter.payload); } catch (err) { body = {}; }
    }
    ['startDate', 'endDate', 'bookingNumber', 'email', 't', 'apiKey', 'commandId', 'bookingId', 'userId', 'padId', 'id'].forEach(function (k) {
      if (e.parameter[k] != null && e.parameter[k] !== '' && body[k] == null) body[k] = e.parameter[k];
    });
    if (e.parameter.t) body.magicToken = e.parameter.t;
    if (body.action) action = body.action;
    var sessionToken = e.parameter.sessionToken || body.sessionToken || '';
    var result = routeIdempotent_(action, body, sessionToken, e);
    if (e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse_(result);
  } catch (err) {
    var errObj = errorBody_(err);
    if (e.parameter && e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '(' + JSON.stringify(errObj) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse_(errObj, errObj.status);
  }
}

function doPost(e) {
  // Mail relay for Cloudflare (action relayMail / ping). Everything else is the legacy API.
  try {
    var peek = {};
    if (e && e.postData && e.postData.contents) {
      try { peek = JSON.parse(e.postData.contents); } catch (err) { peek = {}; }
    }
    if (peek.action === 'relayMail' || peek.action === 'ping') {
      return handleMailRelay_(peek);
    }
  } catch (err) {
    return jsonResponse_({ error: String(err && err.message ? err.message : err), status: 500 }, 500);
  }
  return handleApi_(e);
}

/**
 * One-time setup helper — run manually in Apps Script editor after setting SPREADSHEET_ID.
 */
function setupSpreadsheet() {
  ensureSchema(true);
  Logger.log('Schema + seed klart. Standardadmin: admin@example.com / Admin123!');
}
