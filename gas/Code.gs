/**
 * Web app entry points.
 * Deploy as web app: Execute as Me, Who has access: Anyone.
 *
 * Frontend uses an HtmlService iframe bridge (?bridge=1) + google.script.run
 * to avoid CORS/JSONP issues from GitHub Pages / custom domains.
 */

function doGet(e) {
  e = e || { parameter: {} };

  // postMessage bridge for external sites (Pages)
  if (e.parameter.bridge === '1') {
    return HtmlService
      .createHtmlOutputFromFile('Bridge')
      .setTitle('RentR Bridge')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var action = e.parameter.action || 'ping';
  try {
    ensureSchema();
    var body = {};
    if (e.parameter.payload) {
      try { body = JSON.parse(e.parameter.payload); } catch (err) { body = {}; }
    }
    ['startDate', 'endDate', 'bookingNumber', 'email', 't', 'apiKey', 'commandId', 'holdToken', 'bookingId', 'userId', 'padId', 'id'].forEach(function (k) {
      if (e.parameter[k] != null && e.parameter[k] !== '' && body[k] == null) body[k] = e.parameter[k];
    });
    if (e.parameter.t) body.magicToken = e.parameter.t;
    if (body.action) action = body.action;
    var sessionToken = e.parameter.sessionToken || body.sessionToken || '';
    var result = route_(action, body, sessionToken, e);
    if (e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse_(result);
  } catch (err) {
    var status = err.status || 500;
    var errObj = { error: err.message || String(err), status: status };
    if (e.parameter && e.parameter.callback) {
      return ContentService
        .createTextOutput(e.parameter.callback + '(' + JSON.stringify(errObj) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse_(errObj, status);
  }
}

function doPost(e) {
  return handleApi_(e);
}

/**
 * Called from Bridge.html via google.script.run
 */
function bridgeCall(action, payload, sessionToken) {
  try {
    ensureSchema();
    payload = payload || {};
    if (payload.action) action = payload.action;
    var result = route_(action, payload, sessionToken || payload.sessionToken || '', { parameter: {} });
    return result;
  } catch (err) {
    // google.script.run failure handler gets Error; also return structured object
    var msg = err && err.message ? err.message : String(err);
    throw new Error(msg);
  }
}

/**
 * One-time setup helper — run manually in Apps Script editor after setting SPREADSHEET_ID.
 */
function setupSpreadsheet() {
  ensureSchema();
  Logger.log('Schema + seed klart. Standardadmin: admin@example.com / Admin123!');
}
