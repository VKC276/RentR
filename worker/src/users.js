import { softError, nowIso, uid, randomHex } from './util.js';
import { hashPassword, sanitizeUser, revokeSessionsForUser } from './auth.js';

export async function listUsers(db) {
  const { results } = await db
    .prepare(
      `SELECT id, email, first_name, last_name, role, active FROM users ORDER BY email`
    )
    .all();
  return (results || []).map(sanitizeUser);
}

async function countActiveAdmins(db) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM users WHERE active = 1 AND role = 'admin'`)
    .first();
  return row ? Number(row.n) : 0;
}

export async function createUser(env, payload) {
  const db = env.DB;
  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || !payload.password || !payload.firstName || !payload.lastName) {
    throw softError('Alla fält krävs', 400);
  }
  const existing = await db.prepare(`SELECT id FROM users WHERE lower(email) = ?`).bind(email).first();
  if (existing) throw softError('E-post används redan', 400);

  const salt = randomHex(16);
  const passwordHash = await hashPassword(env, payload.password, salt);
  const now = nowIso();
  const id = uid();
  await db
    .prepare(
      `INSERT INTO users (id, email, first_name, last_name, password_hash, salt, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, ?, ?)`
    )
    .bind(
      id,
      email,
      String(payload.firstName).trim(),
      String(payload.lastName).trim(),
      passwordHash,
      salt,
      now,
      now
    )
    .run();
  const row = await db
    .prepare(`SELECT id, email, first_name, last_name, role, active FROM users WHERE id = ?`)
    .bind(id)
    .first();
  return sanitizeUser(row);
}

export async function updateUser(env, userId, payload) {
  const db = env.DB;
  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
  if (!user) throw softError('Användare saknas', 404);

  let email = user.email;
  let firstName = user.first_name;
  let lastName = user.last_name;
  let active = user.active;
  let salt = user.salt;
  let passwordHash = user.password_hash;
  let revoke = false;

  if (payload.firstName) firstName = String(payload.firstName).trim();
  if (payload.lastName) lastName = String(payload.lastName).trim();
  if (payload.email) {
    email = String(payload.email).trim().toLowerCase();
    const existing = await db
      .prepare(`SELECT id FROM users WHERE lower(email) = ? AND id != ?`)
      .bind(email, userId)
      .first();
    if (existing) throw softError('E-post används redan', 400);
    if (email !== user.email) revoke = true;
  }
  if (typeof payload.active !== 'undefined') {
    const makingInactive = payload.active === false || payload.active === 'false' || payload.active === 0;
    if (makingInactive && user.active) {
      if ((await countActiveAdmins(db)) <= 1) {
        throw softError('Sista aktiva admin kan inte inaktiveras', 400);
      }
    }
    active = makingInactive ? 0 : 1;
    if (!active) revoke = true;
  }
  if (payload.password) {
    salt = randomHex(16);
    passwordHash = await hashPassword(env, payload.password, salt);
    revoke = true;
  }

  await db
    .prepare(
      `UPDATE users SET email = ?, first_name = ?, last_name = ?, password_hash = ?, salt = ?,
       active = ?, updated_at = ? WHERE id = ?`
    )
    .bind(email, firstName, lastName, passwordHash, salt, active, nowIso(), userId)
    .run();

  if (revoke) await revokeSessionsForUser(env, userId);

  const row = await db
    .prepare(`SELECT id, email, first_name, last_name, role, active FROM users WHERE id = ?`)
    .bind(userId)
    .first();
  return sanitizeUser(row);
}

export async function deleteUser(env, userId) {
  const db = env.DB;
  const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
  if (!user) throw softError('Användare saknas', 404);
  if (user.active && (await countActiveAdmins(db)) <= 1) {
    throw softError('Sista aktiva admin kan inte raderas', 400);
  }
  await revokeSessionsForUser(env, userId);
  await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
  return { ok: true };
}
