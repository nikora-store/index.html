/**
 * NIKORA transactional email endpoint  -  /api/send-email   (Vercel Serverless Function, Node 18+)
 * -------------------------------------------------------------------------------------------------
 * POST { type: 'ORDER_CONFIRMATION', orderData }     called by checkout.html right after the order is saved
 * POST { type: 'SHIPPING_TRACKING',  orderData }     called by YOU (admin tool / script) when a tracking code is added
 *
 * Sends through Resend's REST API with plain fetch(), so there is no package.json or dependency to add.
 *
 * ENVIRONMENT VARIABLES  (Vercel > Project > Settings > Environment Variables)
 *   RESEND_API_KEY      required   your Resend API key. Never put it in client code.
 *   EMAIL_FROM          required in production, e.g.  NIKORA <orders@your-verified-domain.com>
 *                       (the default onboarding@resend.dev sandbox sender can only deliver to YOUR OWN Resend login email)
 *   EMAIL_ADMIN_SECRET  required for SHIPPING_TRACKING: a long random string; callers send  Authorization: Bearer <secret>
 *   SITE_URL            optional   defaults to https://nikora-store.vercel.app (used for the buttons and footer links)
 *   FIREBASE_DB_URL     optional   defaults to https://nikora-store-default-rtdb.firebaseio.com
 *
 * ABUSE PROTECTION (a public "send an email" URL is otherwise a spam relay)
 *   ORDER_CONFIRMATION  is only sent to the email address that really placed a real, recent order: the caller's email is
 *                       hashed and compared with the salted hash checkout stores in /tracking/{orderId}. It is sent at most
 *                       once per order (a create-once marker in /emailLog plus Resend's Idempotency-Key).
 *   SHIPPING_TRACKING   requires the EMAIL_ADMIN_SECRET bearer token, and the email must match the order when it is on file.
 *   Browsers: requests from another origin are refused. All user-supplied text is HTML-escaped.
 *
 * FIREBASE RULES to add (Realtime Database):
 *   "emailLog": { "$key": { ".read": false,
 *       ".write": "!data.exists() || data.child('status').val() === 'pending'" } }
 *
 * SHIPPING_TRACKING example (run from your own machine / admin tool):
 *   curl -X POST https://nikora-store.vercel.app/api/send-email \
 *     -H "Authorization: Bearer $EMAIL_ADMIN_SECRET" -H "Content-Type: application/json" \
 *     -d '{"type":"SHIPPING_TRACKING","orderData":{"orderId":"NK-1084",
 *          "customer":{"name":"Jose Garcia","email":"jose@example.com"},
 *          "shipping":{"carrier":"DHL Express","trackingCode":"JD014600003SE"}}}'
 */
'use strict';

const crypto = require('crypto');

/* ============================== config ============================== */
const SITE_URL = (process.env.SITE_URL || 'https://nikora-store.vercel.app').replace(/\/+$/, '');
const DB_URL = (process.env.FIREBASE_DB_URL || 'https://nikora-store-default-rtdb.firebaseio.com').replace(/\/+$/, '');
const FROM = process.env.EMAIL_FROM || 'NIKORA <onboarding@resend.dev>';
const SUPPORT_EMAIL = 'nikora.support@gmail.com';
const DELIVERY_DAYS = [5, 9];                          // business days
const CONFIRMATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;    // a confirmation may only be requested within 2h of checkout
const MAX_ITEMS = 25;

/* ============================== tiny helpers ============================== */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, max = 100000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };
const money = (n) => '$' + (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/.test(e);
const httpsUrl = (u, max = 600) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && String(u).length <= max ? x.toString() : ''; } catch (e) { return ''; } };
const maskEmail = (e) => String(e).replace(/^(.).*(@.*)$/, '$1***$2');
const safeEq = (a, b) => { const x = Buffer.from(sha256(a)), y = Buffer.from(sha256(b)); return crypto.timingSafeEqual(x, y); };

