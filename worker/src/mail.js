/**
 * Mail templates (ported from gas/Mail.gs) + fire-and-forget GAS webhook relay.
 * Worker builds fully rendered { to, subject, body } messages; GAS only sends.
 */

import { statusLabel } from './util.js';
import { getConfigMap } from './config.js';

const APP_NAME = 'RentR';

const MAIL_I18N = {
  sv: {
    createdSubject: 'Bokningsförfrågan {{bookingNumber}} mottagen',
    createdBody:
      'Hej {{name}},\n\nDin förfrågan {{bookingNumber}} är mottagen.\nPeriod: {{start}} – {{end}} ({{days}} dygn; start- och slutdatum räknas som hela dygn).\nUtrustning: {{pads}}\nTotalt: {{total}} {{currency}}\n\nBetalning sker enligt överenskommelse / på plats.\nHantera bokning: {{url}}\n\nVänliga hälsningar\nRentR',
    statusSubject: 'Bokning {{bookingNumber}}: {{status}}',
    statusBody:
      'Hej {{name}},\n\nStatus för bokning {{bookingNumber}} är nu: {{status}}.\nPeriod: {{start}} – {{end}} ({{days}} dygn).\nTotalt: {{total}} {{currency}}\n\nHantera: {{url}}\n\nVänliga hälsningar\nRentR',
    cancelledSubject: 'Bokning {{bookingNumber}} är avbokad',
    cancelledBody:
      'Hej {{name}},\n\nDin bokning {{bookingNumber}} är avbokad och datumen är åter lediga.\nPeriod: {{start}} – {{end}}\nUtrustning: {{pads}}\n\nInget mer behövs från dig. Välkommen tillbaka!\n\nVänliga hälsningar\nRentR',
    adminNew: 'Ny bokningsförfrågan {{bookingNumber}} från {{name}} ({{email}}).',
    adminChange: 'Ändringsförfrågan för {{bookingNumber}}.',
    adminCancelled: 'Bokning {{bookingNumber}} avbokad av gästen.',
    adminCancelledBody:
      '{{name}} ({{email}}) har avbokat bokning {{bookingNumber}}.\nPeriod: {{start}} – {{end}}\nUtrustning: {{pads}}\n\nDatumen är åter bokningsbara. Ingen åtgärd behövs.\nBokning: {{url}}\n',
    doorPassSubject: 'Dörrlänk {{start}} – {{end}}',
    doorPassBody:
      'Hej {{name}},\n\nHär är din länk för att öppna dörren.\nGiltig: {{start}} – {{end}} (inklusive båda dagarna).\n\nÖppna: {{url}}\n\nSidan visar endast Open door under giltighetstiden.\n',
  },
  en: {
    createdSubject: 'Booking request {{bookingNumber}} received',
    createdBody:
      'Hi {{name}},\n\nYour request {{bookingNumber}} was received.\nPeriod: {{start}} – {{end}} ({{days}} days; start and end dates each count as a full day).\nEquipment: {{pads}}\nTotal: {{total}} {{currency}}\n\nPayment is arranged separately / on site.\nManage booking: {{url}}\n\nBest regards\nRentR',
    statusSubject: 'Booking {{bookingNumber}}: {{status}}',
    statusBody:
      'Hi {{name}},\n\nStatus for booking {{bookingNumber}} is now: {{status}}.\nPeriod: {{start}} – {{end}} ({{days}} days).\nTotal: {{total}} {{currency}}\n\nManage: {{url}}\n\nBest regards\nRentR',
    cancelledSubject: 'Booking {{bookingNumber}} is cancelled',
    cancelledBody:
      'Hi {{name}},\n\nYour booking {{bookingNumber}} is cancelled and the dates are free again.\nPeriod: {{start}} – {{end}}\nEquipment: {{pads}}\n\nNothing further is needed from you. Welcome back!\n\nBest regards\nRentR',
    adminNew: 'New booking request {{bookingNumber}} from {{name}} ({{email}}).',
    adminChange: 'Change request for {{bookingNumber}}.',
    adminCancelled: 'Booking {{bookingNumber}} cancelled by the guest.',
    adminCancelledBody:
      '{{name}} ({{email}}) cancelled booking {{bookingNumber}}.\nPeriod: {{start}} – {{end}}\nEquipment: {{pads}}\n\nThe dates are bookable again. No action needed.\nBooking: {{url}}\n',
    doorPassSubject: 'Door link {{start}} – {{end}}',
    doorPassBody:
      'Hi {{name}},\n\nHere is your link to open the door.\nValid: {{start}} – {{end}} (both days inclusive).\n\nOpen: {{url}}\n\nThe page only shows Open door during the validity period.\n',
  },
  de: {
    createdSubject: 'Buchungsanfrage {{bookingNumber}} erhalten',
    createdBody:
      'Hallo {{name}},\n\nIhre Anfrage {{bookingNumber}} wurde erhalten.\nZeitraum: {{start}} – {{end}} ({{days}} Tage; Start- und Enddatum zählen als volle Tage).\nAusrüstung: {{pads}}\nSumme: {{total}} {{currency}}\n\nZahlung erfolgt nach Absprache / vor Ort.\nBuchung verwalten: {{url}}\n\nFreundliche Grüße\nRentR',
    statusSubject: 'Buchung {{bookingNumber}}: {{status}}',
    statusBody:
      'Hallo {{name}},\n\nStatus für Buchung {{bookingNumber}} ist jetzt: {{status}}.\nZeitraum: {{start}} – {{end}} ({{days}} Tage).\nSumme: {{total}} {{currency}}\n\nVerwalten: {{url}}\n\nFreundliche Grüße\nRentR',
    cancelledSubject: 'Buchung {{bookingNumber}} ist storniert',
    cancelledBody:
      'Hallo {{name}},\n\nIhre Buchung {{bookingNumber}} ist storniert und die Daten sind wieder frei.\nZeitraum: {{start}} – {{end}}\nAusrüstung: {{pads}}\n\nEs ist nichts weiter zu tun. Willkommen zurück!\n\nFreundliche Grüße\nRentR',
    adminNew: 'Neue Buchungsanfrage {{bookingNumber}} von {{name}} ({{email}}).',
    adminChange: 'Änderungsanfrage für {{bookingNumber}}.',
    adminCancelled: 'Buchung {{bookingNumber}} vom Gast storniert.',
    adminCancelledBody:
      '{{name}} ({{email}}) hat Buchung {{bookingNumber}} storniert.\nZeitraum: {{start}} – {{end}}\nAusrüstung: {{pads}}\n\nDie Daten sind wieder buchbar. Keine Aktion nötig.\nBuchung: {{url}}\n',
    doorPassSubject: 'Tür-Link {{start}} – {{end}}',
    doorPassBody:
      'Hallo {{name}},\n\nHier ist Ihr Link zum Öffnen der Tür.\nGültig: {{start}} – {{end}} (beide Tage inklusive).\n\nÖffnen: {{url}}\n\nDie Seite zeigt nur Open door während der Gültigkeit.\n',
  },
};

