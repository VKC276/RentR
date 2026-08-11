/**
 * Web app entry points.
 * Deploy as web app: Execute as Me, Who has access: Anyone.
 *
 * ContentService responses carry Access-Control-Allow-Origin: * through the
 * /exec redirect, so the frontend talks to this with plain fetch. doGet also
 * supports ?callback= for a JSONP fallback.
 */

/** Product name. The Config key appName overrides it per installation. */
var APP_NAME = 'RentR';

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
    var result = routeIdempotent_(action, body, sessionToken, e);
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

/**
 * Run manually to see how a hold survives the round trip through Sheets. Shows
 * whether expiresAt comes back as text or as a date cell, and whether the
 * expiry the code reads matches the one that was written.
 */
function diagnoseHolds() {
  var sheet = getSheet_(SHEET_NAMES.Holds);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var expiresCol = headers.indexOf('expiresAt');
  var statusCol = headers.indexOf('status');

  var out = [
    'Nu (UTC):        ' + new Date().toISOString(),
    'Tidszon script:  ' + Session.getScriptTimeZone(),
    'Tidszon ark:     ' + getSpreadsheet_().getSpreadsheetTimeZone(),
    'Antal holdrader: ' + Math.max(0, values.length - 1),
    ''
  ];

  for (var i = Math.max(1, values.length - 5); i < values.length; i++) {
    var raw = values[i][expiresCol];
    var normalized = normalizeCell_(raw, 'expiresAt');
    var msLeft = new Date(normalized).getTime() - Date.now();
    out.push(
      'rad ' + (i + 1) +
      ' | status=' + values[i][statusCol] +
      ' | celltyp=' + Object.prototype.toString.call(raw) +
      ' | format=' + sheet.getRange(i + 1, expiresCol + 1).getNumberFormat() +
      ' | rå=' + raw +
      ' | tolkad=' + normalized +
      ' | kvar=' + Math.round(msLeft / 1000) + ' s'
    );
  }

  out.push('', 'getActiveHolds_ ser ' + getActiveHolds_().length + ' aktiva holds');
  var text = out.join('\n');
  Logger.log(text);
  return text;
}