function parseOrderId(v) { const m = /^#?(NK-\d{4})$/i.exec(String(v || '').trim()); return m ? m[1].toUpperCase() : null; }
function addBusinessDays(ts, n) {
  const d = new Date(ts); let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  return d;
}
const fmtLong = (ts) => new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const fmtShort = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtRange = (ts) => fmtShort(addBusinessDays(ts, DELIVERY_DAYS[0])) + ' \u2013 ' + fmtShort(addBusinessDays(ts, DELIVERY_DAYS[1])) + ', ' + addBusinessDays(ts, DELIVERY_DAYS[1]).getUTCFullYear();

function reply(res, status, body) { res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(body)); }

async function timedFetch(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); } finally { clearTimeout(t); }
}

/* ============================== input sanitising ============================== */
function cleanAddress(a) {
  a = a || {};
  return { line1: clip(a.line1, 120), line2: clip(a.line2, 120), city: clip(a.city, 80), postalCode: clip(a.postalCode, 20), country: clip(a.country, 60) };
}
function cleanOrder(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const orderId = parseOrderId(raw.orderId || raw.displayId);
  const c = raw.customer || {};
  if (!orderId || !validEmail(c.email)) return null;
  const name = clip(c.name, 100) || 'there';
  const items = (Array.isArray(raw.items) ? raw.items : []).slice(0, MAX_ITEMS).map((i) => {
    const qty = Math.max(1, Math.min(99, Math.floor(Number(i && i.qty) || 1)));
    const price = num(i && i.price, 100000);
    return { title: clip(i && i.title, 140) || 'NIKORA item', qty, price, line: num(i && i.lineTotal, 1000000) || Math.round(price * qty * 100) / 100, image: httpsUrl(i && i.image) };
  });
  const p = raw.pricing || {};
  return {
    orderId, createdAt: Number(raw.createdAt) > 0 ? Number(raw.createdAt) : Date.now(),
    customer: { name, firstName: clip(c.firstName, 60) || name.split(' ')[0], email: String(c.email).trim().toLowerCase(), address: cleanAddress(c.address) },
    items,
    pricing: { subtotal: num(p.subtotal), discount: num(p.discount), promoCode: clip(p.promoCode, 40), tax: num(p.tax), taxRate: num(p.taxRate, 1) },
    total: num(raw.total),
    payment: raw.payment && typeof raw.payment === 'object' ? { method: clip(raw.payment.method, 20), brand: clip(raw.payment.brand, 20), last4: /^\d{4}$/.test(String(raw.payment.last4 || '')) ? String(raw.payment.last4) : '' } : null
  };
}
function cleanShipping(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const orderId = parseOrderId(raw.orderId);
  const c = raw.customer || {}, s = raw.shipping || {};
  const carrier = clip(s.carrier, 60), code = String(s.trackingCode || '').replace(/[^A-Za-z0-9 \-_.]/g, '').trim().slice(0, 64);
  if (!orderId || !validEmail(c.email) || !carrier || !code) return null;
  return {
    orderId, customer: { name: clip(c.name, 100) || 'there', email: String(c.email).trim().toLowerCase(), address: cleanAddress(c.address) },
    carrier, trackingCode: code, carrierUrl: httpsUrl(s.trackingUrl),
    shippedAt: Number(s.shippedAt) > 0 ? Number(s.shippedAt) : Date.now()
  };
}