function tMail(locale, key, vars) {
  const dict = MAIL_I18N[locale] || MAIL_I18N.sv;
  let text = dict[key] || MAIL_I18N.sv[key] || key;
  for (const [k, v] of Object.entries(vars || {})) {
    text = text.split('{{' + k + '}}').join(String(v));
  }
  return text;
}

function mailSubject(text) {
  return APP_NAME + ' – ' + text;
}

function manageUrl(pagesBaseUrl, token) {
  return (pagesBaseUrl || '').replace(/\/$/, '') + '/booking.html?t=' + encodeURIComponent(token);
}

function bookingMailVars(booking, magicToken, cfg) {
  const locale = booking.locale || 'sv';
  return {
    name: (booking.firstName + ' ' + booking.lastName).trim(),
    bookingNumber: booking.bookingNumber,
    start: booking.startDate,
    end: booking.endDate,
    days: booking.days,
    pads: (booking.pads || []).map((p) => p.name).join(', '),
    total: booking.priceTotal,
    currency: (cfg && cfg.currency) || 'SEK',
    status: statusLabel(booking.status, locale),
    email: booking.email,
    url: manageUrl(cfg && cfg.pagesBaseUrl, magicToken || ''),
  };
}

/** POST rendered messages to the GAS mail-only webhook. */
export async function sendMessages(env, messages) {
  const url = env.MAIL_WEBHOOK_URL;
  if (!url || !messages || !messages.length) return;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'relayMail',
      secret: env.MAIL_WEBHOOK_SECRET || '',
      messages,
    }),
  });
}

