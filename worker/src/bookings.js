import {
  softError,
  nowIso,
  uid,
  randomHex,
  parsePadIds,
  eachDate,
  calcDays,
  todayYmd,
  datesOverlap,
  BLOCKING_STATUSES,
  statusLabel,
  kick,
} from './util.js';
import { calculatePrice } from './pricing.js';
import { getConfigMap, closedBookingRetentionMonths, CLOSED_BOOKING_STATUSES } from './config.js';
import { assertPadsAvailable, findUnavailablePads } from './calendar.js';
import {
  mailBookingCreated,
  mailGuestStatus,
  mailGuestCancelled,
  mailAdminChange,
} from './mail.js';

const GUEST_CANCELLABLE_STATUSES = ['Requested', 'Approved', 'ChangePending', 'CancelPending'];

const BOOKING_SELECT = `
  SELECT id, booking_number AS bookingNumber, first_name AS firstName, last_name AS lastName,
         email, phone, start_date AS startDate, end_date AS endDate, days, locale, status,
         allow_self_pickup AS allowSelfPickup, allow_self_return AS allowSelfReturn,
         paid, paid_at AS paidAt, price_base AS priceBase, price_discount AS priceDiscount,
         price_total AS priceTotal, price_override AS priceOverride,
         price_breakdown_json AS priceBreakdownJson,
         door_opened_for_return AS doorOpenedForReturn,
         door_opened_for_pickup AS doorOpenedForPickup, notes,
         reject_reason AS rejectReason,
         created_at AS createdAt, updated_at AS updatedAt
  FROM bookings`;

async function nextBookingNumber(db) {
  await db.prepare(`UPDATE counters SET value = value + 1 WHERE key = 'bookingNumber'`).run();
  const row = await db.prepare(`SELECT value FROM counters WHERE key = 'bookingNumber'`).first();
  if (!row) throw softError('Bokningsräknare saknas', 500);
  const year = new Date().getUTCFullYear();
  return year + '-' + String(row.value).padStart(5, '0');
}

export async function createMagicToken(db, bookingId) {
  const cfg = await getConfigMap(db);
  const days = Number(cfg.magicLinkDays || 90);
  const token = randomHex(32);
  const now = nowIso();
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  await db
    .prepare(
      `INSERT INTO tokens (token, booking_id, expires_at, revoked, created_at)
       VALUES (?, ?, ?, 0, ?)`
    )
    .bind(token, bookingId, expires, now)
    .run();
  return token;
}

export async function resolveMagicToken(db, token) {
  if (!token) return null;
  const t = await db
    .prepare(`SELECT token, booking_id, expires_at, revoked FROM tokens WHERE token = ?`)
    .bind(token)
    .first();
  if (!t || t.revoked) return null;
  if (new Date(t.expires_at).getTime() < Date.now()) return null;
  return t;
}

