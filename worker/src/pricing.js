import { softError, calcDays } from './util.js';

export async function loadActivePads(db) {
  const { results } = await db
    .prepare(
      `SELECT id, name, description, price_per_day AS pricePerDay, sort_order AS sortOrder
       FROM pads WHERE active = 1 ORDER BY sort_order, name`
    )
    .all();
  return results || [];
}

export async function loadPricingRules(db) {
  const { results } = await db
    .prepare(
      `SELECT id, dimension, min_value AS minValue, percent_off AS percentOff, label
       FROM pricing_rules WHERE active = 1`
    )
    .all();
  return results || [];
}

export async function calculatePrice(db, padIds, startDate, endDate) {
  const days = calcDays(startDate, endDate);
  if (!padIds.length) throw softError('Välj utrustning att boka', 400);

  const pads = await loadActivePads(db);
  const byId = Object.fromEntries(pads.map((p) => [p.id, p]));
  const padLines = padIds.map((id) => {
    const p = byId[id];
    if (!p) throw softError('Okänd utrustning: ' + id, 400);
    return { padId: p.id, name: p.name, pricePerDay: Number(p.pricePerDay) };
  });

  const priceBase = padLines.reduce((s, l) => s + l.pricePerDay, 0) * days;
  const rules = await loadPricingRules(db);

  function best(dimension, value) {
    let pick = null;
    for (const r of rules) {
      if (r.dimension !== dimension) continue;
      if (Number(r.minValue) > value) continue;
      if (!pick || Number(r.minValue) > Number(pick.minValue)) pick = r;
    }
    return pick
      ? { minValue: Number(pick.minValue), percentOff: Number(pick.percentOff), label: pick.label }
      : null;
  }

  const daysRule = best('days', days);
  const padsRule = best('pads', padIds.length);
  let price = priceBase;
  let priceDiscount = 0;
  if (daysRule) {
    const d = Math.round(price * (daysRule.percentOff / 100) * 100) / 100;
    priceDiscount += d;
    price -= d;
  }
  if (padsRule) {
    const d = Math.round(price * (padsRule.percentOff / 100) * 100) / 100;
    priceDiscount += d;
    price -= d;
  }
  price = Math.round(price * 100) / 100;
  priceDiscount = Math.round(priceDiscount * 100) / 100;

  const currencyRow = await db.prepare(`SELECT value FROM config WHERE key = 'currency'`).first();
  return {
    days,
    currency: (currencyRow && currencyRow.value) || 'SEK',
    padLines,
    priceBase: Math.round(priceBase * 100) / 100,
    priceDiscount,
    priceTotal: price,
    discounts: { days: daysRule, pads: padsRule },
    explanation: { inclusive: true, startDate, endDate, days },
  };
}
