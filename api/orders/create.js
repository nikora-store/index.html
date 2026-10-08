/**
 * POST /api/orders/create   (Vercel Serverless Function, Node 18+)
 * ---------------------------------------------------------------------------------------------
 * Called by checkout.html when the customer clicks "Complete Order". In one request it:
 *   1. validates the customer / address / cart and RE-PRICES the cart on the server
 *      (product prices from /products, promo code from /promocodes), so a tampered browser cannot change what is charged
 *   2. claims a unique order id  NK-####  (atomic transaction, no duplicates)
 *   3. saves the full order to /orders/{orderId}  with status "Processing", trackingNumber null, createdAt
 *   4. writes the privacy-safe mirror /tracking/{orderId} that track-order.html reads (hashed email, no address/phone)
 *   5. in parallel: pushes the order to the supplier (CJ / Shopify-Zendrop) and sends the confirmation email
 *   6. returns { success: true, orderId: "NK-1084", displayId: "#NK-1084", ... }
 *
 * A supplier or email failure NEVER fails the order: the customer already paid, so the result is recorded on
 * /orders/{id}/fulfillment and /orders/{id}/emailSent for you to retry.
 *
 * ENV  FIREBASE_SERVICE_ACCOUNT (service-account JSON), SITE_URL, RESEND_* (used by /api/send-email),
 *      SUPPLIER + its keys (see lib/supplier.js)
 */
'use strict';

const crypto = require('crypto');
const { SITE_URL, getDb, sha256, clip, num, validEmail, httpsUrl, maskEmail, addBusinessDays, reply, timedFetch, sameOrigin } = require('../../lib/common');
const { pushToSupplier } = require('../../lib/supplier');

const TAX_RATE = 0.08;                 // must match CK_TAX_RATE in checkout.html
const DELIVERY_DAYS = [5, 9];          // business days, must match checkout / emails
const MAX_ITEMS = 25;

const promoKey = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
const randomSalt = () => crypto.randomBytes(12).toString('hex');
const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------- input validation ---------------- */
function cleanInput(b) {
  if (!b || typeof b !== 'object') return { error: 'Invalid request.' };
  const c = b.customer || {}, a = c.address || {};
  const name = clip(c.name, 100), email = String(c.email || '').trim().toLowerCase();
  const address = { line1: clip(a.line1, 120), line2: clip(a.line2, 120), city: clip(a.city, 80), postalCode: clip(a.postalCode, 20), country: clip(a.country, 60) };
  if (!name) return { error: 'Please enter your name.' };
  if (!validEmail(email)) return { error: 'Please enter a valid email address.' };
  if (!address.line1 || !address.city || !address.country) return { error: 'Please complete your shipping address.' };

  const raw = Array.isArray(b.items) ? b.items.slice(0, MAX_ITEMS) : [];
  const items = [];
  for (const i of raw) {
    const id = String((i && i.id) == null ? '' : i.id);
    const qty = Math.floor(Number(i && i.qty));
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !(qty >= 1 && qty <= 99)) return { error: 'Your bag contains an invalid item.' };
    items.push({ id, title: clip(i.title, 140) || 'NIKORA item', price: num(i.price), qty, image: httpsUrl(i.image) });
  }
  if (!items.length) return { error: 'Your bag is empty.' };

  const pay = b.payment && typeof b.payment === 'object' ? b.payment : {};
  return {
    customer: { name, firstName: clip(c.firstName, 60) || name.split(' ')[0], lastName: clip(c.lastName, 60), email, phone: clip(c.phone, 30), address },
    items,
    promoCode: promoKey(b.pricing && b.pricing.promoCode),
    clientTotal: num(b.total),
    notes: clip(b.notes, 500),
    payment: pay.method === 'paypal' ? { method: 'paypal' } : { method: 'card', brand: clip(pay.brand, 20), last4: /^\d{4}$/.test(String(pay.last4 || '')) ? String(pay.last4) : '' }
  };
}

/* ---------------- server-side pricing ---------------- */
async function priceCart(db, input) {
  const priced = await Promise.all(input.items.map(async (it) => {
    const p = (await db.ref('products/' + it.id).once('value')).val();
    const live = p && Number(p.price);
    const price = live > 0 ? round2(live) : it.price;                  // products that only exist in the page's built-in fallback list keep the browser's price
    const image = httpsUrl(p && (p.img || p.imgUrl || (Array.isArray(p.images) && p.images[0]))) || it.image;
    return { id: it.id, title: it.title, price, qty: it.qty, lineTotal: round2(price * it.qty), image, priceVerified: live > 0 };
  }));
  if (priced.some((i) => !(i.price > 0))) return { error: 'An item in your bag has no valid price.' };

  const subtotal = round2(priced.reduce((s, i) => s + i.lineTotal, 0));
  let discount = 0, promoCode = '';
  if (input.promoCode) {
    const p = (await db.ref('promocodes/' + input.promoCode).once('value')).val();
    const value = p ? Number(p.value) : 0;
    if (!p || p.active === false || !(value > 0) || (p.expiresAt && Date.now() > Number(p.expiresAt))) {
      return { conflict: 'Promo code ' + input.promoCode + ' is no longer valid. Please review your total.' };
    }
    const d = p.type === 'fixed' ? value : subtotal * Math.min(100, value) / 100;
    discount = Math.min(round2(d), subtotal);
    promoCode = input.promoCode;
  }
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2(taxable * TAX_RATE);
  const total = round2(taxable + tax);
  if (Math.abs(total - input.clientTotal) > 0.01) return { conflict: 'Prices were updated since you opened checkout. Please review your total and try again.' };
  return { items: priced, pricing: { subtotal, discount, promoCode, shipping: 0, shippingLabel: 'Express Insured Shipping', tax, taxRate: TAX_RATE }, total };
}