export async function logEvent(db, bookingId, type, actor, detail) {
  await db
    .prepare(
      `INSERT INTO booking_events (id, booking_id, type, actor, detail, at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      uid(),
      bookingId,
      type,
      actor || '',
      typeof detail === 'string' ? detail : JSON.stringify(detail || {}),
      nowIso()
    )
    .run();
}

function manageUrl(pagesBaseUrl, token) {
  return (pagesBaseUrl || '').replace(/\/$/, '') + '/booking.html?t=' + encodeURIComponent(token);
}

export function computeOpenDoorFlags(b) {
  const today = todayYmd();
  const status = b.status;
  const allowPickup = !!(b.allowSelfPickup || b.allow_self_pickup);
  const allowReturn = !!(b.allowSelfReturn || b.allow_self_return);
  const startDate = String(b.startDate || b.start_date || '');
  const endDate = String(b.endDate || b.end_date || '');
  const doorOpenedReturn = !!(b.doorOpenedForReturn || b.door_opened_for_return);
  const doorOpenedPickup = !!(b.doorOpenedForPickup || b.door_opened_for_pickup);
  // Pickup only while still Approved; return only after HandedOut — keeps same-day rentals ordered.
  const pickupActive = allowPickup && status === 'Approved' && startDate === today;
  const returnActive = allowReturn && status === 'HandedOut' && endDate === today;
  const doorUi =
    (status === 'Approved' || status === 'HandedOut') && (allowPickup || allowReturn);

  const base = {
    showOpenDoor: false,
    showConfirmReturn: false,
    showConfirmPickup: false,
    mode: null,
    doorUi: false,
    doorState: 'hidden',
    activeDate: null,
    startDate,
    endDate,
    allowPickup,
    allowReturn,
  };

  if (status === 'Returned') {
    return { ...base, doorState: 'done' };
  }
  if (!doorUi) return base;

  // On the active day the door stays openable until the guest confirms —
  // door_opened_* only unlocks the confirm step, it does not revoke Open door.
  if (returnActive) {
    return {
      ...base,
      doorUi: true,
      showOpenDoor: true,
      showConfirmReturn: doorOpenedReturn,
      mode: 'return',
      doorState: 'active',
      activeDate: endDate,
    };
  }
  if (pickupActive) {
    return {
      ...base,
      doorUi: true,
      showOpenDoor: true,
      showConfirmPickup: doorOpenedPickup,
      mode: 'pickup',
      doorState: 'active',
      activeDate: startDate,
    };
  }

  const candidates = [];
  if (allowPickup && status === 'Approved' && startDate > today) {
    candidates.push({ date: startDate, mode: 'pickup' });
  }
  if (allowReturn && (status === 'Approved' || status === 'HandedOut') && endDate > today) {
    candidates.push({ date: endDate, mode: 'return' });
  }
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (candidates.length) {
    return {
      ...base,
      doorUi: true,
      mode: candidates[0].mode,
      doorState: 'upcoming',
      activeDate: candidates[0].date,
    };
  }

  // Nothing openable today — explain why, by mode/status.
  if (status === 'HandedOut') {
    if (allowReturn && endDate && endDate < today) {
      return { ...base, doorUi: true, mode: 'return', doorState: 'returnPassed', activeDate: endDate };
    }
    return { ...base, doorUi: true, mode: 'pickup', doorState: 'pickedUp', activeDate: startDate };
  }
  if (allowPickup && status === 'Approved' && startDate && startDate < today) {
    return { ...base, doorUi: true, mode: 'pickup', doorState: 'pickupPassed', activeDate: startDate };
  }
  if (allowReturn && endDate && endDate < today) {
    return { ...base, doorUi: true, mode: 'return', doorState: 'returnPassed', activeDate: endDate };
  }
  return {
    ...base,
    doorUi: true,
    doorState: 'unavailable',
  };
}

export async function releasePadLocks(db, bookingId) {
  await db.prepare(`DELETE FROM pad_day_locks WHERE booking_id = ?`).bind(bookingId).run();
}

function padLockInsertStmts(db, bookingId, padIds, startDate, endDate) {
  const dayList = eachDate(startDate, endDate);
  return padIds.flatMap((pid) =>
    dayList.map((day) =>
      db
        .prepare(`INSERT INTO pad_day_locks (pad_id, day, booking_id) VALUES (?, ?, ?)`)
        .bind(pid, day, bookingId)
    )
  );
}

async function runLockBatch(db, stmts, padIds, startDate, endDate, bookingId) {
  try {
    await db.batch(stmts);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/UNIQUE|constraint|already exists/i.test(msg)) {
      const unavailable = await findUnavailablePads(db, padIds, startDate, endDate, bookingId);
      throw softError(
        'Inte längre ledig för valt intervall: ' + unavailable.map((p) => p.name).join(', '),
        409,
        'padsUnavailable',
        { unavailablePads: unavailable }
      );
    }
    throw e;
  }
}

/** Replace pad locks for a booking (delete old, insert new). Throws on UNIQUE race. */
export async function setPadLocks(db, bookingId, padIds, startDate, endDate) {
  await runLockBatch(
    db,
    [
      db.prepare(`DELETE FROM pad_day_locks WHERE booking_id = ?`).bind(bookingId),
      ...padLockInsertStmts(db, bookingId, padIds, startDate, endDate),
    ],
    padIds,
    startDate,
    endDate,
    bookingId
  );
}

/**
 * Atomically replace booking_pads + pad_day_locks so a UNIQUE conflict cannot
 * leave pad assignments and locks out of sync.
 */
async function replacePadsAndLocks(db, bookingId, padIds, startDate, endDate) {
  const stmts = [
    db.prepare(`DELETE FROM booking_pads WHERE booking_id = ?`).bind(bookingId),
    ...padIds.map((pid) =>
      db.prepare(`INSERT INTO booking_pads (booking_id, pad_id) VALUES (?, ?)`).bind(bookingId, pid)
    ),
    db.prepare(`DELETE FROM pad_day_locks WHERE booking_id = ?`).bind(bookingId),
    ...padLockInsertStmts(db, bookingId, padIds, startDate, endDate),
  ];
  await runLockBatch(db, stmts, padIds, startDate, endDate, bookingId);
}

export async function enrichBooking(db, id) {
  const b = await db.prepare(`${BOOKING_SELECT} WHERE id = ?`).bind(id).first();
  if (!b) return null;

  const { results: padRows } = await db
    .prepare(
      `SELECT p.id, p.name, p.description
       FROM booking_pads bp JOIN pads p ON p.id = bp.pad_id
       WHERE bp.booking_id = ?`
    )
    .bind(id)
    .all();

  const pads = padRows || [];
  const hasOverride =
    b.priceOverride !== null && b.priceOverride !== undefined && String(b.priceOverride) !== '';
  const priceTotal = hasOverride ? Number(b.priceOverride) : Number(b.priceTotal);

  return {
    ...b,
    allowSelfPickup: !!b.allowSelfPickup,
    allowSelfReturn: !!b.allowSelfReturn,
    paid: !!b.paid,
    doorOpenedForReturn: !!b.doorOpenedForReturn,
    doorOpenedForPickup: !!b.doorOpenedForPickup,
    priceTotal,
    priceOverride: hasOverride ? b.priceOverride : null,
    padIds: pads.map((p) => p.id),
    pads,
    openDoor: computeOpenDoorFlags(b),
  };
}

async function bookingIndex(db) {
  const { results: bpRows } = await db
    .prepare(`SELECT booking_id AS bookingId, pad_id AS padId FROM booking_pads`)
    .all();
  const padsByBooking = {};
  for (const bp of bpRows || []) {
    (padsByBooking[bp.bookingId] || (padsByBooking[bp.bookingId] = [])).push(bp.padId);
  }
  const { results: pads } = await db.prepare(`SELECT id, name, description FROM pads`).all();
  const padMap = Object.fromEntries((pads || []).map((p) => [p.id, p]));
  return { padsByBooking, padMap };
}

function enrichFromRow(b, index) {
  const padIds = index.padsByBooking[b.id] || [];
  const hasOverride =
    b.priceOverride !== null && b.priceOverride !== undefined && String(b.priceOverride) !== '';
  const priceTotal = hasOverride ? Number(b.priceOverride) : Number(b.priceTotal);
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    phone: b.phone,
    startDate: b.startDate,
    endDate: b.endDate,
    days: Number(b.days),
    locale: b.locale || 'sv',
    status: b.status,
    allowSelfPickup: !!b.allowSelfPickup,
    allowSelfReturn: !!b.allowSelfReturn,
    paid: !!b.paid,
    paidAt: b.paidAt || '',
    priceBase: Number(b.priceBase) || 0,
    priceDiscount: Number(b.priceDiscount) || 0,
    priceTotal,
    priceOverride: hasOverride ? b.priceOverride : null,
    priceBreakdownJson: b.priceBreakdownJson || '',
    doorOpenedForReturn: !!b.doorOpenedForReturn,
    doorOpenedForPickup: !!b.doorOpenedForPickup,
    notes: b.notes || '',
    rejectReason: b.rejectReason || '',
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    padIds,
    pads: padIds.map((id) => {
      const p = index.padMap[id];
      return p ? { id: p.id, name: p.name, description: p.description } : { id, name: id };
    }),
    openDoor: computeOpenDoorFlags(b),
  };
}

function computeConflicts(rows, index) {
  const blocking = rows.filter((b) => BLOCKING_STATUSES[b.status]);
  const out = {};
  for (const b of blocking) out[b.id] = [];

  for (let i = 0; i < blocking.length; i++) {
    for (let j = i + 1; j < blocking.length; j++) {
      const a = blocking[i];
      const b = blocking[j];
      if (!datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)) continue;
      const padsA = index.padsByBooking[a.id] || [];
      const padsB = index.padsByBooking[b.id] || [];
      const shared = padsA.filter((id) => padsB.includes(id));
      if (!shared.length) continue;
      for (const padId of shared) {
        const pad = index.padMap[padId];
        const name = pad ? pad.name : padId;
        out[a.id].push({
          padId,
          padName: name,
          otherId: b.id,
          otherNumber: b.bookingNumber,
          otherGuest: (b.firstName + ' ' + b.lastName).trim(),
          otherStart: b.startDate,
          otherEnd: b.endDate,
          otherStatus: b.status,
        });
        out[b.id].push({
          padId,
          padName: name,
          otherId: a.id,
          otherNumber: a.bookingNumber,
          otherGuest: (a.firstName + ' ' + a.lastName).trim(),
          otherStart: a.startDate,
          otherEnd: a.endDate,
          otherStatus: a.status,
        });
      }
    }
  }
  return out;
}

/**
 * Create a booking request. Availability is enforced by UNIQUE(pad_id, day) on
 * pad_day_locks inside one atomic D1 batch.
 */
export async function submitBooking(env, payload, ctx) {
  const db = env.DB;
  const padIds = parsePadIds(payload.padIds);
  const startDate = String(payload.startDate || '');
  const endDate = String(payload.endDate || '');
  if (!padIds.length) throw softError('Välj utrustning att boka', 400);
  const days = calcDays(startDate, endDate);

  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const phone = String(payload.phone || '').trim();
  const locale = ['sv', 'en', 'de'].includes(payload.locale) ? payload.locale : 'sv';
  if (!firstName || !lastName || !email || !phone) {
    throw softError('Förnamn, efternamn, e-post och telefon krävs', 400);
  }

  const price = await calculatePrice(db, padIds, startDate, endDate);
  await assertPadsAvailable(db, padIds, startDate, endDate);

  const id = uid();
  const bookingNumber = await nextBookingNumber(db);
  const now = nowIso();
  const dayList = eachDate(startDate, endDate);

  const stmts = [
    db
      .prepare(
        `INSERT INTO bookings (
          id, booking_number, first_name, last_name, email, phone,
          start_date, end_date, days, locale, status,
          allow_self_pickup, allow_self_return, paid, paid_at,
          price_base, price_discount, price_total, price_override, price_breakdown_json,
          door_opened_for_return, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Requested', 0, 0, 0, NULL, ?, ?, ?, NULL, ?, 0, ?, ?, ?)`
      )
      .bind(
        id,
        bookingNumber,
        firstName,
        lastName,
        email,
        phone,
        startDate,
        endDate,
        days,
        locale,
        price.priceBase,
        price.priceDiscount,
        price.priceTotal,
        JSON.stringify(price),
        String(payload.notes || ''),
        now,
        now
      ),
    ...padIds.map((pid) =>
      db.prepare(`INSERT INTO booking_pads (booking_id, pad_id) VALUES (?, ?)`).bind(id, pid)
    ),
    ...padIds.flatMap((pid) =>
      dayList.map((day) =>
        db
          .prepare(`INSERT INTO pad_day_locks (pad_id, day, booking_id) VALUES (?, ?, ?)`)
          .bind(pid, day, id)
      )
    ),
  ];

  try {
    await db.batch(stmts);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (/UNIQUE|constraint|already exists/i.test(msg)) {
      const unavailable = await findUnavailablePads(db, padIds, startDate, endDate, id);
      throw softError(
        'Inte längre ledig för valt intervall: ' + unavailable.map((p) => p.name).join(', '),
        409,
        'padsUnavailable',
        { unavailablePads: unavailable }
      );
    }
    throw e;
  }

  await logEvent(db, id, 'created', email, { bookingNumber });
  const cfg = await getConfigMap(db);
  const magicToken = await createMagicToken(db, id);
  const booking = await enrichBooking(db, id);
  const out = {
    booking,
    bookingNumber,
    magicToken,
    manageUrl: manageUrl(cfg.pagesBaseUrl, magicToken),
  };

  kick(ctx, mailBookingCreated(env, booking, magicToken));
  return out;
}

