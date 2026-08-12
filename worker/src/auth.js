/**
 * Password hashing + admin sessions (D1).
 * Hash algorithm matches GAS for future hash migration; pepper is env.PASSWORD_PEPPER.
 */

import { softError, nowIso, randomHex } from './util.js';
import { getConfigMap } from './config.js';

function pepper(env) {
  const p = env.PASSWORD_PEPPER;
  if (!p) throw softError('PASSWORD_PEPPER saknas', 500);
  return p;
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** material = salt + '|' + password + '|' + pepper; HMAC-SHA256(material, key=pepper) → hex */
export async function hashPassword(env, password, salt) {
  const pep = pepper(env);
  const material = salt + '|' + String(password) + '|' + pep;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(pep),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(material));
  return toHex(sig);
}

export async function verifyPassword(env, password, salt, expectedHash) {
  const got = await hashPassword(env, password, salt);
  return got === expectedHash;
}

export function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name || row.firstName,
    lastName: row.last_name || row.lastName,
    role: row.role,
    active: !!(row.active === 1 || row.active === true),
  };
}

export async function createSession(env, user) {
  const db = env.DB;
  const cfg = await getConfigMap(db);
  const hours = Number(cfg.sessionHours || 0);
  const token = randomHex(32);
  const permanent = !(hours > 0);
  const expiresAt = permanent
    ? '9999-12-31T23:59:59.000Z'
    : new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const now = nowIso();
  await db
    .prepare(`INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`)
    .bind(token, user.id, expiresAt, now)
    .run();
  return { token, expiresAt, permanent };
}

export async function revokeSession(env, token) {
  if (!token) return false;
  await env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  return true;
}

export async function revokeSessionsForUser(env, userId) {
  await env.DB.prepare(`DELETE FROM sessions WHERE user_id = ?`).bind(userId).run();
}

function sessionExpired(expiresAt) {
  if (!expiresAt || String(expiresAt).indexOf('9999') === 0) return false;
  const t = new Date(expiresAt).getTime();
  if (isNaN(t)) return false;
  return t < Date.now();
}

export async function getSessionUser(env, token) {
  if (!token) return null;
  const row = await env.DB
    .prepare(
      `SELECT s.token, s.expires_at AS expiresAt,
              u.id, u.email, u.first_name AS firstName, u.last_name AS lastName,
              u.role, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .bind(token)
    .first();
  if (!row) return null;
  if (sessionExpired(row.expiresAt)) {
    await revokeSession(env, token);
    return null;
  }
  if (!row.active || row.role !== 'admin') return null;
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    active: true,
  };
}

export async function requireAdmin(env, token) {
  const user = await getSessionUser(env, token);
  if (!user) throw softError('Unauthorized', 401);
  return user;
}

export async function loginAdmin(env, email, password) {
  const wanted = String(email || '').trim().toLowerCase();
  const row = await env.DB
    .prepare(
      `SELECT id, email, first_name, last_name, password_hash, salt, role, active
       FROM users WHERE lower(email) = ?`
    )
    .bind(wanted)
    .first();
  const ok =
    row &&
    row.active &&
    (await verifyPassword(env, password, row.salt, row.password_hash));
  if (!ok) throw softError('Fel e-post eller lösenord', 401);
  const user = sanitizeUser(row);
  return { user, session: await createSession(env, user) };
}

export async function me(env, token) {
  return { user: await requireAdmin(env, token) };
}

export async function logout(env, token) {
  await revokeSession(env, token);
  return { ok: true };
}

/**
 * First-run setup: create default admin when no users exist.
 * Requires env.SETUP_SECRET matching body.setupSecret.
 */
export async function setup(env, body) {
  const secret = env.SETUP_SECRET || '';
  if (!secret || String(body.setupSecret || '') !== String(secret)) {
    throw softError('Unauthorized', 401);
  }

  await env.DB
    .prepare(`INSERT OR IGNORE INTO counters (key, value) VALUES ('bookingNumber', 0)`)
    .run();

  const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first();
  if (countRow && countRow.n > 0) {
    return { ok: true, created: false, message: 'Users already exist' };
  }

  const email = String(env.SETUP_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const password = String(env.SETUP_ADMIN_PASSWORD || 'Admin123!');
  const firstName = String(env.SETUP_ADMIN_FIRST_NAME || 'Admin');
  const lastName = String(env.SETUP_ADMIN_LAST_NAME || 'User');
  const salt = randomHex(16);
  const passwordHash = await hashPassword(env, password, salt);
  const now = nowIso();
  const id = crypto.randomUUID();

  await env.DB
    .prepare(
      `INSERT INTO users (id, email, first_name, last_name, password_hash, salt, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, ?, ?)`
    )
    .bind(id, email, firstName, lastName, passwordHash, salt, now, now)
    .run();

  return { ok: true, created: true, email };
}
