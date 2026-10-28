/**
 * api/wc/v3/orders.js  ->  https://<your-domain>/api/wc/v3/orders
 * Reachable as /wp-json/wc/v3/orders and /wp-json/wc/v3/orders/:id through the rewrites in vercel.json.
 *
 *  GET  /orders        K-Dropshipping polling. Basic Auth (ck_... / cs_...). Filters: status, supplier, after, before,
 *                      modified_after, per_page (max 100), page, order, orderby. Returns WooCommerce v3 orders.
 *  GET  /orders/:id    One order (same auth).
 *  POST /orders        (a) Checkout bridge, no secret needed: { orderKey, email } stamps an ALREADY PAID order from
 *                          /orders as synced and returns it as a WooCommerce 201.
 *                      (b) Authenticated WooCommerce payload (Basic Auth): validated, priced on the server, saved to
 *                          /orders as "Processing" and returned as a WooCommerce 201.
 *  PUT  /orders/:id    Basic Auth. status / tracking written back by the supplier side.
 */
'use strict';

const crypto = require('crypto');
const b = require('../../../lib/wc-bridge');

const MAX_SCAN = 500;                    /* newest orders read per request; fine for a small store */
const MAX_ITEMS = 50;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, PUT, PATCH, OPTIONS'); return res.status(204).end(); }

  try {
    const db = b.getDb();
    const id = req.query && req.query.id ? String(req.query.id).replace(/\D/g, '') : '';
    const body = parseBody(req);

    if (req.method === 'POST') {
      if (body && typeof body.orderKey === 'string' && !(req.headers.authorization || (req.query && req.query.consumer_key))) {
        return await checkoutAck(req, res, db, body);
      }
      if (!b.authenticate(req)) return unauthorized(res, 'woocommerce_rest_cannot_create', 'Sorry, you are not allowed to create resources.');
      return await createOrder(req, res, db, body || {});
    }

    if (!b.authenticate(req)) return unauthorized(res, 'woocommerce_rest_cannot_view', 'Sorry, you cannot list resources.');

    if (req.method === 'GET') return id ? await getOne(req, res, db, id) : await getList(req, res, db);
    if (req.method === 'PUT' || req.method === 'PATCH') {
      if (!id) return b.wcError(res, 404, 'rest_no_route', 'No route was found matching the URL and request method.');
      return await updateOrder(req, res, db, id, body || {});
    }
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, OPTIONS');
    return b.wcError(res, 405, 'rest_no_route', 'No route was found matching the URL and request method.');
  } catch (err) {
    console.error('[wc/v3/orders]', err && err.message);
    const missing = err && err.message === 'firebase-credentials-missing';
    return b.wcError(res, 500, missing ? 'nikora_not_configured' : 'internal_server_error', missing ? 'Server credentials are not configured.' : 'Internal server error.');
  }
};

/* ------------------------------------------------------------------ helpers */
function parseBody(req) {
  let x = req.body;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch (e) { x = null; } }
  return x && typeof x === 'object' ? x : null;
}
function unauthorized(res, code, message) {
  res.setHeader('WWW-Authenticate', 'Basic realm="NIKORA WooCommerce API"');
  return b.wcError(res, 401, code, message);
}
async function loadRecent(db) {
  const snap = await db.ref('orders').orderByChild('createdAt').limitToLast(MAX_SCAN).once('value');
  const out = [];
  snap.forEach((ch) => {
    const v = ch.val();
    if (v && typeof v === 'object' && v.items && v.customer) out.push([ch.key, v]);
  });
  out.sort((x, y) => Date.parse(b.toIso(y[1].createdAt)) - Date.parse(b.toIso(x[1].createdAt)));
  return out;
}
async function findById(db, id) {
  const want = parseInt(id, 10);
  const all = await loadRecent(db);
  return all.find(([k, o]) => b.wcIdFor(k, o.displayId || o.orderId || k) === want) || null;
}
const feedSupplier = (req) => String((req.query && req.query.supplier) || process.env.WC_FEED_SUPPLIER || 'k-dropshipping').toLowerCase();

/* ------------------------------------------------------------------ GET */
async function getOne(req, res, db, id) {
  const hit = await findById(db, id);
  if (!hit) return b.wcError(res, 404, 'woocommerce_rest_shop_order_invalid_id', 'Invalid ID.');
  return res.status(200).json(b.toWooOrder(hit[0], hit[1], b.baseUrlOf(req), { supplier: feedSupplier(req) }));
}

