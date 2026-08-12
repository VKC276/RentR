/**
 * Door commands (Pi poll) + door-only passes.
 */

import {
  softError,
  nowIso,
  uid,
  randomHex,
  todayYmd,
  calcDays,
  kick,
  normalizeHm,
  isWithinHmWindow,
} from './util.js';
import { getConfigMap } from './config.js';
import { enrichBooking, resolveMagicToken, logEvent, releasePadLocks } from './bookings.js';
import { mailDoorPass } from './mail.js';

const DEFAULT_START_HM = '06:00';
const DEFAULT_END_HM = '22:00';

function requirePiKey(env, apiKey) {
  const expected = env.DOOR_API_KEY;
  if (!expected || String(apiKey) !== String(expected)) {
    throw softError('Unauthorized', 401);
  }
}

function doorPassUrl(pagesBaseUrl, token) {
  return (pagesBaseUrl || '').replace(/\/$/, '') + '/door.html?t=' + encodeURIComponent(token);
}

function passTimes(pass) {
  return {
    startTime: normalizeHm(pass.start_time || pass.startTime, DEFAULT_START_HM),
    endTime: normalizeHm(pass.end_time || pass.endTime, DEFAULT_END_HM),
  };
}

export async function findDoorPassByToken(db, token) {
  if (!token) return null;
  return db.prepare(`SELECT * FROM door_passes WHERE token = ?`).bind(token).first();
}

function isDoorPassValidDate(pass) {
  if (!pass || pass.revoked) return false;
  const today = todayYmd();
  return today >= pass.start_date && today <= pass.end_date;
}

function isDoorPassValidNow(pass) {
  if (!isDoorPassValidDate(pass)) return false;
  const { startTime, endTime } = passTimes(pass);
  return isWithinHmWindow(startTime, endTime);
}

export function enrichDoorPass(pass) {
  if (!pass) return null;
  const startDate = pass.start_date || pass.startDate;
  const endDate = pass.end_date || pass.endDate;
  const { startTime, endTime } = passTimes(pass);
  const today = todayYmd();
  const dateOk = isDoorPassValidDate(pass);
  const valid = isDoorPassValidNow(pass);
  let doorState = 'passed';
  if (pass.revoked) doorState = 'revoked';
  else if (valid) doorState = 'active';
  else if (dateOk) doorState = 'outsideHours';
  else if (today < String(startDate)) doorState = 'upcoming';

  return {
    id: pass.id,
    recipientName: pass.recipient_name || pass.recipientName,
    recipientEmail: pass.recipient_email || pass.recipientEmail,
    startDate,
    endDate,
    startTime,
    endTime,
    locale: pass.locale || 'sv',
    revoked: !!pass.revoked,
    showOpenDoor: valid,
    validToday: valid,
    doorUi: !pass.revoked,
    doorState,
    activeDate: startDate,
  };
}

async function createDoorCommand(db, bookingOrPassId, ttlSec) {
  const id = uid();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  await db
    .prepare(
      `INSERT INTO door_commands (id, booking_id, status, created_at, consumed_at, expires_at)
       VALUES (?, ?, 'pending', ?, NULL, ?)`
    )
    .bind(id, bookingOrPassId, now, expiresAt)
    .run();
  return { id, expiresAt };
}

export async function openDoor(env, token) {
  const db = env.DB;
  const pass = await findDoorPassByToken(db, token);
  if (pass) return openDoorFromPass(env, pass);

  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig länk', 401);
  const booking = await enrichBooking(db, t.booking_id);
  if (!booking) throw softError('Bokning saknas', 404);
  const flags = booking.openDoor;
  if (!flags.showOpenDoor) {
    const section = flags.mode === 'return' ? flags.return : flags.pickup;
    if (section && section.phase === 'outsideHours') {
      throw softError(
        'Open door gäller kl ' + section.startTime + '–' + section.endTime,
        403
      );
    }
    throw softError('Open door är inte tillgänglig', 403);
  }

  const cfg = await getConfigMap(db);
  const ttl = Number(cfg.doorCommandTtlSec || 30);
  const cmd = await createDoorCommand(db, booking.id, ttl);
  await logEvent(db, booking.id, 'open_door', booking.email, { mode: flags.mode });

  if (flags.mode === 'return') {
    await db
      .prepare(`UPDATE bookings SET door_opened_for_return = 1, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), booking.id)
      .run();
  } else if (flags.mode === 'pickup') {
    await db
      .prepare(`UPDATE bookings SET door_opened_for_pickup = 1, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), booking.id)
      .run();
  }

  return {
    ok: true,
    commandId: cmd.id,
    expiresAt: cmd.expiresAt,
    booking: await enrichBooking(db, booking.id),
  };
}

