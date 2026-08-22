/**
 * Anonymized rental statistics. Rows are written when a booking becomes
 * Returned and kept when the booking itself is deleted for GDPR retention.
 */

import { softError, nowIso, uid } from './util.js';

function effectiveTotal(row) {
  const hasOverride =
    row.price_override !== null &&
    row.price_override !== undefined &&
    String(row.price_override) !== '';
  return hasOverride ? Number(row.price_override) : Number(row.price_total) || 0;
}

function yearMonthFromYmd(ymd) {
  const m = /^(\d{4})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return { year: 0, month: 0 };
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** Persist one anonymized line per pad for a Returned booking (idempotent). */
export async function recordRentalStatsForBooking(db, bookingId) {
  const b = await db
    .prepare(
      `SELECT id, status, start_date, end_date, days,
              price_total, price_override
       FROM bookings WHERE id = ?`
    )
    .bind(bookingId)
    .first();
  if (!b || b.status !== 'Returned') return { recorded: false, reason: 'not_returned' };

  const existing = await db
    .prepare(`SELECT id FROM rental_stats WHERE booking_ref = ? LIMIT 1`)
    .bind(bookingId)
    .first();
  if (existing) return { recorded: false, reason: 'already' };

  const { results: padRows } = await db
    .prepare(
      `SELECT bp.pad_id AS padId, p.name AS padName
       FROM booking_pads bp
       JOIN pads p ON p.id = bp.pad_id
       WHERE bp.booking_id = ?`
    )
    .bind(bookingId)
    .all();
  const pads = padRows || [];
  if (!pads.length) return { recorded: false, reason: 'no_pads' };

  const days = Math.max(1, Number(b.days) || 1);
  const total = effectiveTotal(b);
  const share = Math.round((total / pads.length) * 100) / 100;
  // Put remainder on the last pad so the sum matches the booking total.
  let allocated = 0;
  const { year, month } = yearMonthFromYmd(b.start_date);
  const now = nowIso();

  for (let i = 0; i < pads.length; i++) {
    const pad = pads[i];
    const amount =
      i === pads.length - 1
        ? Math.round((total - allocated) * 100) / 100
        : share;
    allocated += amount;
    await db
      .prepare(
        `INSERT INTO rental_stats
         (id, booking_ref, pad_id, pad_name, start_date, end_date, days,
          amount, year, month, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        uid(),
        bookingId,
        pad.padId,
        pad.padName || pad.padId,
        b.start_date,
        b.end_date,
        days,
        amount,
        year,
        month,
        now
      )
      .run();
  }
  return { recorded: true, pads: pads.length, amount: total };
}

export async function clearRentalStatsForBooking(db, bookingId) {
  await db.prepare(`DELETE FROM rental_stats WHERE booking_ref = ?`).bind(bookingId).run();
  return { ok: true };
}

/** Capture any Returned bookings that were never written to stats. */
export async function backfillReturnedStats(db) {
  const { results } = await db
    .prepare(
      `SELECT b.id FROM bookings b
       WHERE b.status = 'Returned'
         AND NOT EXISTS (
           SELECT 1 FROM rental_stats s WHERE s.booking_ref = b.id
         )`
    )
    .all();

  let recorded = 0;
  for (const row of results || []) {
    const res = await recordRentalStatsForBooking(db, row.id);
    if (res.recorded) recorded++;
  }
  return { recorded, candidates: (results || []).length };
}

function buildFilterSql(query) {
  const clauses = [];
  const binds = [];
  const from = String(query.from || query.fromDate || '').trim();
  const to = String(query.to || query.toDate || '').trim();
  const padId = String(query.padId || '').trim();
  const year = query.year !== undefined && query.year !== '' ? Number(query.year) : null;
  const month = query.month !== undefined && query.month !== '' ? Number(query.month) : null;

  if (from) {
    clauses.push('end_date >= ?');
    binds.push(from);
  }
  if (to) {
    clauses.push('start_date <= ?');
    binds.push(to);
  }
  if (padId) {
    clauses.push('pad_id = ?');
    binds.push(padId);
  }
  if (Number.isFinite(year) && year > 0) {
    clauses.push('year = ?');
    binds.push(Math.floor(year));
  }
  if (Number.isFinite(month) && month >= 1 && month <= 12) {
    clauses.push('month = ?');
    binds.push(Math.floor(month));
  }

  return {
    where: clauses.length ? 'WHERE ' + clauses.join(' AND ') : '',
    binds,
    applied: { from: from || null, to: to || null, padId: padId || null, year, month },
  };
}

export async function getRentalStats(db, query = {}) {
  await backfillReturnedStats(db);

  const { where, binds, applied } = buildFilterSql(query || {});

  const { results: lines } = await db
    .prepare(
      `SELECT pad_id AS padId, pad_name AS padName, days, amount, booking_ref AS bookingRef,
              start_date AS startDate, end_date AS endDate, year, month
       FROM rental_stats
       ${where}
       ORDER BY start_date DESC, pad_name`
    )
    .bind(...binds)
    .all();

  const byPad = {};
  let totalDays = 0;
  let totalAmount = 0;
  const bookingRefs = {};

  for (const row of lines || []) {
    const key = row.padId;
    if (!byPad[key]) {
      byPad[key] = {
        padId: row.padId,
        padName: row.padName,
        rentalDays: 0,
        amount: 0,
        bookings: 0,
      };
    }
    byPad[key].rentalDays += Number(row.days) || 0;
    byPad[key].amount += Number(row.amount) || 0;
    byPad[key].bookings += 1;
    totalDays += Number(row.days) || 0;
    totalAmount += Number(row.amount) || 0;
    bookingRefs[row.bookingRef] = true;
  }

  const pads = Object.values(byPad)
    .map((p) => ({
      ...p,
      amount: Math.round(p.amount * 100) / 100,
    }))
    .sort((a, b) => b.rentalDays - a.rentalDays || a.padName.localeCompare(b.padName, 'sv'));

  const { results: yearRows } = await db
    .prepare(`SELECT DISTINCT year FROM rental_stats ORDER BY year DESC`)
    .all();

  const { results: padOptions } = await db
    .prepare(
      `SELECT pad_id AS padId, MAX(pad_name) AS padName
       FROM rental_stats
       GROUP BY pad_id
       ORDER BY padName`
    )
    .all();

  return {
    filters: applied,
    pads,
    totals: {
      rentalDays: totalDays,
      amount: Math.round(totalAmount * 100) / 100,
      bookings: Object.keys(bookingRefs).length,
      lines: (lines || []).length,
    },
    years: (yearRows || []).map((r) => r.year),
    padOptions: padOptions || [],
  };
}

export async function getRentalStatsAdmin(db, query) {
  if (!db) throw softError('Databas saknas', 500);
  return getRentalStats(db, query);
}
