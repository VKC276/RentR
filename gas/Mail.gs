/**
 * Email templates SV / EN / DE.
 */

function tMail_(locale, key, vars) {
  vars = vars || {};
  var dict = MAIL_I18N[locale] || MAIL_I18N.sv;
  var text = dict[key] || MAIL_I18N.sv[key] || key;
  Object.keys(vars).forEach(function (k) {
    text = text.split('{{' + k + '}}').join(String(vars[k]));
  });
  return text;
}

var MAIL_I18N = {
  sv: {
    createdSubject: 'Bokningsförfrågan {{bookingNumber}} mottagen',
    createdBody: 'Hej {{name}},\n\nDin förfrågan {{bookingNumber}} är mottagen.\nPeriod: {{start}} – {{end}} ({{days}} dygn; start- och slutdatum räknas som hela dygn).\nUtrustning: {{pads}}\nTotalt: {{total}} {{currency}}\n\nBetalning sker enligt överenskommelse / på plats.\nHantera bokning: {{url}}\n\nVänliga hälsningar\nRentR',
    statusSubject: 'Bokning {{bookingNumber}}: {{status}}',
    statusBody: 'Hej {{name}},\n\nStatus för bokning {{bookingNumber}} är nu: {{status}}.\nPeriod: {{start}} – {{end}} ({{days}} dygn).\nTotalt: {{total}} {{currency}}\n\nHantera: {{url}}\n\nVänliga hälsningar\nRentR',
    cancelledSubject: 'Bokning {{bookingNumber}} är avbokad',
    cancelledBody: 'Hej {{name}},\n\nDin bokning {{bookingNumber}} är avbokad och datumen är åter lediga.\nPeriod: {{start}} – {{end}}\nUtrustning: {{pads}}\n\nInget mer behövs från dig. Välkommen tillbaka!\n\nVänliga hälsningar\nRentR',
    adminNew: 'Ny bokningsförfrågan {{bookingNumber}} från {{name}} ({{email}}).',
    adminChange: 'Ändringsförfrågan för {{bookingNumber}}.',
    adminCancelled: 'Bokning {{bookingNumber}} avbokad av gästen.',
    adminCancelledBody: '{{name}} ({{email}}) har avbokat bokning {{bookingNumber}}.\nPeriod: {{start}} – {{end}}\nUtrustning: {{pads}}\n\nDatumen är åter bokningsbara. Ingen åtgärd behövs.\nBokning: {{url}}\n',
    doorPassSubject: 'Dörrlänk {{start}} – {{end}}',
    doorPassBody: 'Hej {{name}},\n\nHär är din länk för att öppna dörren.\nGiltig: {{start}} – {{end}} (inklusive båda dagarna).\n\nÖppna: {{url}}\n\nSidan visar endast Open door under giltighetstiden.\n'
  },
  en: {
    createdSubject: 'Booking request {{bookingNumber}} received',
    createdBody: 'Hi {{name}},\n\nYour request {{bookingNumber}} was received.\nPeriod: {{start}} – {{end}} ({{days}} days; start and end dates each count as a full day).\nEquipment: {{pads}}\nTotal: {{total}} {{currency}}\n\nPayment is arranged separately / on site.\nManage booking: {{url}}\n\nBest regards\nRentR',
    statusSubject: 'Booking {{bookingNumber}}: {{status}}',
    statusBody: 'Hi {{name}},\n\nStatus for booking {{bookingNumber}} is now: {{status}}.\nPeriod: {{start}} – {{end}} ({{days}} days).\nTotal: {{total}} {{currency}}\n\nManage: {{url}}\n\nBest regards\nRentR',
    cancelledSubject: 'Booking {{bookingNumber}} is cancelled',
    cancelledBody: 'Hi {{name}},\n\nYour booking {{bookingNumber}} is cancelled and the dates are free again.\nPeriod: {{start}} – {{end}}\nEquipment: {{pads}}\n\nNothing further is needed from you. Welcome back!\n\nBest regards\nRentR',
    adminNew: 'New booking request {{bookingNumber}} from {{name}} ({{email}}).',
    adminChange: 'Change request for {{bookingNumber}}.',
    adminCancelled: 'Booking {{bookingNumber}} cancelled by the guest.',
    adminCancelledBody: '{{name}} ({{email}}) cancelled booking {{bookingNumber}}.\nPeriod: {{start}} – {{end}}\nEquipment: {{pads}}\n\nThe dates are bookable again. No action needed.\nBooking: {{url}}\n',
    doorPassSubject: 'Door link {{start}} – {{end}}',
    doorPassBody: 'Hi {{name}},\n\nHere is your link to open the door.\nValid: {{start}} – {{end}} (both days inclusive).\n\nOpen: {{url}}\n\nThe page only shows Open door during the validity period.\n'
  },
  de: {
    createdSubject: 'Buchungsanfrage {{bookingNumber}} erhalten',
    createdBody: 'Hallo {{name}},\n\nIhre Anfrage {{bookingNumber}} wurde erhalten.\nZeitraum: {{start}} – {{end}} ({{days}} Tage; Start- und Enddatum zählen als volle Tage).\nAusrüstung: {{pads}}\nSumme: {{total}} {{currency}}\n\nZahlung erfolgt nach Absprache / vor Ort.\nBuchung verwalten: {{url}}\n\nFreundliche Grüße\nRentR',
    statusSubject: 'Buchung {{bookingNumber}}: {{status}}',
    statusBody: 'Hallo {{name}},\n\nStatus für Buchung {{bookingNumber}} ist jetzt: {{status}}.\nZeitraum: {{start}} – {{end}} ({{days}} Tage).\nSumme: {{total}} {{currency}}\n\nVerwalten: {{url}}\n\nFreundliche Grüße\nRentR',
    cancelledSubject: 'Buchung {{bookingNumber}} ist storniert',
    cancelledBody: 'Hallo {{name}},\n\nIhre Buchung {{bookingNumber}} ist storniert und die Daten sind wieder frei.\nZeitraum: {{start}} – {{end}}\nAusrüstung: {{pads}}\n\nEs ist nichts weiter zu tun. Willkommen zurück!\n\nFreundliche Grüße\nRentR',
    adminNew: 'Neue Buchungsanfrage {{bookingNumber}} von {{name}} ({{email}}).',
    adminChange: 'Änderungsanfrage für {{bookingNumber}}.',
    adminCancelled: 'Buchung {{bookingNumber}} vom Gast storniert.',
    adminCancelledBody: '{{name}} ({{email}}) hat Buchung {{bookingNumber}} storniert.\nZeitraum: {{start}} – {{end}}\nAusrüstung: {{pads}}\n\nDie Daten sind wieder buchbar. Keine Aktion nötig.\nBuchung: {{url}}\n',
    doorPassSubject: 'Tür-Link {{start}} – {{end}}',
    doorPassBody: 'Hallo {{name}},\n\nHier ist Ihr Link zum Öffnen der Tür.\nGültig: {{start}} – {{end}} (beide Tage inklusive).\n\nÖffnen: {{url}}\n\nDie Seite zeigt nur Open door während der Gültigkeit.\n'
  }
};

