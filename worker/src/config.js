import { loadActivePads, loadPricingRules } from './pricing.js';

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
