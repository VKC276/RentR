export function softError(message, status = 400, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details) err.details = details;
  return err;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function nowIso() {
  return new Date().toISOString();
}

export function uid() {
  return crypto.randomUUID();
}

export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Inclusive YYYY-MM-DD range as a list of day strings. */
export function eachDate(from, to) {
  const out = [];
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end || start > end) {
    throw softError('Ogiltigt datumintervall', 400);
  }
  for (let d = new Date(start.getTime()); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(formatYmd(d));
  }
  return out;
}

export function calcDays(from, to) {
  return eachDate(from, to).length;
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function formatYmd(d) {
  return d.toISOString().slice(0, 10);
}

export function parsePadIds(value) {
  const list = Array.isArray(value)
    ? value.map(String)
    : String(value || '').split(',').map((s) => s.trim());
  const seen = {};
  return list.filter((id) => {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });
}

/** YYYY-MM-DD in Europe/Stockholm (same as GAS todayYmd_). */
export function todayYmd(timeZone = 'Europe/Stockholm') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  return String(aStart) <= String(bEnd) && String(bStart) <= String(aEnd);
}

export const BLOCKING_STATUSES = {
  Requested: true,
  Approved: true,
  ChangePending: true,
  CancelPending: true,
  HandedOut: true,
};

const STATUS_LABELS = {
  sv: {
    Requested: 'Förfrågan',
    Approved: 'Godkänd',
    Rejected: 'Avslagen',
    ChangePending: 'Ändring väntar',
    CancelPending: 'Avbokning väntar',
    HandedOut: 'Utlämnad',
    Returned: 'Återlämnad',
    Cancelled: 'Avbokad',
  },
  en: {
    Requested: 'Requested',
    Approved: 'Approved',
    Rejected: 'Rejected',
    ChangePending: 'Change pending',
    CancelPending: 'Cancel pending',
    HandedOut: 'Handed out',
    Returned: 'Returned',
    Cancelled: 'Cancelled',
  },
  de: {
    Requested: 'Angefragt',
    Approved: 'Genehmigt',
    Rejected: 'Abgelehnt',
    ChangePending: 'Änderung ausstehend',
    CancelPending: 'Storno ausstehend',
    HandedOut: 'Ausgegeben',
    Returned: 'Zurückgegeben',
    Cancelled: 'Storniert',
  },
};

export function statusLabel(status, locale) {
  const dict = STATUS_LABELS[locale] || STATUS_LABELS.sv;
  return dict[status] || status;
}

/** Fire-and-forget mail / background work; prefer waitUntil when available. */
export function kick(ctx, promise) {
  const p = Promise.resolve(promise).catch((err) => {
    console.error('Bakgrundsjobb misslyckades', String(err && err.message ? err.message : err));
  });
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
}
