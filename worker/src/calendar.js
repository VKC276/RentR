import { softError, eachDate } from './util.js';
import { loadActivePads } from './pricing.js';
import { getPublicConfig } from './config.js';

/**
 * Calendar: for each day, blocked = indices into pads[] that are locked.
 * Locks come from pad_day_locks (authoritative) so a just-submitted booking
 * is visible immediately and cannot be double-booked.
 */
export async function getCalendar(db, from, to) {
  eachDate(from, to); // validate
  const pads = await loadActivePads(db);
  const padIndex = Object.fromEntries(pads.map((p, i) => [p.id, i]));

  const { results: locks } = await db
    .prepare(
      `SELECT pad_id AS padId, day FROM pad_day_locks
       WHERE day >= ? AND day <= ?`
    )
    .bind(from, to)
    .all();

  const byDay = {};
  for (const row of locks || []) {
    const i = padIndex[row.padId];
    if (i === undefined) continue;
    (byDay[row.day] || (byDay[row.day] = {}))[i] = true;
  }

  const days = eachDate(from, to).map((date) => ({
    date,
    blocked: Object.keys(byDay[date] || {})
      .map(Number)
      .sort((a, b) => a - b),
  }));

  return {
    config: await getPublicConfig(db),
    calendar: { from, to, pads, days },
  };
}

/**
 * Which of the requested pads already have a lock on any day in the range.
 * Returns [{ id, name }]. excludeBookingId ignores that booking's own locks.
 */
export async function findUnavailablePads(db, padIds, startDate, endDate, excludeBookingId) {
  if (!padIds.length) return [];
  eachDate(startDate, endDate); // validate
  const placeholders = padIds.map(() => '?').join(',');
  let sql = `SELECT DISTINCT pad_id AS padId FROM pad_day_locks
       WHERE pad_id IN (${placeholders})
         AND day >= ? AND day <= ?`;
  const binds = [...padIds, startDate, endDate];
  if (excludeBookingId) {
    sql += ` AND booking_id != ?`;
    binds.push(excludeBookingId);
  }
  const { results } = await db.prepare(sql).bind(...binds).all();

  if (!results || !results.length) return [];
  const taken = new Set(results.map((r) => r.padId));
  const pads = await loadActivePads(db);
  const names = Object.fromEntries(pads.map((p) => [p.id, p.name]));
  return padIds
    .filter((id) => taken.has(id))
    .map((id) => ({ id, name: names[id] || id }));
}

export async function assertPadsAvailable(db, padIds, startDate, endDate, excludeBookingId) {
  const unavailable = await findUnavailablePads(
    db,
    padIds,
    startDate,
    endDate,
    excludeBookingId
  );
  if (!unavailable.length) return;
  throw softError(
    'Inte längre ledig för valt intervall: ' + unavailable.map((p) => p.name).join(', '),
    409,
    'padsUnavailable',
    { unavailablePads: unavailable }
  );
}

/** Per-pad availability for a date range (legacy getAvailability action). */
export async function getAvailability(db, startDate, endDate) {
  const days = eachDate(startDate, endDate).length;
  const pads = await loadActivePads(db);
  const padIds = pads.map((p) => p.id);
  const unavailable = await findUnavailablePads(db, padIds, startDate, endDate);
  const taken = new Set(unavailable.map((p) => p.id));
  return {
    startDate,
    endDate,
    days,
    pads: pads.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      pricePerDay: p.pricePerDay,
      available: !taken.has(p.id),
    })),
  };
}
