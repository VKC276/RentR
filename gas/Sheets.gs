/**
 * Sheet helpers, schema bootstrap and seed data.
 */

var SHEET_NAMES = {
  Users: 'Users',
  Sessions: 'Sessions',
  Pads: 'Pads',
  PricingRules: 'PricingRules',
  Holds: 'Holds',
  Bookings: 'Bookings',
  BookingPads: 'BookingPads',
  BookingEvents: 'BookingEvents',
  Tokens: 'Tokens',
  DoorCommands: 'DoorCommands',
  DoorPasses: 'DoorPasses',
  Config: 'Config',
  Counters: 'Counters'
};

var HEADERS = {
  Users: ['id', 'email', 'firstName', 'lastName', 'passwordHash', 'salt', 'role', 'active', 'createdAt', 'updatedAt'],
  Sessions: ['token', 'userId', 'expiresAt', 'revoked', 'createdAt'],
  Pads: ['id', 'name', 'description', 'pricePerDay', 'active', 'sortOrder'],
  PricingRules: ['id', 'dimension', 'minValue', 'percentOff', 'active', 'label'],
  Holds: ['id', 'holdToken', 'padIds', 'startDate', 'endDate', 'expiresAt', 'status', 'createdAt'],
  Bookings: [
    'id', 'bookingNumber', 'firstName', 'lastName', 'email', 'phone',
    'startDate', 'endDate', 'days', 'locale', 'status',
    'allowSelfPickup', 'allowSelfReturn', 'paid', 'paidAt',
    'priceBase', 'priceDiscount', 'priceTotal', 'priceOverride', 'priceBreakdownJson',
    'doorOpenedForReturn', 'notes', 'createdAt', 'updatedAt'
  ],
  BookingPads: ['bookingId', 'padId'],
  BookingEvents: ['id', 'bookingId', 'type', 'actor', 'detail', 'at'],
  Tokens: ['token', 'bookingId', 'expiresAt', 'revoked', 'createdAt'],
  DoorCommands: ['id', 'bookingId', 'status', 'createdAt', 'consumedAt', 'expiresAt'],
  DoorPasses: ['id', 'token', 'recipientName', 'recipientEmail', 'startDate', 'endDate', 'locale', 'revoked', 'createdBy', 'createdAt'],
  Config: ['key', 'value'],
  Counters: ['key', 'value']
};

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID saknas i Script Properties');
  }
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Flik saknas: ' + name);
  }
  return sheet;
}

function ensureSchema() {
  var ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    var headers = HEADERS[name];
    var range = sheet.getRange(1, 1, 1, headers.length);
    var existing = range.getValues()[0];
    var empty = existing.every(function (c) { return c === '' || c === null; });
    if (empty) {
      range.setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
  // Remove default Sheet1 if empty and unused
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) {
    try { ss.deleteSheet(sheet1); } catch (e) { /* ignore */ }
  }
  seedIfEmpty_();
  return { ok: true };
}

function seedIfEmpty_() {
  var pads = readAllObjects_(SHEET_NAMES.Pads);
  if (pads.length === 0) {
    for (var i = 1; i <= 12; i++) {
      appendObject_(SHEET_NAMES.Pads, {
        id: 'pad-' + pad(i, 2),
        name: 'Crashpad ' + i,
        description: 'Crashpad #' + i,
        pricePerDay: 150,
        active: true,
        sortOrder: i
      });
    }
  }

  var rules = readAllObjects_(SHEET_NAMES.PricingRules);
  if (rules.length === 0) {
    appendObject_(SHEET_NAMES.PricingRules, { id: uid_(), dimension: 'days', minValue: 3, percentOff: 10, active: true, label: '3+ dygn' });
    appendObject_(SHEET_NAMES.PricingRules, { id: uid_(), dimension: 'days', minValue: 7, percentOff: 20, active: true, label: '7+ dygn' });
    appendObject_(SHEET_NAMES.PricingRules, { id: uid_(), dimension: 'pads', minValue: 2, percentOff: 5, active: true, label: '2+ pads' });
    appendObject_(SHEET_NAMES.PricingRules, { id: uid_(), dimension: 'pads', minValue: 3, percentOff: 10, active: true, label: '3+ pads' });
  }

  var config = readConfigMap_();
  if (!config.holdMinutes) setConfig_('holdMinutes', '15');
  if (!config.defaultPricePerDay) setConfig_('defaultPricePerDay', '150');
  if (!config.currency) setConfig_('currency', 'SEK');
  if (!config.doorCommandTtlSec) setConfig_('doorCommandTtlSec', '30');
  if (!config.relayPulseMs) setConfig_('relayPulseMs', '1000');
  if (!config.appName) setConfig_('appName', 'Crashpad Booking');
  if (!config.timezone) setConfig_('timezone', 'Europe/Stockholm');
  if (!config.pagesBaseUrl) setConfig_('pagesBaseUrl', 'https://YOUR_USERNAME.github.io/booking-system');
  if (!config.sessionHours && config.sessionHours !== '0') setConfig_('sessionHours', '0');
  if (!config.magicLinkDays) setConfig_('magicLinkDays', '90');

  var users = readAllObjects_(SHEET_NAMES.Users);
  if (users.length === 0) {
    var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
    if (!pepper) {
      pepper = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      PropertiesService.getScriptProperties().setProperty('PASSWORD_PEPPER', pepper);
    }
    var salt = randomHex_(16);
    var hash = hashPassword_('Admin123!', salt);
    var now = nowIso_();
    appendObject_(SHEET_NAMES.Users, {
      id: uid_(),
      email: 'admin@example.com',
      firstName: 'Admin',
      lastName: 'User',
      passwordHash: hash,
      salt: salt,
      role: 'admin',
      active: true,
      createdAt: now,
      updatedAt: now
    });
  }
}

