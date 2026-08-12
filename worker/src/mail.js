/**
 * Mail templates + fire-and-forget GAS webhook.
 * Messages include both plain text and simple HTML so Gmail renders cleanly.
 */

import { statusLabel } from './util.js';
import { getConfigMap } from './config.js';

const APP_NAME = 'RentR';

const MAIL_I18N = {
  sv: {
    createdSubject: 'Bokningsförfrågan {{bookingNumber}} mottagen',
    createdIntro: 'Din förfrågan är mottagen och väntar på godkännande.',
    statusSubject: 'Bokning {{bookingNumber}}: {{status}}',
    statusIntro: 'Status för din bokning har uppdaterats.',
    cancelledSubject: 'Bokning {{bookingNumber}} är avbokad',
    cancelledIntro: 'Din bokning är avbokad och datumen är åter lediga. Inget mer behövs från dig.',
    adminNewSubject: 'Ny förfrågan {{bookingNumber}}',
    adminNewIntro: 'En ny bokningsförfrågan har kommit in.',
    adminChangeSubject: 'Ändring begärd {{bookingNumber}}',
    adminChangeIntro: 'Gästen har begärt en ändring av bokningen.',
    adminCancelledSubject: 'Avbokad {{bookingNumber}}',
    adminCancelledIntro: 'Gästen har avbokat. Datumen är åter bokningsbara — ingen åtgärd behövs.',
    doorPassSubject: 'Dörrlänk {{start}} – {{end}}',
    doorPassIntro: 'Här är din länk för att öppna förrådet. Open door fungerar endast under giltighetstiden.',
    labelPeriod: 'Period',
    labelDays: 'Dygn',
    labelPads: 'Utrustning',
    labelTotal: 'Summa',
    labelStatus: 'Status',
    labelGuest: 'Gäst',
    labelManage: 'Hantera bokning',
    labelOpen: 'Öppna dörr',
    labelValid: 'Giltig',
    daysNote: 'Start- och slutdatum räknas som hela dygn.',
    payNote: 'Betalning sker enligt överenskommelse / på plats.',
    greeting: 'Hej {{name}},',
    signoff: 'Vänliga hälsningar\nRentR',
  },
  en: {
    createdSubject: 'Booking request {{bookingNumber}} received',
    createdIntro: 'Your request was received and is waiting for approval.',
    statusSubject: 'Booking {{bookingNumber}}: {{status}}',
    statusIntro: 'The status of your booking has been updated.',
    cancelledSubject: 'Booking {{bookingNumber}} is cancelled',
    cancelledIntro: 'Your booking is cancelled and the dates are free again. Nothing further is needed from you.',
    adminNewSubject: 'New request {{bookingNumber}}',
    adminNewIntro: 'A new booking request has arrived.',
    adminChangeSubject: 'Change requested {{bookingNumber}}',
    adminChangeIntro: 'The guest requested a change to the booking.',
    adminCancelledSubject: 'Cancelled {{bookingNumber}}',
    adminCancelledIntro: 'The guest cancelled. The dates are bookable again — no action needed.',
    doorPassSubject: 'Door link {{start}} – {{end}}',
    doorPassIntro: 'Here is your link to open the storage. Open door only works during the validity period.',
    labelPeriod: 'Period',
    labelDays: 'Days',
    labelPads: 'Equipment',
    labelTotal: 'Total',
    labelStatus: 'Status',
    labelGuest: 'Guest',
    labelManage: 'Manage booking',
    labelOpen: 'Open door',
    labelValid: 'Valid',
    daysNote: 'Start and end dates each count as a full day.',
    payNote: 'Payment is arranged separately / on site.',
    greeting: 'Hi {{name}},',
    signoff: 'Best regards\nRentR',
  },
  de: {
    createdSubject: 'Buchungsanfrage {{bookingNumber}} erhalten',
    createdIntro: 'Ihre Anfrage wurde erhalten und wartet auf Freigabe.',
    statusSubject: 'Buchung {{bookingNumber}}: {{status}}',
    statusIntro: 'Der Status Ihrer Buchung wurde aktualisiert.',
    cancelledSubject: 'Buchung {{bookingNumber}} ist storniert',
    cancelledIntro: 'Ihre Buchung ist storniert und die Daten sind wieder frei. Es ist nichts weiter zu tun.',
    adminNewSubject: 'Neue Anfrage {{bookingNumber}}',
    adminNewIntro: 'Eine neue Buchungsanfrage ist eingegangen.',
    adminChangeSubject: 'Änderung angefragt {{bookingNumber}}',
    adminChangeIntro: 'Der Gast hat eine Änderung der Buchung angefragt.',
    adminCancelledSubject: 'Storniert {{bookingNumber}}',
    adminCancelledIntro: 'Der Gast hat storniert. Die Daten sind wieder buchbar — keine Aktion nötig.',
    doorPassSubject: 'Tür-Link {{start}} – {{end}}',
    doorPassIntro: 'Hier ist Ihr Link zum Öffnen des Lagers. Open door funktioniert nur während der Gültigkeit.',
    labelPeriod: 'Zeitraum',
    labelDays: 'Tage',
    labelPads: 'Ausrüstung',
    labelTotal: 'Summe',
    labelStatus: 'Status',
    labelGuest: 'Gast',
    labelManage: 'Buchung verwalten',
    labelOpen: 'Tür öffnen',
    labelValid: 'Gültig',
    daysNote: 'Start- und Enddatum zählen als volle Tage.',
    payNote: 'Zahlung erfolgt nach Absprache / vor Ort.',
    greeting: 'Hallo {{name}},',
    signoff: 'Freundliche Grüße\nRentR',
  },
};

