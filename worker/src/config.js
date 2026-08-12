import { loadActivePads, loadPricingRules } from './pricing.js';

export const DEFAULT_CLOSED_BOOKING_RETENTION_MONTHS = 6;
export const CLOSED_BOOKING_STATUSES = ['Returned', 'Cancelled', 'Rejected'];

export function closedBookingRetentionMonths(cfg) {
  const n = Number(cfg && cfg.closedBookingRetentionMonths);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_CLOSED_BOOKING_RETENTION_MONTHS;
  return Math.floor(n);
}

export async function getConfigMap(db) {
  const { results } = await db.prepare(`SELECT key, value FROM config`).all();
  const map = {};
  for (const r of results || []) map[r.key] = r.value;
  return map;
}

export async function getPublicConfig(db) {
  const cfg = await getConfigMap(db);
  const pads = await loadActivePads(db);
  const pricingRules = await loadPricingRules(db);
  return {
    appName: cfg.appName || 'RentR',
    currency: cfg.currency || 'SEK',
    defaultPricePerDay: Number(cfg.defaultPricePerDay || 150),
    pagesBaseUrl: (cfg.pagesBaseUrl || '').replace(/\/$/, ''),
    pads,
    pricingRules,
  };
}

export async function getAdminConfig(db) {
  const cfg = await getConfigMap(db);
  return {
    closedBookingRetentionMonths: closedBookingRetentionMonths(cfg),
  };
}

export async function saveAdminConfig(db, body) {
  const raw = Number(body.closedBookingRetentionMonths);
  const months = Number.isFinite(raw)
    ? Math.max(0, Math.min(120, Math.floor(raw)))
    : DEFAULT_CLOSED_BOOKING_RETENTION_MONTHS;
  await db
    .prepare(
      `INSERT INTO config (key, value) VALUES ('closedBookingRetentionMonths', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind(String(months))
    .run();
  return getAdminConfig(db);
}