/* ============================== Firebase (REST, no credentials needed) ============================== */
async function readTracking(orderId) {
  const r = await timedFetch(`${DB_URL}/tracking/${orderId}.json`, { headers: { Accept: 'application/json' } }, 8000);
  if (!r.ok) throw new Error('tracking read ' + r.status);
  return r.json();                                      // null when the order does not exist
}
function emailMatchesRecord(rec, email) {
  if (!rec || !rec.s || !rec.k) return false;
  const keys = Array.isArray(rec.k) ? rec.k : Object.keys(rec.k).map((k) => rec.k[k]);
  return keys.includes(sha256(`${rec.s}:e:${String(email).trim().toLowerCase()}`));
}
/* Create-once marker using Firebase's conditional write (if-match: null_etag). Returns 'claimed' | 'exists' | 'unknown'. */
async function claim(key) {
  try {
    const r = await timedFetch(`${DB_URL}/emailLog/${key}.json?print=silent`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'if-match': 'null_etag' }, body: JSON.stringify({ status: 'pending', at: Date.now() })
    }, 6000);
    if (r.status === 412) return 'exists';
    if (r.ok) return 'claimed';
    console.warn('emailLog claim not available (HTTP ' + r.status + '): relying on the Resend idempotency key only.');
    return 'unknown';
  } catch (e) { console.warn('emailLog claim failed:', e.message); return 'unknown'; }
}
async function finishClaim(key, ok) {
  try {
    await timedFetch(`${DB_URL}/emailLog/${key}.json?print=silent`, ok
      ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'sent', at: Date.now() }) }
      : { method: 'DELETE' }, 6000);                    // release the marker so a retry can send
  } catch (e) { /* best effort */ }
}

/* ============================== Resend ============================== */
async function sendViaResend({ to, subject, html, text, idempotencyKey, tag }) {
  const r = await timedFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: SUPPORT_EMAIL, subject, html, text, tags: [{ name: 'type', value: tag }] })
  }, 15000);
  let data = {}; try { data = await r.json(); } catch (e) { /* non-JSON error body */ }
  if (!r.ok) { const err = new Error(data.message || 'Resend error ' + r.status); err.status = r.status; throw err; }
  return data;
}

/* ============================== email templates ============================== */
const C = { bg: '#F1E6D3', bg2: '#E8D6B8', card: '#FFFDF9', tint: '#FAF3E6', line: '#E8D6B3', gold: '#B5853E', goldLight: '#F3DDB1', goldMid: '#C59B56', ink: '#2A2018', soft: '#7A6A58', faint: '#A8997F' };
const SERIF = "Georgia,'Times New Roman',Times,serif", SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const trackUrl = (orderId) => `${SITE_URL}/track-order.html?orderId=${encodeURIComponent(orderId)}`;

function button(href, label) {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>
    <td align="center" bgcolor="${C.goldMid}" style="border-radius:100px;background:${C.goldMid};background-image:linear-gradient(135deg,#F6E7C4,${C.goldMid});">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:17px 40px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:.2px;color:#241C0F;text-decoration:none;border-radius:100px;">${esc(label)}</a>
    </td></tr></table>`;
}
function glass(inner, extra) {            /* "glass" card: translucent white with a fine champagne border (solid fallback for Outlook) */
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
    <td bgcolor="${C.card}" style="background:${C.card};background:rgba(255,253,249,0.86);border:1px solid ${C.line};border:1px solid rgba(197,155,86,0.38);border-radius:20px;padding:26px 26px;${extra || ''}">${inner}</td></tr></table>`;
}
const spacer = (h) => `<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`;
const label = (t) => `<div style="font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.faint};margin:0 0 6px;">${esc(t)}</div>`;

