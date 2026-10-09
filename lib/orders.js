/**
 * Order pipeline shared by every payment path (Stripe webhook, Stripe confirm, PayPal capture).
 *
 *   validate + server-side price  ->  pending checkout (before payment)
 *   payment confirmed             ->  finalizePaidOrder():  /orders + /tracking  ->  CJ Dropshipping  ->  Resend email
 *
 * An order is only ever created AFTER money has been collected, and exactly once per payment
 * (a lock on /paymentIndex/{provider}_{reference} makes the Stripe webhook, the browser's "confirm" call and
 * any retry safe to run at the same time).
 */
'use strict';

const crypto = require('crypto');
const { SITE_URL, sha256, clip, num, validEmail, httpsUrl, maskEmail, addBusinessDays, timedFetch, countryName } = require('./common');
const { pushToSupplier } = require('./supplier');

const TAX_RATE = 0.08;                 // must match CK_TAX_RATE in checkout.html
const DELIVERY_BUSINESS_DAYS = [8, 18]; // 1-3 days processing + 7-15 days shipping (store policy)
const MAX_ITEMS = 25;

const promoKey = (c) => String(c || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
const round2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refKey = (provider, ref) => provider + '_' + String(ref).replace(/[.#$\[\]\/]/g, '_');

/* ---------------- input validation ---------------- */
function cleanInput(b) {
  if (!b || typeof b !== 'object') return { error: 'Invalid request.' };
  const c = b.customer || {}, a = c.address || {};
  const name = clip(c.name, 100), email = String(c.email || '').trim().toLowerCase();
  const address = { line1: clip(a.line1, 120), line2: clip(a.line2, 120), city: clip(a.city, 80), state: clip(a.state, 80), postalCode: clip(a.postalCode, 20), country: countryName(a.country) };
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

  return {
    customer: { name, firstName: clip(c.firstName, 60) || name.split(' ')[0], lastName: clip(c.lastName, 60) || name.split(' ').slice(1).join(' '), email, phone: clip(c.phone, 30), address },
    items,
    promoCode: promoKey(b.pricing && b.pricing.promoCode),
    clientTotal: num(b.total),
    notes: clip(b.notes, 500)
  };
}

/* ---------------- server-side pricing (the browser's numbers are never trusted) ---------------- */
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

/* ---------------- pending checkout (holds the validated order until payment succeeds) ---------------- */
async function savePending(db, provider, ref, input, cart) {
  await db.ref('pendingCheckouts/' + refKey(provider, ref)).set({
    provider, ref, createdAt: Date.now(),
    customer: input.customer, items: cart.items, pricing: cart.pricing, total: cart.total, amountCents: cents(cart.total), currency: 'USD', notes: input.notes
  });
}
const loadPending = async (db, provider, ref) => (await db.ref('pendingCheckouts/' + refKey(provider, ref)).once('value')).val();

/* ---------------- unique order id ---------------- */
async function claimOrder(db, build) {
  for (let n = 0; n < 15; n++) {
    const id = 'NK-' + (1002 + crypto.randomInt(0, 8998));          // 4 digits like the rest of the site
    const record = build(id);
    const res = await db.ref('orders/' + id).transaction((cur) => (cur === null ? record : undefined), undefined, false);
    if (res.committed) return record;
  }
  throw new Error('no-free-order-id');
}

/* ---------------- confirmation email (via /api/send-email) ---------------- */
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

/* what the browser is allowed to see about an order it just paid for (no phone, no internal fields) */
function publicOrder(o, extra) {
  return Object.assign({
    success: true, orderId: '#' + o.orderId, key: o.orderId, displayId: '#' + o.orderId, createdAt: o.createdAt,
    customer: { name: o.customer.name, firstName: o.customer.firstName, email: o.customer.email, address: o.customer.address },
    items: o.items.map((i) => ({ id: i.id, title: i.title, price: i.price, qty: i.qty, lineTotal: i.lineTotal, image: i.image || '' })),
    pricing: o.pricing, total: o.total,
    payment: { method: o.payment.method, brand: o.payment.brand || '', last4: o.payment.last4 || '' }
  }, extra || {});
}

/**
 * Turn a confirmed payment into an order. Idempotent: calling it again for the same payment returns the same order.
 *   provider  'stripe' | 'paypal'
 *   ref       PaymentIntent id / PayPal order id (the key of the pending checkout)
 *   payment   { method: 'card'|'apple_pay'|'google_pay'|'paypal', brand?, last4?, reference, captureId?, amountCents }
 * Throws Error('pending-missing') when no pending checkout exists for a payment that has no order yet.
 */
async function finalizePaidOrder(db, { provider, ref, payment }) {
  const idxRef = db.ref('paymentIndex/' + refKey(provider, ref));

  /* 1. take the lock, or return the order somebody else already created */
  let owner = false;
  for (let attempt = 0; attempt < 12 && !owner; attempt++) {
    const tx = await idxRef.transaction((cur) => {
      if (cur === null) return { state: 'claiming', at: Date.now() };
      if (cur.orderId) return undefined;                                       // finished already
      if (Date.now() - (cur.at || 0) > 60000) return { state: 'claiming', at: Date.now() };   // stale lock from a crashed run
      return undefined;                                                         // someone else is working on it
    }, undefined, false);
    if (tx.committed) { owner = true; break; }
    const cur = tx.snapshot.val();
    if (cur && cur.orderId) {
      const existing = (await db.ref('orders/' + cur.orderId).once('value')).val();
      if (existing) return publicOrder(existing, { duplicate: true, emailSent: existing.emailSent !== false });
    }
    await sleep(800);
  }
  if (!owner) throw new Error('order-finalize-busy');

  try {
    /* 2. the validated cart saved before payment */
    const pending = await loadPending(db, provider, ref);
    if (!pending) throw new Error('pending-missing');
    if (payment.amountCents != null && payment.amountCents !== pending.amountCents) throw new Error('amount-mismatch');

    /* 3. the order itself */
    const createdAt = Date.now();
    const order = await claimOrder(db, (id) => ({
      orderId: id, displayId: '#' + id, createdAt, status: 'Processing', trackingNumber: null,
      customer: pending.customer, items: pending.items, pricing: pending.pricing, total: pending.total, currency: pending.currency || 'USD', notes: pending.notes || '',
      payment: Object.assign({ provider, status: 'paid', paidAt: createdAt }, payment)
    }));
    await idxRef.set({ state: 'done', orderId: order.orderId, at: Date.now() });   // from here on duplicates get this order back

    /* 4. privacy-safe tracking record that track-order.html reads (salted email hash only) */
    const salt = crypto.randomBytes(12).toString('hex'), a = order.customer.address;
    await db.ref('tracking/' + order.orderId).set({
      orderId: order.orderId, status: 'Processing', step: 1, createdAt,
      etaFrom: addBusinessDays(createdAt, DELIVERY_BUSINESS_DAYS[0]).getTime(),
      eta: addBusinessDays(createdAt, DELIVERY_BUSINESS_DAYS[1]).getTime(),
      itemCount: order.items.reduce((n, i) => n + i.qty, 0),
      items: order.items.map((i) => ({ title: i.title, qty: i.qty, price: i.price, image: i.image || '' })),
      total: order.total, destination: [a.city, a.country].filter(Boolean).join(', '),
      s: salt, k: [sha256(salt + ':e:' + order.customer.email)]
    });

    /* 5. CJ Dropshipping + Resend email in parallel; neither can fail a paid order */
    const [sup, mail] = await Promise.allSettled([pushToSupplier(order, db), sendConfirmation(order)]);
    const fulfillment = sup.status === 'fulfilled' ? sup.value : { provider: 'unknown', status: 'failed', error: 'push crashed' };
    const emailSent = mail.status === 'fulfilled' && mail.value === true;
    await db.ref('orders/' + order.orderId).update({ fulfillment: Object.assign({ at: Date.now() }, fulfillment), emailSent })
      .catch((e) => console.error('could not record fulfillment result', e.message));
    if (fulfillment.status === 'failed') console.error('ACTION NEEDED: supplier push failed for', order.orderId, fulfillment.error);

    await db.ref('pendingCheckouts/' + refKey(provider, ref)).remove().catch(() => {});   // do not keep the customer's details twice
    return publicOrder(order, { emailSent });
  } catch (e) {
    const cur = (await idxRef.once('value')).val();
    if (!cur || !cur.orderId) await idxRef.remove().catch(() => {});             // release the lock so a retry can run
    throw e;
  }
}

/* record a payment that needs a human (amount mismatch, no matching cart, ...) */
async function recordPaymentIssue(db, provider, ref, issue, detail) {
  console.error('PAYMENT ISSUE', provider, ref, issue, detail || '');
  await db.ref('paymentIssues/' + refKey(provider, ref)).set({ provider, ref, issue, detail: clip(detail, 300), at: Date.now() }).catch(() => {});
}

module.exports = { TAX_RATE, DELIVERY_BUSINESS_DAYS, cents, cleanInput, priceCart, savePending, loadPending, finalizePaidOrder, recordPaymentIssue, publicOrder, refKey };