export async function lookupBooking(env, bookingNumber, email) {
  const db = env.DB;
  const num = String(bookingNumber || '').trim();
  const em = String(email || '').trim().toLowerCase();
  const found = await db
    .prepare(`${BOOKING_SELECT} WHERE booking_number = ? AND lower(email) = ?`)
    .bind(num, em)
    .first();
  if (!found) throw softError('Bokning hittades inte', 404);
  const magicToken = await createMagicToken(db, found.id);
  const cfg = await getConfigMap(db);
  return {
    booking: await enrichBooking(db, found.id),
    magicToken,
    manageUrl: manageUrl(cfg.pagesBaseUrl, magicToken),
  };
}

export async function getBookingByToken(db, token) {
  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig eller utgången länk', 401);
  const booking = await enrichBooking(db, t.booking_id);
  if (!booking) throw softError('Bokning saknas', 404);
  return { booking };
}

export async function guestRequestChange(env, token, payload, ctx) {
  const db = env.DB;
  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig länk', 401);
  const b = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(t.booking_id).first();
  if (!b) throw softError('Bokning saknas', 404);
  if (!['Approved', 'Requested'].includes(b.status)) {
    throw softError('Ändring kan inte begäras i nuvarande status', 400);
  }

  const now = nowIso();
  let padIds = null;

  if (payload.startDate && payload.endDate && payload.padIds) {
    padIds = parsePadIds(payload.padIds);
    const price = await calculatePrice(db, padIds, payload.startDate, payload.endDate);
    await assertPadsAvailable(db, padIds, payload.startDate, payload.endDate, b.id);
    await replacePadsAndLocks(db, b.id, padIds, payload.startDate, payload.endDate);
    await db
      .prepare(
        `UPDATE bookings SET status = 'ChangePending', start_date = ?, end_date = ?, days = ?,
         price_base = ?, price_discount = ?, price_total = ?, price_breakdown_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        payload.startDate,
        payload.endDate,
        price.days,
        price.priceBase,
        price.priceDiscount,
        price.priceTotal,
        JSON.stringify(price),
        now,
        b.id
      )
      .run();
  } else {
    await db
      .prepare(`UPDATE bookings SET status = 'ChangePending', updated_at = ? WHERE id = ?`)
      .bind(now, b.id)
      .run();
  }

  await logEvent(db, b.id, 'change_requested', b.email, { requested: payload });
  const booking = await enrichBooking(db, b.id);
  kick(ctx, mailAdminChange(env, booking, token));
  return { booking };
}

export async function guestCancelBooking(env, token, ctx) {
  const db = env.DB;
  const t = await resolveMagicToken(db, token);
  if (!t) throw softError('Ogiltig länk', 401);
  const b = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(t.booking_id).first();
  if (!b) throw softError('Bokning saknas', 404);
  if (!GUEST_CANCELLABLE_STATUSES.includes(b.status)) {
    throw softError(
      'Bokningen kan inte avbokas när den har status ' +
        statusLabel(b.status, b.locale || 'sv') +
        '. Kontakta oss om något behöver ändras.',
      400
    );
  }
  await db
    .prepare(`UPDATE bookings SET status = 'Cancelled', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), b.id)
    .run();
  await releasePadLocks(db, b.id);
  await logEvent(db, b.id, 'cancelled', b.email, { by: 'guest' });
  const booking = await enrichBooking(db, b.id);
  kick(ctx, mailGuestCancelled(env, booking, token));
  return { booking };
}

