const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { requireAdmin, requireSameOrigin } = require('./team-api');

const SUBSCRIBERS_BLOB = 'newsletter/subscribers.json';
const LOCAL_SUBSCRIBERS_FILE = path.join(__dirname, '..', '.data', 'newsletter-subscribers.json');
const NEWSLETTER_LOGO_FILE = path.join(__dirname, '..', 'Ecosynic Africa Shield Logo.png');
const NEWSLETTER_LOGO_CID = 'ecosynic-africa-logo';
const MAX_BODY_BYTES = 16_000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const subscriptionRequests = new Map();

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  response.end(JSON.stringify(body));
}

function isVercel() {
  return process.env.VERCEL === '1';
}

function storageReady() {
  return Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

function requestUrl(request) {
  return new URL(request.url, `http://${request.headers.host || 'localhost'}`);
}

function allowSubscription(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.host) {
        sendJson(response, 403, { error: 'Cross-origin requests are not allowed.' });
        return false;
      }
    } catch {
      sendJson(response, 403, { error: 'Invalid request origin.' });
      return false;
    }
  }

  const now = Date.now();
  const address = request.socket?.remoteAddress || 'local';
  const current = subscriptionRequests.get(address);
  if (!current || current.resetAt <= now) {
    subscriptionRequests.set(address, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else if (current.count >= 4) {
    sendJson(response, 429, { error: 'Too many subscription requests. Please try again later.' });
    return false;
  } else {
    current.count += 1;
  }
  for (const [key, value] of subscriptionRequests) {
    if (value.resetAt <= now) subscriptionRequests.delete(key);
  }
  return true;
}

async function readJson(request) {
  let input;
  if (request.body !== undefined) {
    input = Buffer.isBuffer(request.body) ? request.body : Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body));
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
      chunks.push(chunk);
    }
    input = Buffer.concat(chunks);
  }
  if (input.length > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  try {
    return JSON.parse(input.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

async function getBlobSdk() {
  return import('@vercel/blob');
}

async function loadSubscribers() {
  if (!isVercel()) {
    try {
      const subscribers = JSON.parse(await fs.readFile(LOCAL_SUBSCRIBERS_FILE, 'utf8'));
      if (!Array.isArray(subscribers)) throw new Error('Newsletter subscriber data is invalid.');
      return subscribers;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable newsletter subscriptions.');
  const { get } = await getBlobSdk();
  const result = await get(SUBSCRIBERS_BLOB, { access: 'private', useCache: false });
  if (!result) return [];
  const subscribers = JSON.parse(await new Response(result.stream).text());
  if (!Array.isArray(subscribers)) throw new Error('Newsletter subscriber data is invalid.');
  return subscribers;
}

async function saveSubscribers(subscribers) {
  const data = JSON.stringify(subscribers);
  if (Buffer.byteLength(data) > 2_000_000) throw Object.assign(new Error('The subscriber list is too large.'), { status: 413 });
  if (!isVercel()) {
    const directory = path.dirname(LOCAL_SUBSCRIBERS_FILE);
    await fs.mkdir(directory, { recursive: true });
    const temporaryFile = `${LOCAL_SUBSCRIBERS_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, data, { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporaryFile, LOCAL_SUBSCRIBERS_FILE);
    return;
  }
  if (!storageReady()) throw new Error('Connect a Vercel Blob store to enable newsletter subscriptions.');
  const { put } = await getBlobSdk();
  await put(SUBSCRIBERS_BLOB, data, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json; charset=utf-8',
    cacheControlMaxAge: 0,
  });
}

function createSmtpTransport() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASSWORD: pass } = process.env;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

function siteUrl(request) {
  const configured = process.env.PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const origin = request.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host === request.headers.host) return origin.replace(/\/+$/, '');
    } catch {
      // Fall through to the canonical production URL.
    }
  }
  return 'https://ecosynic.or.ke';
}

function unsubscribeUrl(request, token) {
  return `${siteUrl(request)}/api/newsletter-unsubscribe?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function newsletterHtml(subject, message, unsubscribe, homepage) {
  const paragraphs = message.split(/\n{2,}/).map((paragraph) => (
    `<p style="margin:0 0 18px;font:16px/1.75 Arial,sans-serif;color:#344137;white-space:pre-line">${escapeHtml(paragraph)}</p>`
  )).join('');
  const safeSubject = escapeHtml(subject);
  const safeUnsubscribe = escapeHtml(unsubscribe);
  const safeHomepage = escapeHtml(homepage);

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px 12px;background:#f2f4ee">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safeSubject} — updates from Ecosynic Africa.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;border-collapse:collapse;background:#fff">
      <tr>
        <td style="padding:30px 36px;background:#1d2c22">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="padding:5px 8px;border-radius:4px;background:#fff">
                <img src="cid:${NEWSLETTER_LOGO_CID}" width="150" alt="Ecosynic Africa" style="display:block;width:150px;max-width:100%;height:auto;border:0">
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 8px;color:#d8ee70;font:700 11px/1.4 Arial,sans-serif;letter-spacing:2px">A NOTE FROM ECOSYNIC AFRICA</p>
          <h1 style="margin:0;color:#fff;font:700 28px/1.25 Arial,sans-serif">${safeSubject}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:34px 36px 22px">${paragraphs}</td>
      </tr>
      <tr>
        <td style="padding:22px 36px 28px;border-top:1px solid #e4e9e1;background:#f8f9f6">
          <p style="margin:0 0 10px;color:#687062;font:12px/1.6 Arial,sans-serif">You are receiving this because you subscribed to Ecosynic Africa updates.</p>
          <p style="margin:0;color:#687062;font:12px/1.6 Arial,sans-serif"><a href="${safeUnsubscribe}" style="color:#344b36;text-decoration:underline">Unsubscribe</a> · <a href="${safeHomepage}" style="color:#344b36;text-decoration:underline">Visit Ecosynic Africa</a></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function publishFacebookPost(subject, message) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) {
    return {
      posted: false,
      error: 'Facebook posting is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.',
    };
  }
  if (!/^\d+$/.test(pageId)) {
    return { posted: false, error: 'Facebook posting is not configured with a valid Page ID.' };
  }

  const graphApiVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v24.0';
  if (!/^v\d+\.0$/.test(graphApiVersion)) {
    return { posted: false, error: 'FACEBOOK_GRAPH_API_VERSION must use the format vNN.0.' };
  }

  let response;
  try {
    response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        message: `${subject}\n\n${message}`,
        access_token: accessToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    console.error(`Facebook newsletter post request failed (${error.name || 'Error'}).`);
    return { posted: false, error: 'Could not reach Facebook to publish the newsletter.' };
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    console.error(`Facebook newsletter post response was invalid (${error.name || 'Error'}).`);
    return { posted: false, error: 'Facebook returned an invalid response for the newsletter post.' };
  }

  if (!response.ok || !result?.id) {
    const code = result?.error?.code;
    console.error(`Facebook newsletter post was rejected${code ? ` (code ${code})` : ''}.`);
    return {
      posted: false,
      error: `Facebook rejected the post${code ? ` (code ${code})` : ''}. Check the Page ID, Page access token, and posting permissions.`,
    };
  }

  return { posted: true };
}

async function subscribe(request, response) {
  if (!allowSubscription(request, response)) return;
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, error.status || 400, { error: error.message || 'Could not read the subscription request.' });
    return;
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || body.consent !== true) {
    sendJson(response, 400, { error: 'Enter your name and a valid email address, and confirm your consent to receive newsletter updates.' });
    return;
  }

  try {
    const subscribers = await loadSubscribers();
    const existing = subscribers.find((subscriber) => subscriber.email === email);
    if (existing?.status === 'active') {
      sendJson(response, 200, { message: 'This email address is already subscribed to Ecosynic updates.' });
      return;
    }

    const now = new Date().toISOString();
    const subscriber = {
      id: existing?.id || crypto.randomUUID(),
      name,
      email,
      status: 'active',
      consentAt: now,
      subscribedAt: existing?.subscribedAt || now,
      unsubscribeToken: crypto.randomBytes(32).toString('base64url'),
    };
    if (existing) subscribers[subscribers.indexOf(existing)] = subscriber;
    else subscribers.push(subscriber);
    await saveSubscribers(subscribers);

    let notice = '';
    const transporter = createSmtpTransport();
    if (transporter) {
      try {
        await transporter.sendMail({
          from: { name: 'Ecosynic Africa Newsletter', address: process.env.MAIL_FROM || process.env.SMTP_USER },
          to: process.env.MAIL_TO || 'info@ecosynic.or.ke',
          replyTo: email,
          subject: 'Newsletter subscription',
          text: `${name} (${email}) subscribed to Ecosynic Africa newsletter updates at ${now}.`,
        });
      } catch (error) {
        console.error(`SMTP newsletter notification failed (${error.code || error.name || 'Error'}).`);
        notice = ' The subscription is active, but our team could not be notified by email.';
      }
    }
    sendJson(response, 201, { message: `Your subscription is active. Thank you.${notice}` });
  } catch (error) {
    console.error(`Newsletter subscription storage failed (${error.code || error.name || 'Error'}).`);
    sendJson(response, error.status || 503, { error: error.status ? error.message : 'We could not save your subscription right now. Please try again later.' });
  }
}

async function adminNewsletter(request, response) {
  if (!requireSameOrigin(request, response) || !requireAdmin(request, response, 'Sign in to manage newsletter subscribers.')) return;
  if (request.method === 'GET' && requestUrl(request).searchParams.get('check') === 'smtp') {
    const transporter = createSmtpTransport();
    if (!transporter) {
      sendJson(response, 503, { error: 'SMTP is not configured on the server.' });
      return;
    }
    try {
      await transporter.verify();
      sendJson(response, 200, { verified: true, message: 'SMTP connection verified. No email was sent.' });
    } catch (error) {
      const code = error.code || error.name || 'Error';
      console.error(`SMTP connection check failed (${code}).`);
      sendJson(response, 503, { error: `SMTP connection check failed (${code}).` });
    }
    return;
  }
  try {
    const subscribers = await loadSubscribers();
    const active = subscribers.filter((subscriber) => subscriber.status === 'active');
    if (request.method === 'GET') {
      sendJson(response, 200, {
        activeCount: active.length,
        subscribers: subscribers.map(({ id, name, email, status, subscribedAt }) => ({ id, name, email, status, subscribedAt })),
      });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }

    const body = await readJson(request);
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (subject.length < 3 || subject.length > 150 || /[\r\n]/.test(subject) || !message || message.length > 10_000) {
      sendJson(response, 400, { error: 'Enter a subject of 3–150 characters and a message of 10,000 characters or fewer.' });
      return;
    }
    if (!active.length) {
      sendJson(response, 400, { error: 'There are no active subscribers to email.' });
      return;
    }
    let next = 0;
    let sent = 0;
    const failed = [];
    const transporter = createSmtpTransport();
    if (transporter) {
      let newsletterLogo;
      try {
        newsletterLogo = await fs.readFile(NEWSLETTER_LOGO_FILE);
      } catch (error) {
        console.error(`Newsletter branding image could not be loaded (${error.code || error.name || 'Error'}).`);
        sendJson(response, 503, { error: 'Newsletter email branding is unavailable. Check the Ecosynic Africa logo asset.' });
        return;
      }
      const worker = async () => {
        while (next < active.length) {
          const subscriber = active[next++];
          const unsubscribe = unsubscribeUrl(request, subscriber.unsubscribeToken);
          try {
            await transporter.sendMail({
              from: { name: 'Ecosynic Africa', address: process.env.MAIL_FROM || process.env.SMTP_USER },
              to: subscriber.email,
              subject,
              text: `${message}\n\n---\nYou are receiving this because you subscribed to Ecosynic Africa updates.\nTo unsubscribe, visit: ${unsubscribe}`,
              html: newsletterHtml(subject, message, unsubscribe, siteUrl(request)),
              attachments: [{
                filename: 'ecosynic-africa-logo.png',
                content: newsletterLogo,
                contentType: 'image/png',
                cid: NEWSLETTER_LOGO_CID,
              }],
              headers: {
                'List-Unsubscribe': `<${unsubscribe}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            });
            sent += 1;
          } catch (error) {
            failed.push(subscriber.email);
            console.error(`SMTP newsletter campaign delivery failed (${error.code || error.name || 'Error'}).`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, active.length) }, worker));
    }

    const facebook = await publishFacebookPost(subject, message);
    const emailMessage = !transporter
      ? 'Email delivery is not configured.'
      : failed.length
        ? `Newsletter emailed to ${sent} of ${active.length} subscribers; ${failed.length} delivery${failed.length === 1 ? '' : 'ies'} failed.`
        : `Newsletter emailed to all ${sent} subscribers.`;
    const messageStatus = facebook.posted
      ? `${emailMessage} Facebook Page post published.`
      : `${emailMessage} Facebook post failed: ${facebook.error}`;
    const status = failed.length || !transporter || !facebook.posted ? 207 : 200;
    sendJson(response, status, {
      sent,
      failed: failed.length,
      total: active.length,
      facebookPosted: facebook.posted,
      facebookError: facebook.posted ? null : facebook.error,
      message: messageStatus,
    });
  } catch (error) {
    const status = Number(error.status);
    sendJson(response, Number.isInteger(status) && status >= 400 && status < 600 ? status : 503, {
      error: error.status ? error.message : 'Newsletter subscriber data is unavailable. Check the private Vercel Blob store configuration.',
    });
  }
}

async function unsubscribe(request, response) {
  const url = requestUrl(request);
  const token = url.searchParams.get('token') || '';
  if (!token || token.length > 100) {
    sendJson(response, 400, { error: 'This unsubscribe link is invalid or expired.' });
    return;
  }
  try {
    const subscribers = await loadSubscribers();
    const subscriber = subscribers.find((item) => item.unsubscribeToken === token);
    if (!subscriber) {
      sendJson(response, 404, { error: 'This unsubscribe link is invalid or has already been used.' });
      return;
    }
    if (request.method === 'GET') {
      const location = `/newsletter-unsubscribe.html?token=${encodeURIComponent(token)}`;
      response.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
      response.end();
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'Method not allowed.' });
      return;
    }
    if (subscriber.status !== 'unsubscribed') {
      subscriber.status = 'unsubscribed';
      subscriber.unsubscribedAt = new Date().toISOString();
      await saveSubscribers(subscribers);
    }
    sendJson(response, 200, { message: 'You have been unsubscribed from Ecosynic Africa newsletter updates.' });
  } catch (error) {
    sendJson(response, error.status || 503, { error: 'We could not process your request right now. Please try again later.' });
  }
}

async function handleNewsletter(request, response) {
  const action = requestUrl(request).searchParams.get('action');
  if (action === 'admin') {
    await adminNewsletter(request, response);
    return;
  }
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed.' });
    return;
  }
  await subscribe(request, response);
}

module.exports = { handleNewsletter, unsubscribe, publishFacebookPost };