function layout({ title, preheader, body }) {
  const links = [['Privacy Policy &amp; Terms', 'privacy.html'], ['100-Day Guarantee', 'guarantee.html'], ['Returns Portal', 'returns.html']]
    .map(([t, h]) => `<a href="${SITE_URL}/${h}" target="_blank" style="color:${C.gold};text-decoration:none;">${t}</a>`).join(' &nbsp;&middot;&nbsp; ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};background-image:linear-gradient(160deg,#F8F0E1 0%,${C.bg2} 100%);"><tr><td align="center" style="padding:32px 14px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td align="center" style="padding:6px 0 26px;">
      <div style="font-family:${SERIF};font-size:34px;letter-spacing:6px;color:${C.ink};font-weight:400;">NIK<span style="font-style:italic;color:${C.gold};letter-spacing:4px;">ora</span></div>
      <div style="font-family:${SANS};font-size:10.5px;letter-spacing:3px;text-transform:uppercase;color:${C.soft};margin-top:6px;">Smart care &middot; Instant glow</div>
    </td></tr>
    <tr><td>${body}</td></tr>
    <tr><td align="center" style="padding:14px 10px 0;font-family:${SANS};font-size:12px;line-height:1.8;color:${C.soft};">
      <div>${links}</div>
      <div style="margin-top:12px;color:${C.faint};">&copy; ${new Date().getUTCFullYear()} NIKORA. All rights reserved.</div>
      <div style="margin-top:6px;color:${C.faint};">You are receiving this email because of your order at NIKORA.</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}
const supportNote = () => `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.7;color:${C.soft};text-align:center;">Questions? Contact us anytime at <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.gold};font-weight:700;text-decoration:none;">${SUPPORT_EMAIL}</a>. We reply within 2&ndash;4 business hours.</p>`;
const addressHtml = (name, a) => [name, a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' '), a.country].filter(Boolean).map(esc).join('<br>');
const addressText = (name, a) => [name, a.line1, a.line2, [a.city, a.postalCode].filter(Boolean).join(' '), a.country].filter(Boolean).join(', ');

function itemRow(i) {
  const img = i.image
    ? `<img src="${esc(i.image)}" alt="${esc(i.title)}" width="64" height="64" style="display:block;width:64px;height:64px;object-fit:cover;border-radius:12px;border:1px solid ${C.line};">`
    : `<div style="width:64px;height:64px;border-radius:12px;border:1px solid ${C.line};background:${C.tint};text-align:center;line-height:64px;font-family:${SERIF};font-size:22px;color:${C.gold};">N</div>`;
  return `<tr>
    <td width="64" valign="middle" style="padding:12px 14px 12px 0;border-top:1px solid ${C.line};">${img}</td>
    <td valign="middle" style="padding:12px 8px 12px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:14.5px;line-height:1.45;color:${C.ink};font-weight:600;">${esc(i.title)}<div style="font-weight:400;font-size:12.5px;color:${C.soft};margin-top:3px;">Qty ${i.qty} &middot; ${money(i.price)} each</div></td>
    <td align="right" valign="middle" style="padding:12px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:14.5px;font-weight:700;color:${C.ink};white-space:nowrap;">${money(i.line)}</td></tr>`;
}
const totalRow = (l, v, strong) => `<tr><td style="padding:5px 0;font-family:${SANS};font-size:14px;color:${C.soft};">${l}</td><td align="right" style="padding:5px 0;font-family:${SANS};font-size:14px;font-weight:${strong ? 700 : 600};color:${strong ? C.gold : C.ink};">${v}</td></tr>`;