async function getList(req, res, db) {
  const q = req.query || {};
  const perPage = Math.min(100, Math.max(1, parseInt(q.per_page, 10) || 10));
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const statusParam = String(q.status || process.env.WC_DEFAULT_STATUS || 'processing').toLowerCase();
  const wanted = statusParam === 'any' ? null : statusParam.split(',').map((s) => s.trim()).filter(Boolean);
  const supplier = feedSupplier(req);
  const after = q.after ? Date.parse(q.after + (/[zZ]|[+-]\d\d:?\d\d$/.test(q.after) ? '' : 'Z')) : null;
  const before = q.before ? Date.parse(q.before + (/[zZ]|[+-]\d\d:?\d\d$/.test(q.before) ? '' : 'Z')) : null;
  const modAfter = q.modified_after ? Date.parse(q.modified_after + (/[zZ]|[+-]\d\d:?\d\d$/.test(q.modified_after) ? '' : 'Z')) : null;

  let rows = (await loadRecent(db)).filter(([, o]) => b.isPaid(o));
  rows = rows.filter(([, o]) => {
    const t = Date.parse(b.toIso(o.createdAt));
    const m = Date.parse(b.toIso(o.updatedAt || o.shippedAt || o.createdAt));
    if (wanted && wanted.indexOf(b.toWcStatus(o.status)) === -1) return false;
    if (after && !(t > after)) return false;
    if (before && !(t < before)) return false;
    if (modAfter && !(m > modAfter)) return false;
    return true;
  });
  const base = b.baseUrlOf(req);
  let woo = rows.map(([k, o]) => b.toWooOrder(k, o, base, { supplier })).filter((w) => w.line_items.length > 0);
  if (String(q.order || 'desc').toLowerCase() === 'asc') woo.reverse();
  const total = woo.length;
  woo = woo.slice((page - 1) * perPage, page * perPage);
  res.setHeader('X-WP-Total', String(total));
  res.setHeader('X-WP-TotalPages', String(Math.max(1, Math.ceil(total / perPage))));
  return res.status(200).json(woo);
}

/* ------------------------------------------------------------------ POST (a): checkout bridge */
async function checkoutAck(req, res, db, body) {
  const key = b.str(body.orderKey, 64);
  const email = b.str(body.email, 120).toLowerCase();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(key) || !email) return b.wcError(res, 400, 'rest_invalid_param', 'orderKey and email are required.');
  const snap = await db.ref('orders/' + key).once('value');
  const o = snap.val();
  /* the email must match the order, same proof track-order.html asks for; a wrong guess looks like a missing order */
  if (!o || !o.customer || String(o.customer.email || '').toLowerCase() !== email) return b.wcError(res, 404, 'woocommerce_rest_shop_order_invalid_id', 'Invalid ID.');
  if (!b.isPaid(o)) return b.wcError(res, 409, 'nikora_order_not_paid', 'Order is not paid yet.');
  const id = b.wcIdFor(key, o.displayId || o.orderId || key);
  const tx = await db.ref('orders/' + key + '/wc').transaction((cur) => (cur ? undefined : { id, syncedAt: new Date().toISOString(), source: 'checkout' }));
  return res.status(tx.committed ? 201 : 200).json(b.toWooOrder(key, o, b.baseUrlOf(req), { supplier: 'all' }));
}

