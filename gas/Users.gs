/**
 * Admin user management.
 */

function listUsers_() {
  return readAllObjects_(SHEET_NAMES.Users).map(sanitizeUser_);
}

function countActiveAdmins_() {
  return readAllObjects_(SHEET_NAMES.Users).filter(function (u) {
    return (u.active === true || u.active === 'true') && u.role === 'admin';
  }).length;
}

function createUser_(payload, actor) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email || !payload.password || !payload.firstName || !payload.lastName) {
    throw softError_('Alla fält krävs', 400);
  }
  if (findByField_(SHEET_NAMES.Users, 'email', email)) {
    throw softError_('E-post används redan', 400);
  }
  var salt = randomHex_(16);
  var now = nowIso_();
  var user = {
    id: uid_(),
    email: email,
    firstName: String(payload.firstName).trim(),
    lastName: String(payload.lastName).trim(),
    passwordHash: hashPassword_(payload.password, salt),
    salt: salt,
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now
  };
  appendObject_(SHEET_NAMES.Users, user);
  return sanitizeUser_(user);
}

function updateUser_(userId, payload, actor) {
  var user = findById_(SHEET_NAMES.Users, userId);
  if (!user) throw softError_('Användare saknas', 404);

  var patch = { updatedAt: nowIso_() };
  if (payload.firstName) patch.firstName = String(payload.firstName).trim();
  if (payload.lastName) patch.lastName = String(payload.lastName).trim();
  if (payload.email) {
    var email = String(payload.email).trim().toLowerCase();
    var existing = findByField_(SHEET_NAMES.Users, 'email', email);
    if (existing && existing.id !== userId) throw softError_('E-post används redan', 400);
    patch.email = email;
  }
  if (typeof payload.active !== 'undefined') {
    var makingInactive = payload.active === false || payload.active === 'false';
    if (makingInactive && (user.active === true || user.active === 'true')) {
      if (countActiveAdmins_() <= 1) {
        throw softError_('Sista aktiva admin kan inte inaktiveras', 400);
      }
    }
    patch.active = !!payload.active && payload.active !== 'false';
  }
  if (payload.password) {
    var salt = randomHex_(16);
    patch.salt = salt;
    patch.passwordHash = hashPassword_(payload.password, salt);
  }
  updateObjectById_(SHEET_NAMES.Users, userId, patch);
  // Sessions carry a snapshot of the user, so they must be dropped when the
  // account is disabled, renamed or given a new password.
  if (patch.active === false || patch.email || patch.passwordHash) {
    revokeSessionsForUser_(userId);
  }
  return sanitizeUser_(findById_(SHEET_NAMES.Users, userId));
}

function deleteUser_(userId, actor) {
  var user = findById_(SHEET_NAMES.Users, userId);
  if (!user) throw softError_('Användare saknas', 404);
  if ((user.active === true || user.active === 'true') && countActiveAdmins_() <= 1) {
    throw softError_('Sista aktiva admin kan inte raderas', 400);
  }
  deleteRowById_(SHEET_NAMES.Users, userId);
  revokeSessionsForUser_(userId);
  return { ok: true };
}

function softError_(message, status) {
  var err = new Error(message);
  err.status = status || 400;
  return err;
}
