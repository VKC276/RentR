/**
 * Sheet helpers, schema bootstrap and seed data.
 */

var SHEET_NAMES = {
  Users: 'Users',
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

/** Bump when HEADERS change so the next request rebuilds the schema. */
var SCHEMA_VERSION = 'v1';

var ssCache_ = null;

function getSpreadsheet_() {
  if (ssCache_) return ssCache_;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error('SPREADSHEET_ID saknas i Script Properties');
  }
  ssCache_ = SpreadsheetApp.openById(id);
  return ssCache_;
}

/**
 * Read-through cache for whole API results, shared across requests.
 *
 * Keys embed a data version that every write bumps, so a change is visible
 * immediately instead of after a TTL. Losing the version from cache only
 * causes a miss, never a stale answer.
 */
var DATA_VERSION_KEY = 'dataVersion';
var RESULT_TTL_SEC = 300;

function dataVersion_() {
  var cache = CacheService.getScriptCache();
  var v = cache.get(DATA_VERSION_KEY);
  if (!v) {
    v = String(Date.now());
    try { cache.put(DATA_VERSION_KEY, v, 21600); } catch (e) { /* best effort */ }
  }
  return v;
}

function bumpDataVersion_() {
  try {
    CacheService.getScriptCache()
      .put(DATA_VERSION_KEY, Date.now() + '-' + Math.floor(Math.random() * 1e6), 21600);
  } catch (e) { /* best effort */ }
}

function cachedResult_(name, produce, ttlSec) {
  var cache = CacheService.getScriptCache();
  var key = 'r' + dataVersion_() + '_' + name;
  var hit = cache.get(key);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* fall through */ }
  }
  var value = produce();
  // A TTL callback runs after produce() so it can look at rows the producer has
  // already read into the per-request cache.
  var ttl = typeof ttlSec === 'function' ? ttlSec() : ttlSec;
  try {
    cache.put(key, JSON.stringify(value), ttl || RESULT_TTL_SEC);
  } catch (e) { /* too large to cache */ }
  return value;
}

var sheetCache_ = {};

function getSheet_(name) {
  if (sheetCache_[name]) return sheetCache_[name];
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Flik saknas: ' + name);
  }
  sheetCache_[name] = sheet;
  return sheet;
}

/**
 * Creates sheets, headers and seed rows. This costs a dozen Sheets round trips,
 * so once it has succeeded for the current SCHEMA_VERSION it is skipped on
 * every later request. Pass true (or run setupSpreadsheet) to force it.
 */
function ensureSchema(force) {
  var props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('SCHEMA_READY') === SCHEMA_VERSION) {
    return { ok: true, cached: true };
  }

  var ss = getSpreadsheet_();
  sheetCache_ = {};
  tableCache_ = {};
  configCache_ = null;
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
  props.setProperty('SCHEMA_READY', SCHEMA_VERSION);
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
  if (!config.pagesBaseUrl) setConfig_('pagesBaseUrl', 'http://ledinfo.vastervikclimbing.se/RentR');
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

// getConfig_ is called many times per request; re-reading the Config tab each
// time cost a full sheet round trip per lookup.
var configCache_ = null;

function readConfigMap_() {
  if (configCache_) return configCache_;
  var rows = readAllObjects_(SHEET_NAMES.Config);
  var map = {};
  rows.forEach(function (r) {
    if (r.key) map[r.key] = String(r.value);
  });
  configCache_ = map;
  return map;
}

function getConfig_(key, fallback) {
  var map = readConfigMap_();
  return map[key] != null && map[key] !== '' ? map[key] : fallback;
}

function setConfig_(key, value) {
  configCache_ = null;
  bumpDataVersion_();
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

/**
 * Rows are memoised for the duration of one request. Without this, helpers such
 * as enrichBooking_ re-read the Pads and BookingPads tabs once per booking,
 * turning the admin list into dozens of Sheets round trips.
 *
 * Callers get fresh shallow copies, so mutating a returned row cannot leak into
 * later reads. Every write helper must call invalidateTable_.
 */
var tableCache_ = {};

/** Every write path must call this, or cached reads will go stale. */
function invalidateTable_(sheetName) {
  delete tableCache_[sheetName];
  bumpDataVersion_();
}

function readAllObjects_(sheetName) {
  var cached = tableCache_[sheetName];
  if (!cached) {
    var sheet = getSheet_(sheetName);
    var values = sheet.getDataRange().getValues();
    cached = [];
    if (values.length >= 2) {
      var headers = values[0].map(String);
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        if (row.every(function (c) { return c === '' || c === null; })) continue;
        var obj = { _row: i + 1 };
        headers.forEach(function (h, idx) {
          obj[h] = normalizeCell_(row[idx]);
        });
        cached.push(obj);
      }
    }
    tableCache_[sheetName] = cached;
  }
  return cached.map(function (o) { return Object.assign({}, o); });
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
  invalidateTable_(sheetName);
}

function updateObjectById_(sheetName, id, patch) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0].map(String);
  var idCol = headers.indexOf('id');
  if (idCol < 0) throw new Error('id-kolumn saknas i ' + sheetName);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      // One setValues for the whole row instead of a round trip per field.
      var row = values[i].slice();
      headers.forEach(function (h, col) {
        if (Object.prototype.hasOwnProperty.call(patch, h)) {
          row[col] = patch[h];
        }
      });
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      invalidateTable_(sheetName);
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
      invalidateTable_(sheetName);
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
  invalidateTable_(SHEET_NAMES.Counters);
  return year + '-' + pad(seq, 5);
}
