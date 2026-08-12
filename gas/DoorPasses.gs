/**
 * Admin-issued door-only access links (name + validity window).
 */

function doorPassUrl_(token) {
  var base = getConfig_('pagesBaseUrl', '').replace(/\/$/, '');
  return base + '/door.html?t=' + encodeURIComponent(token);
}

function findDoorPassByToken_(token) {
  if (!token) return null;
  var rows = readAllObjects_(SHEET_NAMES.DoorPasses);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].token) === String(token)) return rows[i];
  }
  return null;
}

function isDoorPassValidToday_(pass) {
  if (!pass) return false;
  if (pass.revoked === true || pass.revoked === 'true') return false;
  var today = todayYmd_();
  var t = parseYmd_(today).getTime();
  var s = parseYmd_(pass.startDate).getTime();
  var e = parseYmd_(pass.endDate).getTime();
  return t >= s && t <= e;
}

function enrichDoorPass_(pass) {
  var valid = isDoorPassValidToday_(pass);
  return {
    id: pass.id,
    recipientName: pass.recipientName,
    recipientEmail: pass.recipientEmail,
    startDate: pass.startDate,
    endDate: pass.endDate,
    locale: pass.locale || 'sv',
    revoked: pass.revoked === true || pass.revoked === 'true',
    showOpenDoor: valid,
    validToday: valid
  };
}

function createAndSendDoorPass_(payload, actor) {
  var name = String(payload.recipientName || '').trim();
  var email = String(payload.recipientEmail || '').trim().toLowerCase();
  var startDate = String(payload.startDate || '').trim();
  var endDate = String(payload.endDate || '').trim();
  var locale = ['sv', 'en', 'de'].indexOf(payload.locale) >= 0 ? payload.locale : 'sv';

  if (!name || !email || !startDate || !endDate) {
    throw softError_('Namn, e-post, start- och slutdatum krävs', 400);
  }
  calcDays_(startDate, endDate);

  var token = randomHex_(32);
  var row = {
    id: uid_(),
    token: token,
    recipientName: name,
    recipientEmail: email,
    startDate: startDate,
    endDate: endDate,
    locale: locale,
    revoked: false,
    createdBy: actor.email || '',
    createdAt: nowIso_()
  };
  appendObject_(SHEET_NAMES.DoorPasses, row);

  var url = doorPassUrl_(token);

  return {
    pass: enrichDoorPass_(row),
    url: url,
    sentTo: email
  };
}

function listDoorPasses_() {
  return readAllObjects_(SHEET_NAMES.DoorPasses)
    .map(enrichDoorPass_)
    .sort(function (a, b) {
      return String(b.startDate).localeCompare(String(a.startDate));
    });
}

function revokeDoorPass_(passId) {
  var pass = findById_(SHEET_NAMES.DoorPasses, passId);
  if (!pass) throw softError_('Dörrlänk saknas', 404);
  updateObjectById_(SHEET_NAMES.DoorPasses, passId, { revoked: true });
  return { ok: true };
}

function getDoorPassByToken_(token) {
  var pass = findDoorPassByToken_(token);
  if (!pass) throw softError_('Ogiltig länk', 401);
  if (pass.revoked === true || pass.revoked === 'true') throw softError_('Länken är återkallad', 403);
  return { pass: enrichDoorPass_(pass) };
}

function openDoorFromPass_(token) {
  var pass = findDoorPassByToken_(token);
  if (!pass) throw softError_('Ogiltig länk', 401);
  if (pass.revoked === true || pass.revoked === 'true') throw softError_('Länken är återkallad', 403);
  if (!isDoorPassValidToday_(pass)) {
    throw softError_('Open door gäller endast ' + pass.startDate + ' – ' + pass.endDate, 403);
  }

  var ttl = Number(getConfig_('doorCommandTtlSec', '30'));
  var cmd = {
    id: uid_(),
    bookingId: pass.id,
    status: 'pending',
    createdAt: nowIso_(),
    consumedAt: '',
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
  };
  appendObject_(SHEET_NAMES.DoorCommands, cmd);
  logEvent_(pass.id, 'open_door_pass', pass.recipientEmail, {
    recipientName: pass.recipientName,
    startDate: pass.startDate,
    endDate: pass.endDate
  });

  return {
    ok: true,
    commandId: cmd.id,
    expiresAt: cmd.expiresAt,
    pass: enrichDoorPass_(pass)
  };
}