function pad(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function uid_() {
  return Utilities.getUuid();
}

function nowIso_() {
  return new Date().toISOString();
}

function todayYmd_() {
  return Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy-MM-dd');
}

function randomHex_(bytes) {
  var arr = [];
  for (var i = 0; i < bytes; i++) {
    arr.push(pad(Math.floor(Math.random() * 256).toString(16), 2));
  }
  return arr.join('');
}

function readConfigMap_() {
  var rows = readAllObjects_(SHEET_NAMES.Config);
  var map = {};
  rows.forEach(function (r) {
    if (r.key) map[r.key] = String(r.value);
  });
  return map;
}

function getConfig_(key, fallback) {
  var map = readConfigMap_();
  return map[key] != null && map[key] !== '' ? map[key] : fallback;
}

function setConfig_(key, value) {
  var sheet = getSheet_(SHEET_NAMES.Config);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function readAllObjects_(sheetName) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(String);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (c) { return c === '' || c === null; })) continue;
    var obj = { _row: i + 1 };
    headers.forEach(function (h, idx) {
      obj[h] = normalizeCell_(row[idx]);
    });
    out.push(obj);
  }
  return out;
}

function normalizeCell_(v) {
  if (v === '' || v === null || typeof v === 'undefined') return '';
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, 'Europe/Stockholm', 'yyyy-MM-dd');
  }
  if (v === true || v === false) return v;
  if (typeof v === 'string' && (v.toLowerCase() === 'true' || v.toLowerCase() === 'false')) {
    return v.toLowerCase() === 'true';
  }
  return v;
}

function appendObject_(sheetName, obj) {
  var headers = HEADERS[sheetName];
  var row = headers.map(function (h) {
    var v = obj[h];
    if (typeof v === 'undefined' || v === null) return '';
    return v;
  });
  getSheet_(sheetName).appendRow(row);
}

function updateObjectById_(sheetName, id, patch) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('id-kolumn saknas i ' + sheetName);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      headers.forEach(function (h, col) {
        if (Object.prototype.hasOwnProperty.call(patch, h)) {
          sheet.getRange(i + 1, col + 1).setValue(patch[h]);
        }
      });
      return true;
    }
  }
  return false;
}

function findById_(sheetName, id) {
  var rows = readAllObjects_(sheetName);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

function findByField_(sheetName, field, value) {
  var rows = readAllObjects_(sheetName);
  var needle = String(value).toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]).toLowerCase() === needle) return rows[i];
  }
  return null;
}

function deleteRowById_(sheetName, id) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var idCol = headers.indexOf('id');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function nextBookingNumber_() {
  var year = Utilities.formatDate(new Date(), 'Europe/Stockholm', 'yyyy');
  var key = 'bookingSeq_' + year;
  var sheet = getSheet_(SHEET_NAMES.Counters);
  var data = sheet.getDataRange().getValues();
  var seq = 1;
  var found = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === key) {
      seq = Number(data[i][1]) + 1;
      sheet.getRange(i + 1, 2).setValue(seq);
      found = true;
      break;
    }
  }
  if (!found) {
    sheet.appendRow([key, seq]);
  }
  return year + '-' + pad(seq, 5);
}