function t(locale, key, vars) {
  const dict = MAIL_I18N[locale] || MAIL_I18N.sv;
  let text = dict[key] || MAIL_I18N.sv[key] || key;
  for (const [k, v] of Object.entries(vars || {})) {
    text = text.split('{{' + k + '}}').join(String(v ?? ''));
  }
  return text;
}

function mailSubject(text) {
  return APP_NAME + ' – ' + text;
}

function manageUrl(pagesBaseUrl, token) {
  return (pagesBaseUrl || '').replace(/\/$/, '') + '/booking.html?t=' + encodeURIComponent(token || '');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bookingVars(booking, magicToken, cfg) {
  const locale = booking.locale || 'sv';
  return {
    name: (booking.firstName + ' ' + booking.lastName).trim(),
    bookingNumber: booking.bookingNumber,
    start: booking.startDate,
    end: booking.endDate,
    days: booking.days,
    pads: (booking.pads || []).map((p) => p.name).join(', ') || '—',
    total: booking.priceTotal,
    currency: (cfg && cfg.currency) || 'SEK',
    status: statusLabel(booking.status, locale),
    email: booking.email,
    url: manageUrl(cfg && cfg.pagesBaseUrl, magicToken || ''),
    locale,
  };
}

/** Build a clean plain-text + HTML message pair. */
function compose(locale, opts) {
  const v = opts.vars || {};
  const rows = opts.rows || [];
  const greeting = t(locale, 'greeting', v);
  const signoff = t(locale, 'signoff', v);

  const textLines = [greeting, '', opts.intro || ''];
  if (opts.bookingNumber) textLines.push('', opts.bookingNumber);
  textLines.push('');
  for (const row of rows) {
    textLines.push(row.label + ': ' + row.value);
  }
  if (opts.notes && opts.notes.length) {
    textLines.push('');
    for (const n of opts.notes) textLines.push(n);
  }
  if (opts.ctaUrl) {
    textLines.push('', (opts.ctaLabel || 'Link') + ':', opts.ctaUrl);
  }
  textLines.push('', signoff);

  const rowHtml = rows
    .map(
      (row) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#5a6f7a;vertical-align:top;white-space:nowrap;">${escapeHtml(row.label)}</td>` +
        `<td style="padding:6px 0;color:#1a2b33;"><strong>${escapeHtml(row.value)}</strong></td></tr>`
    )
    .join('');

  const notesHtml = (opts.notes || [])
    .map((n) => `<p style="margin:8px 0 0;color:#5a6f7a;font-size:14px;">${escapeHtml(n)}</p>`)
    .join('');

  const ctaHtml = opts.ctaUrl
    ? `<p style="margin:24px 0 0;"><a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#0d6e6e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">${escapeHtml(opts.ctaLabel || 'Öppna')}</a></p>
       <p style="margin:10px 0 0;color:#5a6f7a;font-size:12px;word-break:break-all;">${escapeHtml(opts.ctaUrl)}</p>`
    : '';

  const html =
    `<div style="font-family:Segoe UI,Helvetica Neue,Arial,sans-serif;font-size:16px;line-height:1.45;color:#1a2b33;max-width:560px;margin:0 auto;padding:8px;">` +
    `<p style="margin:0 0 4px;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#0d6e6e;font-weight:700;">${escapeHtml(APP_NAME)}</p>` +
    (opts.bookingNumber
      ? `<p style="margin:0 0 16px;font-size:22px;font-weight:700;">${escapeHtml(opts.bookingNumber)}</p>`
      : '') +
    `<p style="margin:0 0 8px;">${escapeHtml(greeting)}</p>` +
    `<p style="margin:0 0 16px;">${escapeHtml(opts.intro || '')}</p>` +
    (rows.length
      ? `<table style="border-collapse:collapse;width:100%;margin:0 0 8px;background:#f4f8f8;border-radius:12px;overflow:hidden;"><tbody>${rowHtml}</tbody></table>`
      : '') +
    notesHtml +
    ctaHtml +
    `<p style="margin:28px 0 0;color:#5a6f7a;font-size:14px;white-space:pre-line;">${escapeHtml(signoff)}</p>` +
    `</div>`;

  return {
    subject: mailSubject(opts.subject),
    body: textLines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
    html,
  };
}

function bookingRows(locale, v, { withStatus = false, withTotal = true } = {}) {
  const rows = [
    { label: t(locale, 'labelPeriod'), value: `${v.start} – ${v.end}` },
    { label: t(locale, 'labelDays'), value: String(v.days) },
    { label: t(locale, 'labelPads'), value: v.pads },
  ];
  if (withTotal) rows.push({ label: t(locale, 'labelTotal'), value: `${v.total} ${v.currency}` });
  if (withStatus) rows.push({ label: t(locale, 'labelStatus'), value: v.status });
  return rows;
}

/**
 * Apps Script web apps often 302 to googleusercontent and drop the POST body
 * if the client follows redirects automatically. Re-POST manually instead.
 */
async function postMailWebhook(url, payload) {
  const body = JSON.stringify(payload);
  const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  let res = await fetch(url, { method: 'POST', headers, body, redirect: 'manual' });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('Location');
    if (!loc) {
      throw new Error('Mail-webhook redirect utan Location (' + res.status + ')');
    }
    res = await fetch(loc, { method: 'POST', headers, body, redirect: 'follow' });
  }

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = null;
  }

  if (!res.ok) {
    throw new Error(
      'Mail-webhook HTTP ' + res.status + (text ? ': ' + text.slice(0, 200) : '')
    );
  }
  if (parsed && parsed.error) {
    throw new Error('Mail-webhook: ' + parsed.error);
  }
  if (parsed && Array.isArray(parsed.errors) && parsed.errors.length) {
    throw new Error('Mail-webhook send errors: ' + parsed.errors.join('; '));
  }
  return parsed;
}

