/**
 * VKK Rental API — Cloudflare Worker + D1.
 *
 * Same action JSON contract as the old Apps Script API. Double-booking is
 * rejected at submit time via UNIQUE(pad_id, day) locks inside an atomic batch.
 * Mail is fire-and-forget to a GAS webhook (see mail.js).
 */

import { json, softError, CORS_HEADERS, nowIso, kick } from './util.js';
import { getPublicConfig, getAdminConfig, saveAdminConfig } from './config.js';
import { getCalendar, getAvailability } from './calendar.js';
import {
  submitBooking,
  lookupBooking,
  getBookingByToken,
  guestRequestChange,
  guestCancelBooking,
  listBookingsAdmin,
  adminUpdateBooking,
  availablePadsForBooking,
  deleteBookingAdmin,
  purgeOldClosedBookings,
} from './bookings.js';
import {
  loginAdmin,
  logout,
  me,
  changePassword,
  requireAdmin,
  setup,
  requestPasswordReset,
  resetPasswordWithToken,
  sendUserPasswordReset,
  purgeExpiredPasswordResets,
} from './auth.js';
import { listPadsAdmin, createPad, updatePad, setPadActive } from './pads.js';
import {
  listPricingRulesAdmin,
  savePricingRule,
  deletePricingRule,
} from './pricing-admin.js';
import { listUsers, createUser, updateUser, deleteUser } from './users.js';
import {
  openDoor,
  confirmPickup,
  confirmReturn,
  pollDoor,
  completeDoor,
  getDoorPassByToken,
  createAndSendDoorPass,
  listDoorPasses,
  revokeDoorPass,
  deleteDoorPass,
  purgeExpiredDoorPasses,
} from './door.js';
import { adminOverview } from './admin.js';
import { getRentalStatsAdmin } from './stats.js';

async function readBody(request) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const payload = url.searchParams.get('payload');
    if (payload) {
      try {
        return JSON.parse(payload);
      } catch {
        return {};
      }
    }
    const body = {};
    for (const [k, v] of url.searchParams.entries()) {
      if (k !== 'callback' && k !== '_') body[k] = v;
    }
    return body;
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function sessionTokenFrom(body) {
  return body.sessionToken || body.token || '';
}