function renderConfirmation(o) {
  const orderUrl = trackUrl(o.orderId), p = o.pricing;
  const pay = o.payment ? (o.payment.method === 'paypal' ? 'PayPal' : ((o.payment.brand ? o.payment.brand + ' ' : 'Card ') + (o.payment.last4 ? 'ending in ' + o.payment.last4 : '')).trim()) : '';
  const body =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 10px 26px;">
       <div style="font-family:${SERIF};font-size:34px;line-height:1.2;color:${C.ink};">Thank You for Your Order</div>
       <p style="margin:14px 0 0;font-family:${SANS};font-size:16px;line-height:1.7;color:${C.soft};">Hi ${esc(o.customer.firstName)}, we&rsquo;ve received your order and our team is getting it ready for dispatch.</p>
     </td></tr></table>` +
    glass(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
         <td valign="top" width="52%">${label('Order ID')}<div style="font-family:${SERIF};font-size:30px;line-height:1.1;color:${C.gold};font-weight:600;">#${esc(o.orderId)}</div></td>
         <td valign="top" align="right">${label('Order Date')}<div style="font-family:${SANS};font-size:15px;font-weight:600;color:${C.ink};">${esc(fmtLong(o.createdAt))}</div></td>
       </tr></table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
         <td valign="top" width="52%" style="padding-right:12px;">${label('Shipping to')}<div style="font-family:${SANS};font-size:14px;line-height:1.65;color:${C.ink};">${addressHtml(o.customer.name, o.customer.address)}</div></td>
         <td valign="top" align="right">${label('Estimated delivery')}<div style="font-family:${SANS};font-size:14px;line-height:1.65;color:${C.ink};"><strong>${esc(fmtRange(o.createdAt))}</strong><br><span style="color:${C.soft};">${DELIVERY_DAYS[0]}&ndash;${DELIVERY_DAYS[1]} business days</span></div></td>
       </tr></table>`) +
    glass(
      `${label('Your items')}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${o.items.map(itemRow).join('')}</table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid ${C.line};padding-top:10px;">
         ${totalRow('Subtotal', money(p.subtotal))}
         ${p.discount > 0 ? totalRow('Discount' + (p.promoCode ? ' (' + esc(p.promoCode) + ')' : ''), '&minus;' + money(p.discount), true) : ''}
         ${totalRow('Express Insured Shipping', '<span style="color:' + C.gold + ';letter-spacing:1px;font-size:12.5px;">FREE</span>')}
         ${totalRow('Estimated Tax', money(p.tax))}
       </table>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
         <td bgcolor="#EBD3A0" style="background:#EBD3A0;background-image:linear-gradient(135deg,${C.goldLight},${C.goldMid});border-radius:14px;padding:16px 20px;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
             <td style="font-family:${SANS};font-size:12.5px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#3A2A12;">Total</td>
             <td align="right" style="font-family:${SERIF};font-size:28px;font-weight:700;color:#241C0F;">${money(o.total)}</td></tr></table>
         </td></tr></table>
       ${pay ? `<div style="margin-top:12px;font-family:${SANS};font-size:12.5px;color:${C.soft};">Payment: ${esc(pay)}</div>` : ''}`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 8px;">${button(orderUrl, 'Track Your Order Status')}
       <p style="margin:14px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.6;color:${C.faint};">When asked, enter your order number and the email address or phone number you ordered with.</p></td></tr></table>` +
    spacer(18) + glass(supportNote());

  const text = [
    `NIKORA \u2013 Thank you for your order`, ``,
    `Hi ${o.customer.firstName}, we've received your order and are getting it ready for dispatch.`, ``,
    `Order ID: #${o.orderId}`, `Order date: ${fmtLong(o.createdAt)}`, `Shipping to: ${addressText(o.customer.name, o.customer.address)}`,
    `Estimated delivery: ${fmtRange(o.createdAt)} (${DELIVERY_DAYS[0]}-${DELIVERY_DAYS[1]} business days)`, ``,
    ...o.items.map((i) => `- ${i.title} x${i.qty}  ${money(i.line)}`), ``,
    `Subtotal: ${money(p.subtotal)}`, ...(p.discount > 0 ? [`Discount: -${money(p.discount)}`] : []), `Express Insured Shipping: FREE`, `Estimated Tax: ${money(p.tax)}`, `TOTAL: ${money(o.total)}`, ``,
    `Track your order status: ${orderUrl}`, ``, `Questions? Contact us anytime at ${SUPPORT_EMAIL}`
  ].join('\n');
  return { subject: `Your NIKORA order #${o.orderId} is confirmed`, html: layout({ title: `Order #${o.orderId} confirmed`, preheader: `Thank you, ${o.customer.firstName}! Order #${o.orderId} is confirmed.`, body }), text };
}

