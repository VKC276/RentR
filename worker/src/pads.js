import { softError } from './util.js';

const MAX_PRICE_PER_DAY = 100000;

function parsePricePerDay(value) {
  const price = Number(value);
  if (
    value === '' ||
    value === null ||
    typeof value === 'undefined' ||
    !isFinite(price) ||
    price < 0 ||
    price > MAX_PRICE_PER_DAY
  ) {
    throw softError('Pris per dygn måste vara ett tal mellan 0 och ' + MAX_PRICE_PER_DAY, 400);
  }
  return price;
}

async function openBookingsByPad(db) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const { results } = await db
    .prepare(
      `SELECT bp.pad_id AS padId, COUNT(*) AS n
       FROM booking_pads bp
       JOIN bookings b ON b.id = bp.booking_id
       WHERE b.end_date >= ?
         AND b.status IN ('Requested','Approved','ChangePending','CancelPending','HandedOut')
       GROUP BY bp.pad_id`
    )
    .bind(today)
    .all();
  const counts = {};
  for (const r of results || []) counts[r.padId] = r.n;
  return counts;
}

function mapPad(row, counts) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    pricePerDay: Number(row.price_per_day),
    active: !!row.active,
    sortOrder: Number(row.sort_order),
    openBookings: (counts && counts[row.id]) || 0,
  };
}

export async function listPadsAdmin(db) {
  const counts = await openBookingsByPad(db);
  const { results } = await db
    .prepare(
      `SELECT id, name, description, price_per_day, active, sort_order
       FROM pads ORDER BY sort_order, name`
    )
    .all();
  return (results || []).map((r) => mapPad(r, counts));
}

async function nextPadId(db) {
  const { results } = await db.prepare(`SELECT id FROM pads`).all();
  const taken = {};
  let highest = 0;
  for (const p of results || []) {
    taken[p.id] = true;
    const m = /^pad-(\d+)$/.exec(p.id);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  let id;
  do {
    highest++;
    id = 'pad-' + String(highest).padStart(2, '0');
  } while (taken[id]);
  return id;
}

export async function createPad(db, payload) {
  const name = String(payload.name || '').trim();
  if (!name) throw softError('Namn krävs', 400);
  const price = parsePricePerDay(payload.pricePerDay);
  const maxRow = await db.prepare(`SELECT MAX(sort_order) AS m FROM pads`).first();
  const sortOrder = (maxRow && maxRow.m != null ? Number(maxRow.m) : 0) + 1;
  const id = await nextPadId(db);
  await db
    .prepare(
      `INSERT INTO pads (id, name, description, price_per_day, active, sort_order)
       VALUES (?, ?, ?, ?, 1, ?)`
    )
    .bind(id, name, String(payload.description || '').trim(), price, sortOrder)
    .run();
  const list = await listPadsAdmin(db);
  return list.find((p) => p.id === id);
}

export async function updatePad(db, padId, payload) {
  const pad = await db.prepare(`SELECT * FROM pads WHERE id = ?`).bind(padId).first();
  if (!pad) throw softError('Pad saknas', 404);
  const name = typeof payload.name !== 'undefined' ? String(payload.name).trim() : pad.name;
  const description =
    typeof payload.description !== 'undefined'
      ? String(payload.description)
      : pad.description;
  const pricePerDay =
    typeof payload.pricePerDay !== 'undefined'
      ? parsePricePerDay(payload.pricePerDay)
      : pad.price_per_day;
  const active =
    typeof payload.active !== 'undefined'
      ? payload.active === true || payload.active === 'true' || payload.active === 1
        ? 1
        : 0
      : pad.active;
  const sortOrder =
    typeof payload.sortOrder !== 'undefined' ? Number(payload.sortOrder) : pad.sort_order;
  await db
    .prepare(
      `UPDATE pads SET name = ?, description = ?, price_per_day = ?, active = ?, sort_order = ?
       WHERE id = ?`
    )
    .bind(name, description, pricePerDay, active, sortOrder, padId)
    .run();
  const list = await listPadsAdmin(db);
  return list.find((p) => p.id === padId);
}

/** Deactivate (or reactivate); rows are never deleted so old bookings keep names. */
export async function setPadActive(db, padId, active) {
  const pad = await db.prepare(`SELECT id FROM pads WHERE id = ?`).bind(padId).first();
  if (!pad) throw softError('Utrustning saknas', 404);
  const next = active === true || active === 'true' || active === 1 ? 1 : 0;
  await db.prepare(`UPDATE pads SET active = ? WHERE id = ?`).bind(next, padId).run();
  const list = await listPadsAdmin(db);
  return list.find((p) => p.id === padId);
}