/* ------------------------------------------------------------------ POST (b): authenticated WooCommerce payload */
function validateCreate(p) {
  const errs = [];
  const bill = p.billing || {}, ship = p.shipping && Object.keys(p.shipping).length ? p.shipping : bill;
  const email = b.str(bill.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errs.push('billing.email is invalid');
  if (!b.str(ship.first_name || bill.first_name, 80)) errs.push('first_name is required');
  if (b.str(ship.address_1, 200).length < 4) errs.push('shipping.address_1 is required');
  if (!b.str(ship.city, 100)) errs.push('shipping.city is required');
  if (!b.str(ship.postcode, 20)) errs.push('shipping.postcode is required');
  const items = Array.isArray(p.line_items) ? p.line_items : [];
  if (!items.length) errs.push('line_items must not be empty');
  if (items.length > MAX_ITEMS) errs.push('too many line_items');
  items.slice(0, MAX_ITEMS).forEach((li, i) => {
    const qty = parseInt(li && li.quantity, 10);
    const unit = li && li.price != null ? Number(li.price) : (li && li.total != null && qty ? Number(li.total) / qty : NaN);
    if (!li || !(qty >= 1 && qty <= 99)) errs.push('line_items[' + i + '].quantity must be 1-99');
    if (!isFinite(unit) || unit < 0) errs.push('line_items[' + i + '].price is invalid');
    if (!(li && (li.product_id || li.sku || li.name))) errs.push('line_items[' + i + '] needs product_id, sku or name');
  });
  return { errs, bill, ship, email, items };
}

async function createOrder(req, res, db, p) {
  const v = validateCreate(p);
  if (v.errs.length) return b.wcError(res, 400, 'rest_invalid_param', 'Invalid parameter(s): ' + v.errs.join('; ') + '.');

  const items = v.items.map((li) => {
    const qty = parseInt(li.quantity, 10);
    const unit = li.price != null ? Number(li.price) : Number(li.total) / qty;
    const num = li.product_id ? Number(li.product_id) : 0;
    return { id: String(num || b.str(li.sku, 60) || 'custom'), variant: 'default', title: b.str(li.name || ('Product #' + num), 200), price: Math.round(unit * 100) / 100, qty, quantity: qty, lineTotal: Math.round(unit * 100) * qty / 100, sku: b.str(li.sku, 80) };
  });
  const subtotalC = items.reduce((s, i) => s + b.cents(i.lineTotal), 0);
  const couponLines = Array.isArray(p.coupon_lines) ? p.coupon_lines : [];
  const discountC = Math.min(subtotalC, couponLines.reduce((s, c) => s + b.cents(c && c.discount), 0));
  const afterC = subtotalC - discountC;
  const shipping = b.shippingFor(afterC / 100);                       /* free from $50.00, otherwise $4.99, once per order */
  const tax = Math.max(0, Number(p.total_tax) || 0);
  const total = Math.round(afterC + b.cents(shipping) + b.cents(tax)) / 100;

  const ship = v.ship, bill = v.bill;
  const tid = b.str(p.transaction_id, 60).replace(/[^A-Za-z0-9_-]/g, '');
  const key = 'WC-' + (tid ? tid.slice(0, 40) : Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase());
  const now = new Date().toISOString();
  const first = b.str(ship.first_name || bill.first_name, 80), last = b.str(ship.last_name || bill.last_name, 80);
  const rec = {
    orderId: key, displayId: key, source: 'wc-api', status: 'Processing', trackingNumber: null, createdAt: now,
    customer: {
      name: (first + ' ' + last).trim(), firstName: first, lastName: last, email: v.email, phone: b.str(bill.phone || ship.phone, 40),
      address: { line1: b.str(ship.address_1, 200), line2: b.str(ship.address_2, 200), city: b.str(ship.city, 100), state: b.str(ship.state, 100), postalCode: b.str(ship.postcode, 20), country: b.countryCode(ship.country || bill.country || 'US') }
    },
    items,
    pricing: { subtotal: subtotalC / 100, discount: discountC / 100, promoCode: b.str((couponLines[0] || {}).code, 40), shipping, shippingLabel: shipping > 0 ? 'Express Shipping (flat rate)' : 'Free Express Shipping', tax, taxRate: 0 },
    total, currency: 'USD', notes: b.str(p.customer_note, 500),
    payment: { method: b.str(p.payment_method || 'external', 40), title: b.str(p.payment_method_title, 80), status: 'external', transactionId: tid }
  };
  const tx = await db.ref('orders/' + key).transaction((cur) => (cur === null ? rec : undefined));   /* create-only: never overwrites */
  const saved = tx.committed ? rec : (await db.ref('orders/' + key).once('value')).val();
  return res.status(tx.committed ? 201 : 200).json(b.toWooOrder(key, saved, b.baseUrlOf(req), { supplier: 'all' }));
}

/* ------------------------------------------------------------------ PUT: status + tracking written back */
function pickTracking(p) {
  let number = b.str(p.tracking_number || p.tracking_code, 80), carrier = b.str(p.tracking_carrier || p.carrier || p.tracking_provider, 60);
  (Array.isArray(p.meta_data) ? p.meta_data : []).forEach((m) => {
    if (!m || !m.key) return;
    if (/tracking_items$/i.test(m.key) && Array.isArray(m.value) && m.value[0]) {
      number = number || b.str(m.value[0].tracking_number, 80); carrier = carrier || b.str(m.value[0].tracking_provider || m.value[0].custom_tracking_provider, 60);
    } else if (/tracking_(number|code)/i.test(m.key)) number = number || b.str(m.value, 80);
    else if (/(carrier|provider)/i.test(m.key)) carrier = carrier || b.str(m.value, 60);
  });
  return { number, carrier };
}

async function updateOrder(req, res, db, id, p) {
  const hit = await findById(db, id);
  if (!hit) return b.wcError(res, 404, 'woocommerce_rest_shop_order_invalid_id', 'Invalid ID.');
  const [key, o] = hit;
  const t = pickTracking(p);
  const upd = { updatedAt: new Date().toISOString() };
  if (p.status || t.number) {
    upd.status = b.fromWcStatus(p.status || 'completed', !!t.number);
    if (upd.status === 'Shipped' && !o.shippedAt) upd.shippedAt = upd.updatedAt;
  }
  if (t.number) upd.trackingNumber = t.number;
  if (t.carrier) upd.carrier = t.carrier;
  await db.ref('orders/' + key).update(upd);
  return res.status(200).json(b.toWooOrder(key, Object.assign({}, o, upd), b.baseUrlOf(req), { supplier: 'all' }));
}
