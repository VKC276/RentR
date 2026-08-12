/**
 * Open door commands for Raspberry Pi.
 */

function openDoor_(token) {
  // Door-only pass takes precedence if token matches DoorPasses
  if (findDoorPassByToken_(token)) {
    return openDoorFromPass_(token);
  }

  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  var flags = computeOpenDoorFlags_(b);
  if (!flags.showOpenDoor) throw softError_('Open door är inte tillgänglig', 403);

  var ttl = Number(getConfig_('doorCommandTtlSec', '30'));
  var cmd = {
    id: uid_(),
    bookingId: b.id,
    status: 'pending',
    createdAt: nowIso_(),
    consumedAt: '',
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
  };
  appendObject_(SHEET_NAMES.DoorCommands, cmd);
  logEvent_(b.id, 'open_door', b.email, { mode: flags.mode });

  if (flags.mode === 'return') {
    updateObjectById_(SHEET_NAMES.Bookings, b.id, {
      doorOpenedForReturn: true,
      updatedAt: nowIso_()
    });
  }

  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  return { ok: true, commandId: cmd.id, expiresAt: cmd.expiresAt, booking: booking };
}

function confirmReturn_(token) {
  var t = resolveMagicToken_(token);
  if (!t) throw softError_('Ogiltig länk', 401);
  var b = findById_(SHEET_NAMES.Bookings, t.bookingId);
  if (!b) throw softError_('Bokning saknas', 404);
  if (!(b.doorOpenedForReturn === true || b.doorOpenedForReturn === 'true')) {
    throw softError_('Öppna dörren först', 400);
  }
  if (b.status === 'Returned') throw softError_('Redan återlämnad', 400);

  updateObjectById_(SHEET_NAMES.Bookings, b.id, {
    status: 'Returned',
    doorOpenedForReturn: false,
    updatedAt: nowIso_()
  });
  logEvent_(b.id, 'confirm_return', b.email, {});
  var booking = enrichBooking_(findById_(SHEET_NAMES.Bookings, b.id));
  return { booking: booking };
}

function pollDoorCommand_(apiKey) {
  requirePiKey_(apiKey);
  expireDoorCommands_();
  var cmds = readAllObjects_(SHEET_NAMES.DoorCommands);
  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i];
    if (c.status === 'pending' && new Date(c.expiresAt).getTime() >= Date.now()) {
      return {
        command: {
          id: c.id,
          bookingId: c.bookingId,
          pulseMs: Number(getConfig_('relayPulseMs', '1000'))
        }
      };
    }
  }
  return { command: null };
}

function completeDoorCommand_(apiKey, commandId) {
  requirePiKey_(apiKey);
  var cmd = findById_(SHEET_NAMES.DoorCommands, commandId);
  if (!cmd) throw softError_('Kommando saknas', 404);
  updateObjectById_(SHEET_NAMES.DoorCommands, commandId, {
    status: 'done',
    consumedAt: nowIso_()
  });
  return { ok: true };
}

function requirePiKey_(apiKey) {
  var expected = PropertiesService.getScriptProperties().getProperty('PI_API_KEY');
  if (!expected || String(apiKey) !== String(expected)) {
    throw softError_('Unauthorized', 401);
  }
}

function expireDoorCommands_() {
  var cmds = readAllObjects_(SHEET_NAMES.DoorCommands);
  var now = Date.now();
  cmds.forEach(function (c) {
    if (c.status === 'pending' && new Date(c.expiresAt).getTime() < now) {
      updateObjectById_(SHEET_NAMES.DoorCommands, c.id, { status: 'expired' });
    }
  });
}
