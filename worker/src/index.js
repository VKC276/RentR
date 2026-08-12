/**
 * RentR API — Cloudflare Worker + D1.
 *
 * Same action JSON contract as the old Apps Script API. Double-booking is
 * rejected at submit time via UNIQUE(pad_id, day) locks inside an atomic batch.
 */

import { json, softError, CORS_HEADERS, nowIso } from './util.js';
import { getPublicConfig } from './config.js';
import { getCalendar } from './calendar.js';
import { submitBooking } from './bookings.js';

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

async function route(env, action, body) {
  switch (action) {
    case 'ping':
      return { ok: true, time: nowIso(), backend: 'cloudflare' };
    case 'health': {
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM pads').first();
      return { ok: true, time: nowIso(), backend: 'cloudflare', pads: row ? row.n : 0 };
    }
    case 'getPublicConfig':
      return getPublicConfig(env.DB);
    case 'getCalendar':
      return getCalendar(env.DB, body.from, body.to);
    case 'submitBooking':
      return submitBooking(env, body);
    default:
      throw softError('Okänd action: ' + action, 404);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    try {
      const body = await readBody(request);
      const action = body.action || 'ping';
      const result = await route(env, action, body);
      return json(result);
    } catch (err) {
      const status = err.status || 500;
      const out = { error: err.message || String(err), status };
      if (err.code) out.code = err.code;
      if (err.details) out.details = err.details;
      return json(out, status >= 400 && status < 600 ? status : 500);
    }
  },
};