async function openDoorFromPass(env, passRow) {
  const db = env.DB;
  if (passRow.revoked) throw softError('Länken är återkallad', 403);
  if (!isDoorPassValidDate(passRow)) {
    throw softError(
      'Open door gäller endast ' + passRow.start_date + ' – ' + passRow.end_date,
      403
    );
  }
  if (!isDoorPassValidNow(passRow)) {
    const { startTime, endTime } = passTimes(passRow);
    throw softError('Open door gäller kl ' + startTime + '–' + endTime, 403);
  }
  const cfg = await getConfigMap(db);
  const ttl = Number(cfg.doorCommandTtlSec || 30);
  const cmd = await createDoorCommand(db, passRow.id, ttl);
  // door_commands.booking_id holds pass id here; booking_events FK would fail — skip log.
  return {
    ok: true,
    commandId: cmd.id,
    expiresAt: cmd.expiresAt,
    pass: enrichDoorPass(passRow),
  };
}

export async function confirmPickup(env, token, ctx) {
  const db = env.DB;
  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig länk', 401);
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(t.booking_id).first();
  if (!row) throw softError('Bokning saknas', 404);
  if (!row.allow_self_pickup) throw softError('Egen hämtning är inte tillåten', 403);
  if (!row.door_opened_for_pickup) throw softError('Öppna dörren först', 400);
  if (row.status !== 'Approved') throw softError('Kan inte bekräfta utlämning i denna status', 400);
  if (String(row.start_date) !== todayYmd()) {
    throw softError('Utlämning kan bara bekräftas på startdagen', 400);
  }
  const pickupStart = normalizeHm(row.self_service_start_time, DEFAULT_START_HM);
  const pickupEnd = normalizeHm(row.self_service_end_time, DEFAULT_END_HM);
  if (!isWithinHmWindow(pickupStart, pickupEnd)) {
    throw softError('Bekräftelse gäller kl ' + pickupStart + '–' + pickupEnd, 400);
  }

  const now = nowIso();
  await db
    .prepare(
      `UPDATE bookings SET status = 'HandedOut', door_opened_for_pickup = 0, updated_at = ? WHERE id = ?`
    )
    .bind(now, row.id)
    .run();
  await logEvent(db, row.id, 'confirm_pickup', row.email, {});
  const booking = await enrichBooking(db, row.id);
  return { booking };
}

export async function confirmReturn(env, token, ctx) {
  const db = env.DB;
  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig länk', 401);
  const row = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(t.booking_id).first();
  if (!row) throw softError('Bokning saknas', 404);
  if (!row.allow_self_return) throw softError('Egen återlämning är inte tillåten', 403);
  if (!row.door_opened_for_return) throw softError('Öppna dörren först', 400);
  if (row.status !== 'HandedOut') throw softError('Kan inte bekräfta återlämning i denna status', 400);
  if (String(row.end_date) !== todayYmd()) {
    throw softError('Återlämning kan bara bekräftas på slutdagen', 400);
  }
  const returnStart = normalizeHm(row.self_service_start_time, DEFAULT_START_HM);
  const returnEnd = normalizeHm(row.self_service_end_time, DEFAULT_END_HM);
  if (!isWithinHmWindow(returnStart, returnEnd)) {
    throw softError('Bekräftelse gäller kl ' + returnStart + '–' + returnEnd, 400);
  }

  const now = nowIso();
  await db
    .prepare(
      `UPDATE bookings SET status = 'Returned', door_opened_for_return = 0, updated_at = ? WHERE id = ?`
    )
    .bind(now, row.id)
    .run();
  await releasePadLocks(db, row.id);
  await logEvent(db, row.id, 'confirm_return', row.email, {});
  const booking = await enrichBooking(db, row.id);
  return { booking };
}

