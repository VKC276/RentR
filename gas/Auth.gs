/**
 * Password hashing and admin sessions.
 */

function getPepper_() {
  var pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) throw new Error('PASSWORD_PEPPER saknas i Script Properties');
  return pepper;
}

function hashPassword_(password, salt) {
  var material = salt + '|' + String(password) + '|' + getPepper_();
  var raw = Utilities.computeHmacSha256Signature(material, getPepper_());
  return raw.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function verifyPassword_(password, salt, expectedHash) {
  return hashPassword_(password, salt) === expectedHash;
}

/**
 * Sessions live in CacheService with a PropertiesService backstop, never in the
 * spreadsheet. Validating a session used to read the whole Sessions tab plus the
 * Users tab, which made every admin request pay two sheet round trips.
 *
 * The user snapshot is stored inside the session, so an authenticated request
 * touches no sheet at all.
 */
var SESSION_PREFIX = 'sess_';
var CACHE_MAX_SEC = 21600; // CacheService hard limit: 6 hours

function sessionStores_() {
  return {
    cache: CacheService.getScriptCache(),
    props: PropertiesService.getScriptProperties()
  };
}

function createSession_(user) {
  var hours = Number(getConfig_('sessionHours', '0'));
  var token = randomHex_(32);
  // 0 = never expires (until logout / cleared browser storage)
  var permanent = !(hours > 0);
  var expires = permanent
    ? '9999-12-31T23:59:59.000Z'
    : new Date(Date.now() + hours * 3600 * 1000).toISOString();

  var record = JSON.stringify({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    expiresAt: expires
  });

  var s = sessionStores_();
  var key = SESSION_PREFIX + token;
  // Properties keep the session alive past the cache's 6-hour ceiling.
  s.props.setProperty(key, record);
  var ttl = permanent
    ? CACHE_MAX_SEC
    : Math.max(60, Math.min(CACHE_MAX_SEC, Math.round(hours * 3600)));
  try { s.cache.put(key, record, ttl); } catch (e) { /* cache is best effort */ }

  return { token: token, expiresAt: expires, permanent: permanent };
}

function revokeSession_(token) {
  if (!token) return false;
  var s = sessionStores_();
  var key = SESSION_PREFIX + token;
  try { s.cache.remove(key); } catch (e) { /* ignore */ }
  s.props.deleteProperty(key);
  return true;
}

function sessionExpired_(expiresAt) {
  if (!expiresAt || expiresAt === '' || String(expiresAt).indexOf('9999') === 0) return false;
  var t = new Date(expiresAt).getTime();
  if (isNaN(t)) return false;
  return t < Date.now();
}

function getSessionUser_(token) {
  if (!token) return null;
  var s = sessionStores_();
  var key = SESSION_PREFIX + token;

  var raw = null;
  try { raw = s.cache.get(key); } catch (e) { /* ignore */ }
  if (!raw) {
    raw = s.props.getProperty(key);
    // Warm the cache so the slow path is only paid once.
    if (raw) { try { s.cache.put(key, raw, CACHE_MAX_SEC); } catch (e) { /* ignore */ } }
  }
  if (!raw) return null;

  var rec;
  try { rec = JSON.parse(raw); } catch (e) { return null; }
  if (sessionExpired_(rec.expiresAt)) {
    revokeSession_(token);
    return null;
  }
  if (rec.role !== 'admin') return null;

  return {
    id: rec.userId,
    email: rec.email,
    firstName: rec.firstName,
    lastName: rec.lastName,
    role: rec.role,
    active: true
  };
}

/**
 * Deactivating or deleting a user must not leave their session usable.
 */
function revokeSessionsForUser_(userId) {
  var s = sessionStores_();
  var all = s.props.getProperties();
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(SESSION_PREFIX) !== 0) return;
    var rec;
    try { rec = JSON.parse(all[key]); } catch (e) { return; }
    if (String(rec.userId) !== String(userId)) return;
    try { s.cache.remove(key); } catch (e) { /* ignore */ }
    s.props.deleteProperty(key);
  });
}

function requireAdmin_(token) {
  var user = getSessionUser_(token);
  if (!user) {
    var err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  return user;
}

function loginAdmin_(email, password) {
  var wanted = String(email || '').trim().toLowerCase();
  var all = readAllObjects_(SHEET_NAMES.Users);
  var raw = null;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].email).toLowerCase() === wanted) {
      raw = all[i];
      break;
    }
  }

  var active = raw && raw.active !== false && String(raw.active) !== 'false';
  if (!raw || !active || !verifyPassword_(password, raw.salt, raw.passwordHash)) {
    var err = new Error('Fel e-post eller lösenord');
    err.status = 401;
    throw err;
  }

  var user = sanitizeUser_(raw);
  return { user: user, session: createSession_(user) };
}

function sanitizeUser_(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    active: user.active === true || user.active === 'true' || user.active === true
  };
}