export async function listBookingsAdmin(db, query) {
  const { results: all } = await db.prepare(`${BOOKING_SELECT}`).all();
  const rows = all || [];
  const number = query && query.bookingNumber ? String(query.bookingNumber).trim().toLowerCase() : '';
  const status = query && query.status ? String(query.status) : '';
  const doubleOnly = status === 'DoubleBooked';
  const closedOnly = status === 'Closed';
  const CLOSED_FILTER_STATUSES = CLOSED_BOOKING_STATUSES;

  const index = await bookingIndex(db);
  const conflicts = computeConflicts(rows, index);

  let filtered = rows;
  if (number) {
    filtered = filtered.filter((b) => String(b.bookingNumber).toLowerCase().includes(number));
  }
  if (status && !doubleOnly && !closedOnly) {
    filtered = filtered.filter((b) => b.status === status);
  }
  if (closedOnly) {
    filtered = filtered.filter((b) => CLOSED_FILTER_STATUSES.includes(b.status));
  }
  filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  let list = filtered.map((b) => {
    const e = enrichFromRow(b, index);
    e.conflicts = conflicts[b.id] || [];
    e.doubleBooked = e.conflicts.length > 0;
    return e;
  });
  if (doubleOnly) list = list.filter((b) => b.doubleBooked);
  return list;
}

