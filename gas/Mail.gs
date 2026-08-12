/**
 * Gmail relay for Cloudflare Worker.
 *
 * POST body: { action: 'relayMail', secret, messages: [{ to, subject, body, html? }] }
 * Script property MAIL_WEBHOOK_SECRET must match Worker MAIL_WEBHOOK_SECRET.
 */

var MAIL_FROM_NAME = 'Västerviks klätterklubb';

function mailJson_(obj, status) {
  var out = obj || {};
  if (status && !out.status) out.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleMailRelay_(body) {
  body = body || {};
  if (body.action === 'ping' || !body.action) {
    return mailJson_({ ok: true, service: 'rentr-mail' });
  }
  if (body.action !== 'relayMail') {
    return mailJson_({ error: 'Endast relayMail stöds', status: 400 }, 400);
  }

  var expected = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET') || '';
  if (!expected || body.secret !== expected) {
    return mailJson_({ error: 'Unauthorized', status: 401 }, 401);
  }

  var messages = body.messages || [];
  if (!Array.isArray(messages) || !messages.length) {
    return mailJson_({ error: 'Inga meddelanden', status: 400 }, 400);
  }

  var sent = 0;
  var errors = [];
  messages.forEach(function (m, idx) {
    var to = String(m.to || '').trim();
    var subject = String(m.subject || '');
    var text = String(m.body || '');
    var html = m.html ? String(m.html) : '';
    if (!to || !subject) {
      errors.push('Meddelande ' + (idx + 1) + ': saknar mottagare eller ämne');
      return;
    }
    try {
      sendRelayMessage_(to, subject, text, html);
      sent++;
    } catch (err) {
      errors.push(to + ': ' + String(err && err.message ? err.message : err));
    }
  });

  if (errors.length) {
    return mailJson_({
      error: errors.join(' | '),
      ok: false,
      sent: sent,
      errors: errors,
      status: 500
    }, 500);
  }
  return mailJson_({ ok: true, sent: sent, errors: [] });
}

function sendRelayMessage_(to, subject, text, html) {
  if (!text) text = subject;
  var opts = { name: MAIL_FROM_NAME };
  try {
    if (html) {
      opts.htmlBody = html;
      GmailApp.sendEmail(to, subject, text, opts);
    } else {
      GmailApp.sendEmail(to, subject, text, opts);
    }
  } catch (err) {
    if (html) {
      GmailApp.sendEmail(to, subject, text, { name: MAIL_FROM_NAME });
      return;
    }
    throw err;
  }
}

/** Set recipient below, then Run in the editor to verify Gmail + secret. */
function testMailRelayInEditor() {
  var to = 'REPLACE_WITH_YOUR_EMAIL@example.com';
  var secret = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET') || '';
  if (!secret) throw new Error('Sätt MAIL_WEBHOOK_SECRET i skriptegenskaper först.');
  if (!to || to.indexOf('REPLACE_WITH_') === 0) {
    throw new Error('Sätt din e-post i variabeln to i testMailRelayInEditor.');
  }
  var result = handleMailRelay_({
    action: 'relayMail',
    secret: secret,
    messages: [{
      to: to,
      subject: 'RentR test',
      body: 'Om du läser detta fungerar Gmail-relay från Apps Script.',
      html: '<p>Om du läser detta fungerar <strong>Gmail-relay</strong> från Apps Script.</p>'
    }]
  });
  Logger.log(result.getContent());
}

function setMailWebhookSecret() {
  var secret = 'REPLACE_WITH_A_LONG_RANDOM_STRING';
  PropertiesService.getScriptProperties().setProperty('MAIL_WEBHOOK_SECRET', secret);
  Logger.log('MAIL_WEBHOOK_SECRET sparad.');
}
