/**
 * Gmail relay for Cloudflare Worker.
 *
 * POST body: { action: 'relayMail', secret, messages: [{ to, subject, body, html?, attachments? }] }
 * attachments: [{ filename|name, mimeType|type, content }] där content är base64.
 * Script property MAIL_WEBHOOK_SECRET must match Worker MAIL_WEBHOOK_SECRET.
 */

var MAIL_FROM_NAME = 'Västerviks klätterklubb';
var MAIL_MAX_ATTACHMENT_CHARS = 3500000;

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
    return mailJson_({ ok: true, service: 'vkk-rental-mail' });
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
      sendRelayMessage_(to, subject, text, html, m.attachments);
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

function decodeRelayAttachments_(raw) {
  var list = Array.isArray(raw) ? raw : [];
  var blobs = [];
  var i;
  for (i = 0; i < list.length; i++) {
    var blob = attachmentToBlob_(list[i]);
    if (blob) blobs.push(blob);
  }
  return blobs;
}

function normalizeB64_(raw) {
  var s = String(raw || '')
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/\s/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  var pad = s.length % 4;
  if (pad === 1) throw new Error('Ogiltig base64 i bilaga');
  if (pad) s += '===='.slice(pad);
  return s;
}

function sanitizeAttachName_(raw) {
  var name = String(raw || 'bilaga.pdf').replace(/[\\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
  if (!name) name = 'bilaga.pdf';
  if (name.length > 80) name = name.slice(0, 80);
  if (!/\.[a-zA-Z0-9]{2,8}$/.test(name)) name += '.pdf';
  return name;
}

function attachmentToBlob_(a) {
  a = a || {};
  var name = sanitizeAttachName_(a.filename || a.name);
  var mime = String(a.mimeType || a.type || 'application/pdf').split(';')[0].trim() || 'application/pdf';
  var raw = a.content != null ? a.content : (a.data != null ? a.data : a.bytes);
  var bytes;
  try {
    if (Array.isArray(raw)) {
      bytes = raw;
    } else {
      var b64 = normalizeB64_(raw);
      if (!b64) return null;
      if (b64.length > MAIL_MAX_ATTACHMENT_CHARS) {
        throw new Error('Bilagan är för stor');
      }
      bytes = Utilities.base64Decode(b64);
    }
  } catch (err) {
    throw new Error('Kunde inte läsa bilaga ' + name + ': ' + String(err && err.message ? err.message : err));
  }
  if (typeof bytes.length === 'number' && bytes.length === 0) {
    throw new Error('Tom bilaga: ' + name);
  }
  return Utilities.newBlob(bytes, mime, name);
}

function sendRelayMessage_(to, subject, text, html, attachments) {
  if (!text) text = subject;
  var blobs = decodeRelayAttachments_(attachments);
  var opts = { name: MAIL_FROM_NAME };
  if (blobs.length) opts.attachments = blobs;
  if (html) opts.htmlBody = html;
  try {
    GmailApp.sendEmail(to, subject, text, opts);
    return;
  } catch (err) {
    Logger.log('GmailApp.sendEmail misslyckades: ' + err);
    // htmlBody + attachments kan falla i vissa Gmail-konton; prova utan HTML.
    if (blobs.length && html) {
      GmailApp.sendEmail(to, subject, text, { name: MAIL_FROM_NAME, attachments: blobs });
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
      subject: 'VKK Rental test',
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
