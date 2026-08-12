/**
 * Thin Gmail relay for RentR on Cloudflare.
 *
 * Body: {
 *   action: 'relayMail',
 *   secret,
 *   messages: [{ to, subject, body, html? }]
 * }
 */

function doPost(e) {
  return handleRelay_(e);
}

function doGet() {
  return jsonOut_({ ok: true, service: 'rentr-mail', time: new Date().toISOString() });
}

function handleRelay_(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
    }
    if (body.action && body.action !== 'relayMail' && body.action !== 'ping') {
      return jsonOut_({ error: 'Endast relayMail stöds', status: 400 }, 400);
    }
    if (body.action === 'ping' || !body.action) {
      return jsonOut_({ ok: true, service: 'rentr-mail' });
    }

    var expected = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET') || '';
    if (!expected || body.secret !== expected) {
      return jsonOut_({ error: 'Unauthorized', status: 401 }, 401);
    }

    var messages = body.messages || [];
    if (!Array.isArray(messages) || !messages.length) {
      return jsonOut_({ error: 'Inga meddelanden', status: 400 }, 400);
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
      return jsonOut_({
        error: errors.join(' | '),
        ok: false,
        sent: sent,
        errors: errors,
        status: 500
      }, 500);
    }
    return jsonOut_({ ok: true, sent: sent, errors: [] });
  } catch (err) {
    return jsonOut_({ error: String(err && err.message ? err.message : err), status: 500 }, 500);
  }
}

function sendRelayMessage_(to, subject, text, html) {
  if (!text) text = subject;
  try {
    if (html) {
      GmailApp.sendEmail(to, subject, text, { htmlBody: html });
    } else {
      GmailApp.sendEmail(to, subject, text);
    }
  } catch (err) {
    if (html) {
      GmailApp.sendEmail(to, subject, text);
      return;
    }
    throw err;
  }
}

function jsonOut_(obj, status) {
  var out = obj || {};
  if (status && !out.status) out.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

function setMailWebhookSecret() {
  var secret = 'REPLACE_WITH_A_LONG_RANDOM_STRING';
  PropertiesService.getScriptProperties().setProperty('MAIL_WEBHOOK_SECRET', secret);
  Logger.log('MAIL_WEBHOOK_SECRET sparad.');
}

function testMailRelayInEditor() {
  var secret = PropertiesService.getScriptProperties().getProperty('MAIL_WEBHOOK_SECRET') || '';
  if (!secret) throw new Error('Sätt MAIL_WEBHOOK_SECRET i skriptegenskaper först.');
  var me = Session.getActiveUser().getEmail();
  if (!me) throw new Error('Kör som inloggad användare med e-post.');
  sendRelayMessage_(me, 'RentR test', 'Gmail-relay fungerar.', '<p><strong>Gmail-relay</strong> fungerar.</p>');
  Logger.log('Testmejl skickat till ' + me);
}
