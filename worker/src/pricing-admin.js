import { softError, uid } from './util.js';

export async function listPricingRulesAdmin(db) {
  const { results } = await db
    .prepare(
      `SELECT id, dimension, min_value AS minValue, percent_off AS percentOff,
              active, label
       FROM pricing_rules ORDER BY dimension, min_value`
    )
    .all();
  return (results || []).map((r) => ({
    id: r.id,
    dimension: r.dimension,
    minValue: Number(r.minValue),
    percentOff: Number(r.percentOff),
    active: !!r.active,
    label: r.label || '',
  }));
}

export async function savePricingRule(db, payload) {
  const dimension = String(payload.dimension || '').trim();
  if (!dimension) throw softError('Dimension krävs', 400);
  const minValue = Number(payload.minValue);
  const percentOff = Number(payload.percentOff);
  const active = payload.active !== false && payload.active !== 'false' && payload.active !== 0 ? 1 : 0;
  const label = String(payload.label || '');

  if (payload.id) {
    const existing = await db
      .prepare(`SELECT id FROM pricing_rules WHERE id = ?`)
      .bind(payload.id)
      .first();
    if (!existing) throw softError('Regel saknas', 404);
    await db
      .prepare(
        `UPDATE pricing_rules SET dimension = ?, min_value = ?, percent_off = ?, active = ?, label = ?
         WHERE id = ?`
      )
      .bind(dimension, minValue, percentOff, active, label, payload.id)
      .run();
    const list = await listPricingRulesAdmin(db);
    return list.find((r) => r.id === payload.id);
  }

  const id = uid();
  await db
    .prepare(
      `INSERT INTO pricing_rules (id, dimension, min_value, percent_off, active, label)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, dimension, minValue, percentOff, active, label)
    .run();
  const list = await listPricingRulesAdmin(db);
  return list.find((r) => r.id === id);
}

export async function deletePricingRule(db, id) {
  const res = await db.prepare(`DELETE FROM pricing_rules WHERE id = ?`).bind(id).run();
  if (!res.meta || res.meta.changes === 0) throw softError('Regel saknas', 404);
  return { ok: true };
}