function secretsMatch(a, b) {
  const enc = new TextEncoder();
  const left = enc.encode(String(a || ''));
  const right = enc.encode(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

const BRIDGE_ACTIONS = new Set([
  'adminOverview',
  'listBookings',
  'adminUpdateBooking',
  'deleteBooking',
  'getRentalStats',
  'getAdminConfig',
  'saveAdminConfig',
  'availablePadsForBooking',
  'listPads',
  'updatePad',
  'createPad',
  'setPadActive',
  'listPricingRules',
  'savePricingRule',
  'deletePricingRule',
  'listDoorPasses',
  'createDoorPass',
  'revokeDoorPass',
  'deleteDoorPass',
]);

async function route(env, action, body, ctx, request) {
  const bridge = !!(
    request &&
    secretsMatch(request.headers.get('X-Rental-Bridge-Secret') || '', env.RENTAL_BRIDGE_SECRET || '')
  );
  if (bridge && !BRIDGE_ACTIONS.has(action)) {
    throw softError('Otillåten åtgärd', 403);
  }
  const sessionToken = sessionTokenFrom(body);
  const asAdmin = () => {
    if (bridge) {
      return {
        id: 'wallflow',
        email: '',
        firstName: 'WallFlow',
        lastName: '',
        role: 'admin',
        active: true,
      };
    }
    return requireAdmin(env, sessionToken);
  };

  switch (action) {
    case 'ping':
      return { ok: true, time: nowIso(), backend: 'cloudflare' };
    case 'health': {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM pads').first();
      return { ok: true, time: nowIso(), backend: 'cloudflare', pads: row ? row.n : 0 };
    }
    case 'setup':
      return setup(env, body);
    case 'getPublicConfig':
      return getPublicConfig(env.DB);
    case 'getAvailability':
      return getAvailability(env.DB, body.startDate, body.endDate);
    case 'getCalendar':
      return getCalendar(env.DB, body.from, body.to);
    case 'submitBooking':
      return submitBooking(env, body, ctx);
    case 'lookupBooking':
      return lookupBooking(env, body.bookingNumber, body.email);
    case 'getBookingByToken':
      return getBookingByToken(env.DB, body.magicToken || body.t);
    case 'guestRequestChange':
      return guestRequestChange(env, body.magicToken || body.t, body, ctx);
    case 'guestRequestCancel':
      return guestCancelBooking(env, body.magicToken || body.t, ctx);
    case 'openDoor':
      return openDoor(env, body.magicToken || body.t);
    case 'confirmPickup':
      return confirmPickup(env, body.magicToken || body.t, ctx);
    case 'confirmReturn':
      return confirmReturn(env, body.magicToken || body.t, ctx);
    case 'getDoorPass':
      return getDoorPassByToken(env.DB, body.magicToken || body.t);
    case 'createDoorPass':
      return createAndSendDoorPass(env, body, await asAdmin(), ctx);
    case 'listDoorPasses':
      await asAdmin();
      return { passes: await listDoorPasses(env.DB) };
    case 'revokeDoorPass':
      await asAdmin();
      return revokeDoorPass(env.DB, body.passId || body.id);
    case 'deleteDoorPass':
      await asAdmin();
      return deleteDoorPass(env.DB, body.passId || body.id);

    case 'login':
      return loginAdmin(env, body.email, body.password);
    case 'requestPasswordReset':
      return requestPasswordReset(env, body.email);
    case 'resetPassword':
      return resetPasswordWithToken(env, body.token || body.t, body.newPassword || body.password);
    case 'sendUserPasswordReset':
      await asAdmin();
      return sendUserPasswordReset(env, body.userId, body.kind);
    case 'logout':
      return logout(env, sessionToken || body.sessionToken);
    case 'me':
      return me(env, sessionToken);
    case 'changePassword':
      return changePassword(
        env,
        sessionToken,
        body.currentPassword,
        body.newPassword
      );
    case 'listBookings':
      await asAdmin();
      return { bookings: await listBookingsAdmin(env.DB, body) };
    case 'adminOverview': {
      const user = await asAdmin();
      const overview = await adminOverview(env, body, ctx);
      return Object.assign({ user }, overview);
    }
    case 'adminUpdateBooking':
      return adminUpdateBooking(
        env,
        body.bookingId,
        body,
        await asAdmin(),
        ctx
      );
    case 'deleteBooking':
      await asAdmin();
      return deleteBookingAdmin(env.DB, body.bookingId);
    case 'getRentalStats':
      await asAdmin();
      return getRentalStatsAdmin(env.DB, body);
    case 'getAdminConfig':
      await asAdmin();
      return getAdminConfig(env.DB);
    case 'saveAdminConfig':
      await asAdmin();
      return saveAdminConfig(env.DB, body);
    case 'availablePadsForBooking':
      await asAdmin();
      return {
        pads: await availablePadsForBooking(env.DB, body.bookingId, {
          startDate: body.startDate,
          endDate: body.endDate,
        }),
      };
    case 'listUsers':
      await asAdmin();
      return { users: await listUsers(env.DB) };
    case 'createUser':
      await asAdmin();
      return { user: await createUser(env, body) };
    case 'updateUser':
      await asAdmin();
      return { user: await updateUser(env, body.userId, body) };
    case 'deleteUser':
      await asAdmin();
      return deleteUser(env, body.userId);
    case 'listPads':
      await asAdmin();
      return { pads: await listPadsAdmin(env.DB) };
    case 'updatePad':
      await asAdmin();
      return { pad: await updatePad(env.DB, body.padId, body) };
    case 'createPad':
      await asAdmin();
      return { pad: await createPad(env.DB, body) };
    case 'setPadActive':
      await asAdmin();
      return { pad: await setPadActive(env.DB, body.padId, body.active) };
    case 'listPricingRules':
      await asAdmin();
      return { rules: await listPricingRulesAdmin(env.DB) };
    case 'savePricingRule':
      await asAdmin();
      return { rule: await savePricingRule(env.DB, body) };
    case 'deletePricingRule':
      await asAdmin();
      return deletePricingRule(env.DB, body.id);
    case 'pollDoor':
      return pollDoor(env, body.apiKey);
    case 'completeDoor':
      return completeDoor(env, body.apiKey, body.commandId);
    default:
      throw softError('Okänd action: ' + action, 404);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      const body = await readBody(request);
      const action = body.action || 'ping';
      const result = await route(env, action, body, ctx, request);
      return json(result);
    } catch (err) {
      const status = err.status || 500;
      const out = { error: err.message || String(err), status };
      if (err.code) out.code = err.code;
      if (err.details) out.details = err.details;
      return json(out, status >= 400 && status < 600 ? status : 500);
    }
  },
  async scheduled(event, env, ctx) {
    kick(ctx, purgeOldClosedBookings(env.DB));
    kick(ctx, purgeExpiredDoorPasses(env.DB));
    kick(ctx, purgeExpiredPasswordResets(env.DB));
  },
};