function renderShipping(o) {
  const orderUrl = trackUrl(o.orderId);
  const row = (k, v, big) => `<tr><td style="padding:11px 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${C.faint};" width="38%" valign="top">${esc(k)}</td>
    <td style="padding:11px 0;border-top:1px solid ${C.line};font-family:${big ? "'Courier New',Courier,monospace" : SANS};font-size:${big ? 19 : 15}px;font-weight:700;color:${C.ink};letter-spacing:${big ? '1.2px' : '0'};" valign="top">${v}</td></tr>`;
  const body =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 10px 26px;">
       <div style="font-family:${SERIF};font-size:34px;line-height:1.2;color:${C.ink};">Your NIKORA Package<br>is on the Way!</div>
       <p style="margin:14px 0 0;font-family:${SANS};font-size:16px;line-height:1.7;color:${C.soft};">Great news, ${esc(o.customer.name.split(' ')[0])}. Order <strong style="color:${C.gold};">#${esc(o.orderId)}</strong> has been handed to the carrier.</p>
     </td></tr></table>` +
    glass(
      `${label('Tracking details')}
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;">
         ${row('Carrier', esc(o.carrier))}
         ${row('Live tracking code', esc(o.trackingCode), true)}
         ${row('Estimated delivery', esc(fmtRange(o.shippedAt)) + `<div style="font-weight:400;font-size:13px;color:${C.soft};margin-top:2px;">${DELIVERY_DAYS[0]}&ndash;${DELIVERY_DAYS[1]} business days</div>`)}
         ${o.customer.address.line1 ? row('Delivering to', `<span style="font-weight:500;font-size:14px;line-height:1.6;">${addressHtml(o.customer.name, o.customer.address)}</span>`) : ''}
       </table>`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:10px 0 8px;">${button(orderUrl, 'Track Live Shipment')}
       ${o.carrierUrl ? `<p style="margin:14px 0 0;font-family:${SANS};font-size:13px;color:${C.soft};">Or follow it on the <a href="${esc(o.carrierUrl)}" target="_blank" style="color:${C.gold};font-weight:700;text-decoration:none;">${esc(o.carrier)} tracking page</a>.</p>` : ''}
       <p style="margin:14px 0 0;font-family:${SANS};font-size:12.5px;line-height:1.6;color:${C.faint};">When asked, enter your order number and the email address or phone number you ordered with.</p></td></tr></table>` +
    spacer(18) + glass(supportNote());

  const text = [
    `NIKORA \u2013 Your package is on the way!`, ``, `Order #${o.orderId} has been handed to the carrier.`, ``,
    `Carrier: ${o.carrier}`, `Tracking code: ${o.trackingCode}`, `Estimated delivery: ${fmtRange(o.shippedAt)} (${DELIVERY_DAYS[0]}-${DELIVERY_DAYS[1]} business days)`, ``,
    `Track live shipment: ${orderUrl}`, ...(o.carrierUrl ? [`Carrier tracking page: ${o.carrierUrl}`] : []), ``, `Questions? Contact us anytime at ${SUPPORT_EMAIL}`
  ].join('\n');
  return { subject: `Your NIKORA package is on the way (#${o.orderId})`, html: layout({ title: 'Your NIKORA package is on the way', preheader: `Order #${o.orderId} shipped with ${o.carrier}. Tracking code ${o.trackingCode}.`, body }), text };
}

