/**
 * Web app entry points.
 * Deploy as web app: Execute as Me, Who has access: Anyone.
 *
 * ContentService responses carry Access-Control-Allow-Origin: * through the
 * /exec redirect, so the frontend talks to this with plain fetch. doGet also
 * supports ?callback= for a JSONP fallback.
 */

function doGet(e) {
  e = e || { parameter: {} };

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
 * One-time setup helper — run manually in Apps Script editor after setting SPREADSHEET_ID.
 */
function setupSpreadsheet() {
  ensureSchema(true);
  Logger.log('Schema + seed klart. Standardadmin: admin@example.com / Admin123!');
}