/** Every mail carries the product name in the subject, from one place. */
function mailSubject_(text) {
  return APP_NAME + ' – ' + text;
}

function bookingMailVars_(booking, magicToken) {
  var token = magicToken;
  if (!token) {
    token = createMagicToken_(booking.id);
  }
  var locale = booking.locale || 'sv';
  return {
    name: booking.firstName + ' ' + booking.lastName,
    bookingNumber: booking.bookingNumber,
    start: booking.startDate,
    end: booking.endDate,
    days: booking.days,
    pads: (booking.pads || []).map(function (p) { return p.name; }).join(', '),
    total: booking.priceTotal,
    currency: getConfig_('currency', 'SEK'),
    // The stored status is an English key; the guest reads the mail, so it is
    // the label that belongs here.
    status: statusLabel_(booking.status, locale),
    email: booking.email,
    url: manageUrl_(token)
  };
}

function mailBookingCreated_(booking, magic) {
  var locale = booking.locale || 'sv';
  var vars = bookingMailVars_(booking, magic);
  GmailApp.sendEmail(booking.email, mailSubject_(tMail_(locale, 'createdSubject', vars)), tMail_(locale, 'createdBody', vars));
}

function mailGuestStatus_(booking) {
  var locale = booking.locale || 'sv';
  var vars = bookingMailVars_(booking, null);
  GmailApp.sendEmail(booking.email, mailSubject_(tMail_(locale, 'statusSubject', vars)), tMail_(locale, 'statusBody', vars));
}

function mailGuestCancelled_(booking) {
  var locale = booking.locale || 'sv';
  var vars = bookingMailVars_(booking, null);
  GmailApp.sendEmail(booking.email, mailSubject_(tMail_(locale, 'cancelledSubject', vars)), tMail_(locale, 'cancelledBody', vars));
}

function adminEmails_() {
  return readAllObjects_(SHEET_NAMES.Users)
    .filter(function (u) { return (u.active === true || u.active === 'true') && u.role === 'admin'; })
    .map(function (u) { return u.email; });
}

function mailAdmins_(subject, body) {
  var emails = adminEmails_();
  emails.forEach(function (e) {
    try { GmailApp.sendEmail(e, mailSubject_(subject), body); } catch (err) {}
  });
}

function mailAdminNewRequest_(booking) {
  var vars = bookingMailVars_(booking, null);
  mailAdmins_(tMail_('sv', 'adminNew', vars), tMail_('sv', 'adminNew', vars) + '\n' + vars.url);
}

function mailAdminChange_(booking) {
  var vars = bookingMailVars_(booking, null);
  mailAdmins_(tMail_('sv', 'adminChange', vars), tMail_('sv', 'adminChange', vars));
}

function mailAdminCancelled_(booking) {
  var vars = bookingMailVars_(booking, null);
  mailAdmins_(tMail_('sv', 'adminCancelled', vars), tMail_('sv', 'adminCancelledBody', vars));
}

function mailDoorPass_(pass, url) {
  var locale = pass.locale || 'sv';
  var vars = {
    name: pass.recipientName,
    start: pass.startDate,
    end: pass.endDate,
    url: url
  };
  GmailApp.sendEmail(
    pass.recipientEmail,
    mailSubject_(tMail_(locale, 'doorPassSubject', vars)),
    tMail_(locale, 'doorPassBody', vars)
  );
}
