import {
  softError,
  nowIso,
  uid,
  randomHex,
  parsePadIds,
  eachDate,
  calcDays,
} from './util.js';
import { calculatePrice } from './pricing.js';
import { getConfigMap } from './config.js';
import { assertPadsAvailable } from './calendar.js';

async function nextBookingNumber(db) {
  // Serialize counter updates. D1 applies each statement; we bump then read.
  await db.prepare(`UPDATE counters SET value = value + 1 WHERE key = 'bookingNumber'`).run();
  const row = await db.prepare(`SELECT value FROM counters WHERE key = 'bookingNumber'`).first();
  if (!row) throw softError('Bokningsräknare saknas', 500);
  const year = new Date().getUTCFullYear();
  return year + '-' + String(row.value).padStart(5, '0');
}

async function createMagicToken(db, bookingId) {
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

function manageUrl(pagesBaseUrl, token) {
  return (pagesBaseUrl || '').replace(/\/$/, '') + '/booking.html?t=' + encodeURIComponent(token);
}

async function enrichBooking(db, id) {
  const b = await db
    .prepare(
      `SELECT id, booking_number AS bookingNumber, first_name AS firstName, last_name AS lastName,
              email, phone, start_date AS startDate, end_date AS endDate, days, locale, status,
              allow_self_pickup AS allowSelfPickup, allow_self_return AS allowSelfReturn,
              paid, paid_at AS paidAt, price_base AS priceBase, price_discount AS priceDiscount,
              price_total AS priceTotal, price_override AS priceOverride,
              price_breakdown_json AS priceBreakdownJson,
              door_opened_for_return AS doorOpenedForReturn, notes,
              created_at AS createdAt, updated_at AS updatedAt
       FROM bookings WHERE id = ?`
    )
    .bind(id)
    .first();
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
  return {
    ...b,
    allowSelfPickup: !!b.allowSelfPickup,
    allowSelfReturn: !!b.allowSelfReturn,
    paid: !!b.paid,
    doorOpenedForReturn: !!b.doorOpenedForReturn,
    padIds: pads.map((p) => p.id),
    pads,
    openDoor: { showOpenDoor: false, showConfirmReturn: false, mode: null },
  };
}

/**
 * Create a booking request. Availability is enforced by UNIQUE(pad_id, day) on
 * pad_day_locks inside one atomic D1 batch — two concurrent guests picking the
 * same pad cannot both succeed.
 */
export async function submitBooking(env, payload) {
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

  // Fast path: tell the guest which pads are taken before we touch the counter.
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
      // Race: someone else locked a pad between our check and the batch.
      const unavailable = await findTakenAfterRace(db, padIds, startDate, endDate, id);
      throw softError(
        'Inte längre ledig för valt intervall: ' + unavailable.map((p) => p.name).join(', '),
        409,
        'padsUnavailable',
        { unavailablePads: unavailable }
      );
    }
    throw e;
  }

  const cfg = await getConfigMap(db);
  const magicToken = await createMagicToken(db, id);
  const booking = await enrichBooking(db, id);
  const out = {
    booking,
    bookingNumber,
    magicToken,
    manageUrl: manageUrl(cfg.pagesBaseUrl, magicToken),
  };

  // Mail is best-effort and must not block the guest response.
  notifyMail(env, 'bookingCreated', { booking, magicToken }).catch(() => {});

  return out;
}

async function findTakenAfterRace(db, padIds, startDate, endDate, excludeBookingId) {
  const placeholders = padIds.map(() => '?').join(',');
  const { results } = await db
    .prepare(
      `SELECT DISTINCT pad_id AS padId FROM pad_day_locks
       WHERE pad_id IN (${placeholders}) AND day >= ? AND day <= ?
         AND booking_id != ?`
    )
    .bind(...padIds, startDate, endDate, excludeBookingId)
    .all();
  const taken = new Set((results || []).map((r) => r.padId));
  const { results: pads } = await db
    .prepare(`SELECT id, name FROM pads WHERE id IN (${placeholders})`)
    .bind(...padIds)
    .all();
  const names = Object.fromEntries((pads || []).map((p) => [p.id, p.name]));
  return padIds.filter((id) => taken.has(id)).map((id) => ({ id, name: names[id] || id }));
}

/** Optional GAS mail bridge. Set env.MAIL_WEBHOOK_URL to the Apps Script /exec URL. */
async function notifyMail(env, type, payload) {
  const url = env.MAIL_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'relayMail',
      type,
      payload,
      secret: env.MAIL_WEBHOOK_SECRET || '',
    }),
  });
}