async function adminEmails(db) {
  const { results } = await db
    .prepare(`SELECT email FROM users WHERE active = 1 AND role = 'admin'`)
    .all();
  return (results || []).map((r) => r.email);
}

async function cfgForMail(db) {
  return getConfigMap(db);
}

export async function mailBookingCreated(env, booking, magicToken) {
  const cfg = await cfgForMail(env.DB);
  const locale = booking.locale || 'sv';
  const vars = bookingMailVars(booking, magicToken, cfg);
  const messages = [
    {
      to: booking.email,
      subject: mailSubject(tMail(locale, 'createdSubject', vars)),
      body: tMail(locale, 'createdBody', vars),
    },
  ];
  const admins = await adminEmails(env.DB);
  const adminSubj = mailSubject(tMail('sv', 'adminNew', vars));
  const adminBody = tMail('sv', 'adminNew', vars) + '\n' + vars.url;
  for (const to of admins) messages.push({ to, subject: adminSubj, body: adminBody });
  await sendMessages(env, messages);
}

export async function mailGuestStatus(env, booking, magicToken) {
  const cfg = await cfgForMail(env.DB);
  const locale = booking.locale || 'sv';
  const vars = bookingMailVars(booking, magicToken, cfg);
  await sendMessages(env, [
    {
      to: booking.email,
      subject: mailSubject(tMail(locale, 'statusSubject', vars)),
      body: tMail(locale, 'statusBody', vars),
    },
  ]);
}

export async function mailGuestCancelled(env, booking, magicToken) {
  const cfg = await cfgForMail(env.DB);
  const locale = booking.locale || 'sv';
  const vars = bookingMailVars(booking, magicToken, cfg);
  const messages = [
    {
      to: booking.email,
      subject: mailSubject(tMail(locale, 'cancelledSubject', vars)),
      body: tMail(locale, 'cancelledBody', vars),
    },
  ];
  const admins = await adminEmails(env.DB);
  const adminSubj = mailSubject(tMail('sv', 'adminCancelled', vars));
  const adminBody = tMail('sv', 'adminCancelledBody', vars);
  for (const to of admins) messages.push({ to, subject: adminSubj, body: adminBody });
  await sendMessages(env, messages);
}

export async function mailAdminChange(env, booking, magicToken) {
  const cfg = await cfgForMail(env.DB);
  const vars = bookingMailVars(booking, magicToken, cfg);
  const admins = await adminEmails(env.DB);
  const subject = mailSubject(tMail('sv', 'adminChange', vars));
  const body = tMail('sv', 'adminChange', vars);
  await sendMessages(
    env,
    admins.map((to) => ({ to, subject, body }))
  );
}

export async function mailDoorPass(env, pass, url) {
  const locale = pass.locale || 'sv';
  const vars = {
    name: pass.recipientName,
    start: pass.startDate,
    end: pass.endDate,
    url,
  };
  await sendMessages(env, [
    {
      to: pass.recipientEmail,
      subject: mailSubject(tMail(locale, 'doorPassSubject', vars)),
      body: tMail(locale, 'doorPassBody', vars),
    },
  ]);
}
