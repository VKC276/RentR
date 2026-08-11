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

function createSession_(userId) {
  var hours = Number(getConfig_('sessionHours', '0'));
  var token = randomHex_(32);
  // 0 = never expires (until logout / cleared browser storage)
  var expires = hours > 0
    ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    : '9999-12-31T23:59:59.000Z';
  appendObject_(SHEET_NAMES.Sessions, {
    token: token,
    userId: userId,
    expiresAt: expires,
    revoked: false,
    createdAt: nowIso_()
  });
  return { token: token, expiresAt: expires, permanent: !(hours > 0) };
}

function revokeSession_(token) {
  var sheet = getSheet_(SHEET_NAMES.Sessions);
  var data = sheet.getDataRange().getValues();
  var headers = data[0].map(String);
  var tokenCol = headers.indexOf('token');
  var revokedCol = headers.indexOf('revoked');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][tokenCol]) === String(token)) {
      sheet.getRange(i + 1, revokedCol + 1).setValue(true);
      return true;
    }
  }
  return false;
}

function sessionExpired_(expiresAt) {
  if (!expiresAt || expiresAt === '' || String(expiresAt).indexOf('9999') === 0) return false;
  var t = new Date(expiresAt).getTime();
  if (isNaN(t)) return false;
  return t < Date.now();
}

function getSessionUser_(token) {
  if (!token) return null;
  var sessions = readAllObjects_(SHEET_NAMES.Sessions);
  var session = null;
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].token) === String(token)) {
      session = sessions[i];
      break;
    }
  }
  if (!session) return null;
  if (session.revoked === true || String(session.revoked) === 'true') return null;
  if (sessionExpired_(session.expiresAt)) return null;
  var user = findById_(SHEET_NAMES.Users, session.userId);
  if (!user || user.active === false || String(user.active) === 'false') return null;
  if (user.role !== 'admin') return null;
  return sanitizeUser_(user);
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
  var user = findByField_(SHEET_NAMES.Users, 'email', String(email || '').trim().toLowerCase());
  if (!user || user.active === false || String(user.active) === 'false') {
    var err = new Error('Fel e-post eller lösenord');
    err.status = 401;
    throw err;
  }
  // find by email case-insensitive — re-read raw for hash
  var all = readAllObjects_(SHEET_NAMES.Users);
  var raw = null;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].email).toLowerCase() === String(email).trim().toLowerCase()) {
      raw = all[i];
      break;
    }
  }
  if (!raw || !verifyPassword_(password, raw.salt, raw.passwordHash)) {
    var err2 = new Error('Fel e-post eller lösenord');
    err2.status = 401;
    throw err2;
  }
  var session = createSession_(raw.id);
  return { user: sanitizeUser_(raw), session: session };
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