function monthsAgoIso(months) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

async function deleteBookingRow(db, bookingId) {
  const b = await db.prepare(`SELECT status FROM bookings WHERE id = ?`).bind(bookingId).first();
  if (!b) return;
  if (BLOCKING_STATUSES[b.status]) {
    await releasePadLocks(db, bookingId);
  }
  await db.prepare(`DELETE FROM door_commands WHERE booking_id = ?`).bind(bookingId).run();
  await db.prepare(`DELETE FROM bookings WHERE id = ?`).bind(bookingId).run();
}

/** Remove closed bookings older than the configured retention period. */
export async function purgeOldClosedBookings(db) {
  const cfg = await getConfigMap(db);
  const months = closedBookingRetentionMonths(cfg);
  if (months === 0) return { deleted: 0, months: 0, disabled: true };

  const cutoff = monthsAgoIso(months);
  const placeholders = CLOSED_BOOKING_STATUSES.map(() => '?').join(', ');
  const { results } = await db
    .prepare(
      `SELECT id FROM bookings
       WHERE status IN (${placeholders}) AND updated_at < ?`
    )
    .bind(...CLOSED_BOOKING_STATUSES, cutoff)
    .all();

  let deleted = 0;
  for (const row of results || []) {
    await deleteBookingRow(db, row.id);
    deleted++;
  }
  return { deleted, months, cutoff };
}

