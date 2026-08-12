/**
 * Thin Gmail relay for RentR on Cloudflare.
 *
 * The Worker owns all data and templates. This script only sends mail through
 * the club's Google account. Deploy as a web app (Anyone) and set the same
 * MAIL_WEBHOOK_SECRET on both sides.
 *
 * Body: { action: 'relayMail', secret, messages: [{ to, subject, body }] }
 */

var APP_NAME = 'RentR';

function doPost(e) {
  return handleRelay_(e);
}

function doGet(e) {
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
    messages.forEach(function (m) {
      try {
        var to = String(m.to || '').trim();
        var subject = String(m.subject || '');
        var text = String(m.body || '');
        if (!to || !subject) return;
        GmailApp.sendEmail(to, subject, text);
        sent++;
      } catch (err) {
        errors.push(String(err && err.message ? err.message : err));
      }
    });

    return jsonOut_({ ok: true, sent: sent, errors: errors });
  } catch (err) {
    return jsonOut_({ error: String(err && err.message ? err.message : err), status: 500 }, 500);
  }
}

function jsonOut_(obj, status) {
  var out = obj || {};
  if (status && !out.status) out.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once in the editor after deploy: sets MAIL_WEBHOOK_SECRET.
 * Pass the same value to `wrangler secret put MAIL_WEBHOOK_SECRET`.
 */
function setMailWebhookSecret() {
  var secret = 'REPLACE_WITH_A_LONG_RANDOM_STRING';
  PropertiesService.getScriptProperties().setProperty('MAIL_WEBHOOK_SECRET', secret);
  Logger.log('MAIL_WEBHOOK_SECRET sparad. Sätt samma värde som Worker-secret.');
}