export async function pollDoor(env, apiKey) {
  requirePiKey(env, apiKey);
  const db = env.DB;
  const now = nowIso();
  await db
    .prepare(
      `UPDATE door_commands SET status = 'expired'
       WHERE status = 'pending' AND expires_at < ?`
    )
    .bind(now)
    .run();

  const cmd = await db
    .prepare(
      `SELECT id, booking_id AS bookingId FROM door_commands
       WHERE status = 'pending' AND expires_at >= ?
       ORDER BY created_at LIMIT 1`
    )
    .bind(now)
    .first();

  if (!cmd) return { command: null };
  const cfg = await getConfigMap(db);
  return {
    command: {
      id: cmd.id,
      bookingId: cmd.bookingId,
      pulseMs: Number(cfg.relayPulseMs || 1000),
    },
  };
}

export async function completeDoor(env, apiKey, commandId) {
  requirePiKey(env, apiKey);
  const cmd = await env.DB
    .prepare(`SELECT id FROM door_commands WHERE id = ?`)
    .bind(commandId)
    .first();
  if (!cmd) throw softError('Kommando saknas', 404);
  await env.DB
    .prepare(`UPDATE door_commands SET status = 'done', consumed_at = ? WHERE id = ?`)
    .bind(nowIso(), commandId)
    .run();
  return { ok: true };
}

export async function getDoorPassByToken(db, token) {
  const pass = await findDoorPassByToken(db, token);
  if (!pass) throw softError('Ogiltig länk', 401);
  if (pass.revoked) throw softError('Länken är återkallad', 403);
  return { pass: enrichDoorPass(pass) };
}

export async function createAndSendDoorPass(env, payload, actor, ctx) {
  const db = env.DB;
  const name = String(payload.recipientName || '').trim();
  const email = String(payload.recipientEmail || '').trim().toLowerCase();
  const startDate = String(payload.startDate || '').trim();
  const endDate = String(payload.endDate || '').trim();
  const startTime = normalizeHm(payload.startTime, DEFAULT_START_HM);
  const endTime = normalizeHm(payload.endTime, DEFAULT_END_HM);
  const locale = ['sv', 'en', 'de'].includes(payload.locale) ? payload.locale : 'sv';

  if (!name || !email || !startDate || !endDate) {
    throw softError('Namn, e-post, start- och slutdatum krävs', 400);
  }
  calcDays(startDate, endDate);

  const token = randomHex(32);
  const id = uid();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO door_passes
       (id, token, recipient_name, recipient_email, start_date, end_date, start_time, end_time,
        locale, revoked, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    )
    .bind(id, token, name, email, startDate, endDate, startTime, endTime, locale, actor.email || '', now)
    .run();

  const row = await db.prepare(`SELECT * FROM door_passes WHERE id = ?`).bind(id).first();
  const cfg = await getConfigMap(db);
  const url = doorPassUrl(cfg.pagesBaseUrl, token);
  kick(ctx, mailDoorPass(env, enrichDoorPass(row), url));

  return { pass: enrichDoorPass(row), url, sentTo: email };
}

export async function listDoorPasses(db) {
  const { results } = await db
    .prepare(`SELECT * FROM door_passes ORDER BY start_date DESC`)
    .all();
  return (results || []).map(enrichDoorPass);
}

export async function revokeDoorPass(db, passId) {
  const pass = await db.prepare(`SELECT id FROM door_passes WHERE id = ?`).bind(passId).first();
  if (!pass) throw softError('Dörrlänk saknas', 404);
  await db.prepare(`UPDATE door_passes SET revoked = 1 WHERE id = ?`).bind(passId).run();
  return { ok: true };
}