export async function deleteBookingAdmin(db, bookingId) {
  const b = await db.prepare(`SELECT id, booking_number AS bookingNumber, status FROM bookings WHERE id = ?`).bind(bookingId).first();
  if (!b) throw softError('Bokning saknas', 404);
  await deleteBookingRow(db, bookingId);
  return { ok: true, bookingNumber: b.bookingNumber };
}

export async function adminUpdateBooking(env, bookingId, payload, actor, ctx) {
  const db = env.DB;
  const b = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
  if (!b) throw softError('Bokning saknas', 404);

  const action = payload.op;
  const now = nowIso();
  let releaseLocks = false;

  if (action === 'approve') {
    if (b.status === 'Requested' || b.status === 'ChangePending') {
      await db
        .prepare(`UPDATE bookings SET status = 'Approved', updated_at = ? WHERE id = ?`)
        .bind(now, bookingId)
        .run();
    } else {
      throw softError('Kan inte godkänna i status ' + b.status, 400);
    }
  } else if (action === 'reject') {
    const reason = String(payload.reason || '').trim();
    if (reason.length < 3) {
      throw softError('Ange en kort orsak till avslaget (minst 3 tecken)', 400);
    }
    if (reason.length > 500) {
      throw softError('Orsaken får vara högst 500 tecken', 400);
    }
    if (b.status === 'Requested') {
      await db
        .prepare(
          `UPDATE bookings SET status = 'Rejected', reject_reason = ?, updated_at = ? WHERE id = ?`
        )
        .bind(reason, now, bookingId)
        .run();
      releaseLocks = true;
    } else if (b.status === 'ChangePending') {
      await db
        .prepare(
          `UPDATE bookings SET status = 'Approved', reject_reason = ?, updated_at = ? WHERE id = ?`
        )
        .bind(reason, now, bookingId)
        .run();
    } else {
      throw softError('Kan inte avslå i status ' + b.status, 400);
    }
  } else if (action === 'handOut') {
    if (b.status !== 'Approved') {
      throw softError('Kan bara lämna ut godkänd bokning', 400);
    }
    if (payload.padId) {
      const nextPads = [String(payload.padId)];
      const price = await calculatePrice(db, nextPads, b.start_date, b.end_date);
      await assertPadsAvailable(db, nextPads, b.start_date, b.end_date, bookingId);
      await replacePadsAndLocks(db, bookingId, nextPads, b.start_date, b.end_date);
      await db
        .prepare(
          `UPDATE bookings SET status = 'HandedOut', door_opened_for_pickup = 0,
           price_base = ?, price_discount = ?,
           price_total = ?, price_breakdown_json = ?, updated_at = ? WHERE id = ?`
        )
        .bind(
          price.priceBase,
          price.priceDiscount,
          price.priceTotal,
          JSON.stringify(price),
          now,
          bookingId
        )
        .run();
    } else {
      await db
        .prepare(
          `UPDATE bookings SET status = 'HandedOut', door_opened_for_pickup = 0, updated_at = ? WHERE id = ?`
        )
        .bind(now, bookingId)
        .run();
    }
  } else if (action === 'setPads') {
    const nextPads = parsePadIds(payload.padIds);
    if (!nextPads.length) throw softError('Välj minst en utrustning', 400);
    if (['Returned', 'Cancelled', 'Rejected'].includes(b.status)) {
      throw softError('Utrustningen kan inte ändras i status ' + b.status, 400);
    }
    const nextPrice = await calculatePrice(db, nextPads, b.start_date, b.end_date);
    if (BLOCKING_STATUSES[b.status]) {
      await assertPadsAvailable(db, nextPads, b.start_date, b.end_date, bookingId);
      await replacePadsAndLocks(db, bookingId, nextPads, b.start_date, b.end_date);
    } else {
      await db.prepare(`DELETE FROM booking_pads WHERE booking_id = ?`).bind(bookingId).run();
      await db.batch(
        nextPads.map((pid) =>
          db
            .prepare(`INSERT INTO booking_pads (booking_id, pad_id) VALUES (?, ?)`)
            .bind(bookingId, pid)
        )
      );
    }
    await db
      .prepare(
        `UPDATE bookings SET price_base = ?, price_discount = ?, price_total = ?,
         price_breakdown_json = ?, updated_at = ? WHERE id = ?`
      )
      .bind(
        nextPrice.priceBase,
        nextPrice.priceDiscount,
        nextPrice.priceTotal,
        JSON.stringify(nextPrice),
        now,
        bookingId
      )
      .run();
  } else if (action === 'return') {
    if (b.status !== 'HandedOut') {
      throw softError('Kan bara återlämna utlämnad bokning', 400);
    }
    await db
      .prepare(
        `UPDATE bookings SET status = 'Returned', door_opened_for_return = 0, updated_at = ? WHERE id = ?`
      )
      .bind(now, bookingId)
      .run();
    releaseLocks = true;
  } else if (action === 'undoHandOut') {
    if (b.status !== 'HandedOut') {
      throw softError('Kan bara ångra utlämning för utlämnad bokning', 400);
    }
    await db
      .prepare(
        `UPDATE bookings SET status = 'Approved', door_opened_for_pickup = 0, door_opened_for_return = 0, updated_at = ? WHERE id = ?`
      )
      .bind(now, bookingId)
      .run();
  } else if (action === 'undoReturn') {
    if (b.status !== 'Returned') {
      throw softError('Kan bara ångra återlämning för återlämnad bokning', 400);
    }
    const { results: padRows } = await db
      .prepare(`SELECT pad_id AS id FROM booking_pads WHERE booking_id = ?`)
      .bind(bookingId)
      .all();
    const padIds = (padRows || []).map((r) => r.id);
    if (!padIds.length) throw softError('Bokningen saknar utrustning', 400);
    await assertPadsAvailable(db, padIds, b.start_date, b.end_date, bookingId);
    await setPadLocks(db, bookingId, padIds, b.start_date, b.end_date);
    await db
      .prepare(
        `UPDATE bookings SET status = 'HandedOut', door_opened_for_return = 0, updated_at = ? WHERE id = ?`
      )
      .bind(now, bookingId)
      .run();
  } else if (action === 'setPaid') {
    const paid = !!payload.paid;
    await db
      .prepare(`UPDATE bookings SET paid = ?, paid_at = ?, updated_at = ? WHERE id = ?`)
      .bind(paid ? 1 : 0, paid ? now : null, now, bookingId)
      .run();
  } else if (action === 'setFlags') {
    const pickup =
      typeof payload.allowSelfPickup !== 'undefined'
        ? payload.allowSelfPickup
          ? 1
          : 0
        : b.allow_self_pickup;
    const ret =
      typeof payload.allowSelfReturn !== 'undefined'
        ? payload.allowSelfReturn
          ? 1
          : 0
        : b.allow_self_return;
    await db
      .prepare(
        `UPDATE bookings SET allow_self_pickup = ?, allow_self_return = ?, updated_at = ? WHERE id = ?`
      )
      .bind(pickup, ret, now, bookingId)
      .run();
  } else if (action === 'setPriceOverride') {
    const ov =
      payload.priceOverride === null || payload.priceOverride === ''
        ? null
        : Number(payload.priceOverride);
    await db
      .prepare(`UPDATE bookings SET price_override = ?, updated_at = ? WHERE id = ?`)
      .bind(ov, now, bookingId)
      .run();
  } else if (action === 'setNotes') {
    await db
      .prepare(`UPDATE bookings SET notes = ?, updated_at = ? WHERE id = ?`)
      .bind(String(payload.notes || ''), now, bookingId)
      .run();
  } else if (action === 'resendMail') {
    // No booking mutation — mail is sent below after enrich.
  } else {
    throw softError('Okänd action', 400);
  }

  if (releaseLocks) {
    await releasePadLocks(db, bookingId);
  }

  await logEvent(db, bookingId, action, actor.email, payload);
  const booking = await enrichBooking(db, bookingId);
  if (action === 'approve' || action === 'reject' || action === 'handOut' || action === 'return') {
    const magic = await createMagicToken(db, bookingId);
    const mailOpts =
      action === 'reject'
        ? { reason: String(payload.reason || '').trim() }
        : undefined;
    kick(ctx, mailGuestStatus(env, booking, magic, mailOpts));
  } else if (action === 'resendMail') {
    const magic = await createMagicToken(db, bookingId);
    // Await so admin sees success/failure instead of a silent background send.
    try {
      if (booking.status === 'Cancelled') {
        await mailGuestCancelled(env, booking, magic);
      } else if (booking.status === 'Requested') {
        await mailBookingCreated(env, booking, magic);
      } else {
        await mailGuestStatus(env, booking, magic);
      }
    } catch (err) {
      throw softError(
        'Mejl misslyckades: ' + String(err && err.message ? err.message : err),
        502
      );
    }
    return { booking, mailSent: true, mailTo: booking.email };
  }
  return { booking };
}

export async function availablePadsForBooking(db, bookingId) {
  const b = await db.prepare(`SELECT * FROM bookings WHERE id = ?`).bind(bookingId).first();
  if (!b) throw softError('Bokning saknas', 404);

  const { results: current } = await db
    .prepare(`SELECT pad_id AS id FROM booking_pads WHERE booking_id = ?`)
    .bind(bookingId)
    .all();
  const assigned = {};
  for (const r of current || []) assigned[r.id] = true;

  const { results: active } = await db
    .prepare(
      `SELECT id, name, description, price_per_day AS pricePerDay
       FROM pads WHERE active = 1 ORDER BY sort_order, name`
    )
    .all();
  const padIds = (active || []).map((p) => p.id);
  const unavailable = await findUnavailablePads(db, padIds, b.start_date, b.end_date, bookingId);
  const taken = new Set(unavailable.map((p) => p.id));

  return (active || []).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    pricePerDay: p.pricePerDay,
    assigned: !!assigned[p.id],
    available: !taken.has(p.id),
  }));
}