/* ============================== request handler ============================== */
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { ok: false, error: 'Method not allowed.' }); }
  if (!process.env.RESEND_API_KEY) { console.error('RESEND_API_KEY is not set.'); return reply(res, 500, { ok: false, error: 'Email service is not configured.' }); }

  /* browsers may only call this from our own site (server-to-server callers send no Origin header) */
  const origin = req.headers.origin;
  if (origin) { let same = false; try { same = new URL(origin).host === req.headers.host; } catch (e) { /* bad origin */ } if (!same) return reply(res, 403, { ok: false, error: 'Origin not allowed.' }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }   /* fetch() without a JSON content-type arrives as a string */
  if (!body || typeof body !== 'object') return reply(res, 400, { ok: false, error: 'Invalid JSON body.' });
  const type = String(body.type || '').toUpperCase();

  try {
    /* -------- ORDER_CONFIRMATION (public, verified) -------- */
    if (type === 'ORDER_CONFIRMATION') {
      const o = cleanOrder(body.orderData);
      if (!o || !o.items.length) return reply(res, 400, { ok: false, error: 'Invalid order data.' });

      let rec;
      try { rec = await readTracking(o.orderId); } catch (e) { console.error('tracking lookup failed:', e.message); return reply(res, 502, { ok: false, error: 'Could not verify the order. Please retry.' }); }
      if (!rec) return reply(res, 404, { ok: false, error: 'Order not found.' });
      if (!emailMatchesRecord(rec, o.customer.email)) return reply(res, 403, { ok: false, error: 'Email does not match this order.' });
      if (Date.now() - Number(rec.createdAt || 0) > CONFIRMATION_MAX_AGE_MS) return reply(res, 410, { ok: false, error: 'This confirmation window has expired.' });

      const key = `${o.orderId}_confirmation`;
      if ((await claim(key)) === 'exists') return reply(res, 200, { ok: true, skipped: 'already-sent' });

      const mail = renderConfirmation(o);
      try {
        const sent = await sendViaResend({ to: o.customer.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: key, tag: 'ORDER_CONFIRMATION' });
        await finishClaim(key, true);
        console.log('ORDER_CONFIRMATION sent', o.orderId, maskEmail(o.customer.email), sent && sent.id);
        return reply(res, 200, { ok: true, id: sent && sent.id });
      } catch (e) {
        await finishClaim(key, false);
        console.error('Resend failed (ORDER_CONFIRMATION):', e.status || '', e.message);
        return reply(res, 502, { ok: false, error: 'Email provider error.' });
      }
    }

    /* -------- SHIPPING_TRACKING (admin only) -------- */
    if (type === 'SHIPPING_TRACKING') {
      const secret = process.env.EMAIL_ADMIN_SECRET;
      if (!secret) return reply(res, 503, { ok: false, error: 'Shipping emails are not enabled (EMAIL_ADMIN_SECRET not set).' });
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!token || !safeEq(token, secret)) return reply(res, 401, { ok: false, error: 'Unauthorized.' });

      const o = cleanShipping(body.orderData);
      if (!o) return reply(res, 400, { ok: false, error: 'orderData needs orderId, customer.email, shipping.carrier and shipping.trackingCode.' });

      let rec = null;                                   /* if the order is on file, make sure the email is the order's (avoids misdirected mail) */
      try { rec = await readTracking(o.orderId); } catch (e) { console.warn('tracking lookup skipped:', e.message); }
      if (rec && !emailMatchesRecord(rec, o.customer.email)) return reply(res, 409, { ok: false, error: 'Email does not match the email on this order.' });

      const key = `${o.orderId}_shipping_${sha256(o.trackingCode).slice(0, 12)}`;
      if ((await claim(key)) === 'exists') return reply(res, 200, { ok: true, skipped: 'already-sent' });

      const mail = renderShipping(o);
      try {
        const sent = await sendViaResend({ to: o.customer.email, subject: mail.subject, html: mail.html, text: mail.text, idempotencyKey: key, tag: 'SHIPPING_TRACKING' });
        await finishClaim(key, true);
        console.log('SHIPPING_TRACKING sent', o.orderId, maskEmail(o.customer.email), sent && sent.id);
        return reply(res, 200, { ok: true, id: sent && sent.id });
      } catch (e) {
        await finishClaim(key, false);
        console.error('Resend failed (SHIPPING_TRACKING):', e.status || '', e.message);
        return reply(res, 502, { ok: false, error: 'Email provider error.' });
      }
    }

    return reply(res, 400, { ok: false, error: 'Unknown type. Use ORDER_CONFIRMATION or SHIPPING_TRACKING.' });
  } catch (e) {
    console.error('send-email unexpected error:', e);
    return reply(res, 500, { ok: false, error: 'Unexpected error.' });
  }
}

module.exports = handler;
module.exports._internals = { cleanOrder, cleanShipping, renderConfirmation, renderShipping };   /* exposed for tests only */