/* ---------------- unique order id ---------------- */
async function claimOrder(db, build) {
  for (let n = 0; n < 15; n++) {
    const id = 'NK-' + (1002 + crypto.randomInt(0, 8998));          // NK-1001 stays reserved; 4 digits like the rest of the site
    const record = build(id);
    const res = await db.ref('orders/' + id).transaction((cur) => (cur === null ? record : undefined), undefined, false);
    if (res.committed) return record;
  }
  throw new Error('no-free-order-id');
}

/* ---------------- confirmation email (via the existing /api/send-email) ---------------- */
async function sendConfirmation(order) {
  try {
    const r = await timedFetch(SITE_URL + '/api/send-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'ORDER_CONFIRMATION', orderData: {
        orderId: order.orderId, displayId: order.displayId, createdAt: order.createdAt,
        customer: { name: order.customer.name, firstName: order.customer.firstName, email: order.customer.email, address: order.customer.address },
        items: order.items.map((i) => ({ id: i.id, title: i.title, price: i.price, qty: i.qty, lineTotal: i.lineTotal, image: i.image })),
        pricing: order.pricing, total: order.total, currency: order.currency, payment: order.payment
      } })
    }, 20000);
    if (!r.ok) { console.error('confirmation email HTTP', r.status, maskEmail(order.customer.email)); return false; }
    return true;
  } catch (e) { console.error('confirmation email failed:', e.message); return false; }
}

/* ---------------- handler ---------------- */
async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { success: false, error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return reply(res, 403, { success: false, error: 'Origin not allowed.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const input = cleanInput(body);
  if (input.error) return reply(res, 400, { success: false, error: input.error });

  let db;
  try { db = getDb(); } catch (e) { console.error('Firebase admin init failed:', e.message); return reply(res, 500, { success: false, error: 'Order service is not configured.' }); }

  try {
    const cart = await priceCart(db, input);
    if (cart.error) return reply(res, 400, { success: false, error: cart.error });
    if (cart.conflict) return reply(res, 409, { success: false, error: cart.conflict });

    const createdAt = Date.now();
    const order = await claimOrder(db, (id) => ({
      orderId: id, displayId: '#' + id, createdAt, status: 'Processing', trackingNumber: null,
      customer: input.customer, items: cart.items, pricing: cart.pricing, total: cart.total, currency: 'USD',
      payment: input.payment, notes: input.notes
    }));

    /* privacy-safe mirror for track-order.html: only a salted hash of the email, never the address or phone */
    const salt = randomSalt();
    const a = order.customer.address;
    await db.ref('tracking/' + order.orderId).set({
      orderId: order.orderId, status: 'Processing', step: 1, createdAt,
      eta: addBusinessDays(createdAt, DELIVERY_DAYS[1]).getTime(),
      itemCount: order.items.reduce((n, i) => n + i.qty, 0),
      items: order.items.map((i) => ({ title: i.title, qty: i.qty, price: i.price, image: i.image || '' })),
      total: order.total,
      destination: [a.city, a.country].filter(Boolean).join(', '),
      s: salt, k: [sha256(salt + ':e:' + order.customer.email)]
    });

    /* supplier push + email in parallel; neither can fail the order */
    const [sup, mail] = await Promise.allSettled([pushToSupplier(order, db), sendConfirmation(order)]);
    const fulfillment = sup.status === 'fulfilled' ? sup.value : { provider: 'unknown', status: 'failed', error: 'push crashed' };
    const emailSent = mail.status === 'fulfilled' && mail.value === true;
    await db.ref('orders/' + order.orderId).update({ fulfillment: Object.assign({ at: Date.now() }, fulfillment), emailSent })
      .catch((e) => console.error('could not record fulfillment result', e.message));
    if (fulfillment.status === 'failed') console.error('ACTION NEEDED: supplier push failed for', order.orderId, fulfillment.error);

    return reply(res, 200, {
      success: true, orderId: order.orderId, displayId: order.displayId, createdAt, emailSent,
      items: order.items, pricing: order.pricing, total: order.total
    });
  } catch (e) {
    console.error('orders/create failed:', e);
    return reply(res, 500, { success: false, error: 'We could not place your order. Please try again.' });
  }
}

module.exports = handler;