export async function sendMessages(env, messages) {
  const url = env.MAIL_WEBHOOK_URL;
  if (!url) {
    console.error('MAIL_WEBHOOK_URL saknas — inga mejl skickas');
    return;
  }
  if (!messages || !messages.length) return;

  try {
    await postMailWebhook(url, {
      action: 'relayMail',
      secret: env.MAIL_WEBHOOK_SECRET || '',
      messages,
    });
  } catch (err) {
    console.error('Kunde inte skicka mejl', String(err && err.message ? err.message : err));
    throw err;
  }
}

async function adminEmails(db) {
  const { results } = await db
    .prepare(`SELECT email FROM users WHERE active = 1 AND role = 'admin'`)
    .all();
  return (results || []).map((r) => r.email);
}

function toMessage(to, composed) {
  return { to, subject: composed.subject, body: composed.body, html: composed.html };
}

export async function mailBookingCreated(env, booking, magicToken) {
  const cfg = await getConfigMap(env.DB);
  const locale = booking.locale || 'sv';
  const v = bookingVars(booking, magicToken, cfg);
  const guest = compose(locale, {
    subject: t(locale, 'createdSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t(locale, 'createdIntro', v),
    vars: v,
    rows: bookingRows(locale, v),
    notes: [t(locale, 'daysNote'), t(locale, 'payNote')],
    ctaLabel: t(locale, 'labelManage'),
    ctaUrl: v.url,
  });
  const messages = [toMessage(booking.email, guest)];

  const admin = compose('sv', {
    subject: t('sv', 'adminNewSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t('sv', 'adminNewIntro', v),
    vars: { name: 'admin' },
    rows: [
      { label: t('sv', 'labelGuest'), value: `${v.name} (${v.email})` },
      ...bookingRows('sv', v),
    ],
    ctaLabel: t('sv', 'labelManage'),
    ctaUrl: v.url,
  });
  for (const to of await adminEmails(env.DB)) messages.push(toMessage(to, admin));
  await sendMessages(env, messages);
}

export async function mailGuestStatus(env, booking, magicToken) {
  const cfg = await getConfigMap(env.DB);
  const locale = booking.locale || 'sv';
  const v = bookingVars(booking, magicToken, cfg);
  const msg = compose(locale, {
    subject: t(locale, 'statusSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t(locale, 'statusIntro', v),
    vars: v,
    rows: bookingRows(locale, v, { withStatus: true }),
    ctaLabel: t(locale, 'labelManage'),
    ctaUrl: v.url,
  });
  await sendMessages(env, [toMessage(booking.email, msg)]);
}

export async function mailGuestCancelled(env, booking, magicToken) {
  const cfg = await getConfigMap(env.DB);
  const locale = booking.locale || 'sv';
  const v = bookingVars(booking, magicToken, cfg);
  const guest = compose(locale, {
    subject: t(locale, 'cancelledSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t(locale, 'cancelledIntro', v),
    vars: v,
    rows: bookingRows(locale, v, { withTotal: false }),
  });
  const messages = [toMessage(booking.email, guest)];
  const admin = compose('sv', {
    subject: t('sv', 'adminCancelledSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t('sv', 'adminCancelledIntro', v),
    vars: { name: 'admin' },
    rows: [
      { label: t('sv', 'labelGuest'), value: `${v.name} (${v.email})` },
      ...bookingRows('sv', v, { withTotal: false }),
    ],
    ctaLabel: t('sv', 'labelManage'),
    ctaUrl: v.url,
  });
  for (const to of await adminEmails(env.DB)) messages.push(toMessage(to, admin));
  await sendMessages(env, messages);
}

export async function mailAdminChange(env, booking, magicToken) {
  const cfg = await getConfigMap(env.DB);
  const v = bookingVars(booking, magicToken, cfg);
  const admin = compose('sv', {
    subject: t('sv', 'adminChangeSubject', v),
    bookingNumber: v.bookingNumber,
    intro: t('sv', 'adminChangeIntro', v),
    vars: { name: 'admin' },
    rows: [
      { label: t('sv', 'labelGuest'), value: `${v.name} (${v.email})` },
      ...bookingRows('sv', v),
    ],
    ctaLabel: t('sv', 'labelManage'),
    ctaUrl: v.url,
  });
  const admins = await adminEmails(env.DB);
  await sendMessages(env, admins.map((to) => toMessage(to, admin)));
}

export async function mailDoorPass(env, pass, url) {
  const locale = pass.locale || 'sv';
  const vars = { name: pass.recipientName, start: pass.startDate, end: pass.endDate, url };
  const msg = compose(locale, {
    subject: t(locale, 'doorPassSubject', vars),
    intro: t(locale, 'doorPassIntro', vars),
    vars,
    rows: [{ label: t(locale, 'labelValid'), value: `${pass.startDate} – ${pass.endDate}` }],
    notes: [t(locale, 'daysNote')],
    ctaLabel: t(locale, 'labelOpen'),
    ctaUrl: url,
  });
  await sendMessages(env, [toMessage(pass.recipientEmail, msg)]);
}
