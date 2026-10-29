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
 *
 *  Discovery (what K-Dropshipping probes before it validates the keys), selected by ?route= from the vercel.json rewrites:
 *  GET  /wp-json/                   route=root           WordPress/WooCommerce REST index, public (no auth, never 401)
 *  GET  /wp-json/wc/v3              route=namespace      wc/v3 namespace index, public (no auth, never 401)
 *  GET  /wp-json/wc/v3/system_status route=system_status minimal status, public (no auth, never 401)
 *  GET  /wp-json/wc/v3/<products|customers|coupons|...>  route=other  empty-list stubs for connector probes (keys required)
 *  GET  /?rest_route=/wc/v3/...     route=rest           plain-permalink form of every route above
 *  GET  /wp-json/wp/v2              route=wp_namespace   wp/v2 namespace index (public); other wp/v2 paths: users/me -> 401, rest -> 404
 *  any other /wp-json/wc/v3/*       route=other          WooCommerce-style 404 JSON
 *  GET/POST /wc-auth/v1/authorize  route=wc_auth   WooCommerce-style "authorize this app" page (app_name, scope, user_id,
 *                                   return_url, callback_url). The store owner approves with WC_AUTH_PASSWORD; the ck_/cs_ keys
 *                                   are then POSTed to callback_url as JSON, exactly like WooCommerce does, and the browser goes to return_url.
 *  CORS: every route answers OPTIONS preflight (204, no auth) and sends Access-Control-* headers.
 */
'use strict';

const crypto = require('crypto');
const b = require('../../../lib/wc-bridge');

const MAX_SCAN = 500;                    /* newest orders read per request; fine for a small store */
const MAX_ITEMS = 50;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-NIKORA-Bridge', '1');      /* proves a response came from this function and not from a Vercel-level block */
  res.setHeader('X-Content-Type-Options', 'nosniff');
  /* CORS: a browser-side connection test sends an OPTIONS preflight (never with credentials) before the real call */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With, X-WP-Nonce, X-HTTP-Method-Override');
  res.setHeader('Access-Control-Expose-Headers', 'X-WP-Total, X-WP-TotalPages, Link, Allow');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.setHeader('Allow', 'GET, POST, PUT, PATCH, OPTIONS'); return res.status(204).end(); }

  mapRestRoute(req);                                  /* ?rest_route=/wc/v3/... (sites with plain permalinks) */
  const route = String((req.query && req.query.route) || 'orders');
  if (route === 'wc_auth') {
    try { return await wcAuth(req, res); }
    catch (e) { console.error('[wc-auth]', e && e.message); return authPage(res, 500, 'Something went wrong', '<p>Please try again.</p>'); }
  }
  if (route !== 'orders') return discovery(req, res, route);

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
  if (!process.env.WC_CONSUMER_KEY || !process.env.WC_CONSUMER_SECRET) {
    console.error('[wc/v3/orders] WC_CONSUMER_KEY / WC_CONSUMER_SECRET are not set in Vercel');
    return b.wcError(res, 500, 'nikora_not_configured', 'The API keys are not configured on the server.');
  }
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


/* ------------------------------------------------------------------ /wc-auth/v1/authorize */
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function authPage(res, status, title, inner) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  const css = 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0B0E;color:#EDE9E0;font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px;box-sizing:border-box}'
    + '.card{width:100%;max-width:440px;padding:28px;border-radius:18px;border:1px solid rgba(200,155,84,.35);background:rgba(255,255,255,.05);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}'
    + 'h1{margin:0 0 6px;font-size:20px;color:#C89B54;letter-spacing:.02em}p{margin:8px 0;color:#CFC9BC;font-size:14px}.k{color:#C89B54}'
    + 'ul{margin:10px 0;padding-left:18px;font-size:14px;color:#CFC9BC}input[type=password]{width:100%;box-sizing:border-box;margin:10px 0;padding:12px;border-radius:10px;border:1px solid rgba(200,155,84,.4);background:rgba(0,0,0,.35);color:#EDE9E0;font-size:15px}'
    + 'button{cursor:pointer;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:600;border:1px solid rgba(200,155,84,.5);margin-right:8px}'
    + '.ok{background:#C89B54;color:#0B0B0E}.no{background:transparent;color:#C89B54}.err{color:#ff9d8a}';
  return res.status(status).send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'
    + esc(title) + ' - NIKORA</title><style>' + css + '</style></head><body><main class="card"><h1>' + esc(title) + '</h1>' + inner + '</main></body></html>');
}
function safeUrl(v, httpsOnly) {
  try {
    const u = new URL(String(v));
    if (u.username || u.password) return null;
    if (u.protocol === 'https:' || (!httpsOnly && u.protocol === 'http:')) return u;
  } catch (e) { /* invalid */ }
  return null;
}
function publicHost(u) {      /* the callback is called from our server: no localhost, internal names or IP literals */
  const h = u.hostname.toLowerCase();
  return h.indexOf('.') !== -1 && h.indexOf(':') === -1 && !/^\d+\.\d+\.\d+\.\d+$/.test(h) && !/\.(local|internal|localhost)$/.test(h) && h !== 'localhost';
}
function backTo(res, ret, params) {
  const u = new URL(ret);
  Object.keys(params).forEach((k) => u.searchParams.set(k, params[k]));
  res.setHeader('Location', u.toString());
  return res.status(302).end();
}

async function wcAuth(req, res) {
  if (['GET', 'HEAD', 'POST'].indexOf(req.method) === -1) { res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS'); return authPage(res, 405, 'Method not allowed', ''); }
  const src = req.method === 'POST' ? (parseBody(req) || {}) : (req.query || {});
  const p = {
    app_name: b.str(src.app_name, 100), scope: b.str(src.scope, 20) || 'read_write',
    user_id: b.str(src.user_id, 64).replace(/[^A-Za-z0-9_-]/g, ''), return_url: b.str(src.return_url, 500), callback_url: b.str(src.callback_url, 500)
  };
  if (!p.app_name && !p.callback_url && !p.return_url) {                     /* bare probe of the endpoint */
    return authPage(res, 200, 'WooCommerce authentication', '<p>This store accepts WooCommerce-style app authorization requests.</p>');
  }
  const cb = safeUrl(p.callback_url, true), ret = p.return_url ? safeUrl(p.return_url, false) : null;
  const errs = [];
  if (!p.app_name) errs.push('app_name is required');
  if (['read', 'write', 'read_write'].indexOf(p.scope) === -1) errs.push('scope must be read, write or read_write');
  if (!cb || !publicHost(cb)) errs.push('callback_url must be a public https URL');
  if (p.return_url && !ret) errs.push('return_url must be an http(s) URL');
  if (errs.length) return authPage(res, 400, 'Invalid request', '<ul class="err">' + errs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>');

  const hidden = ['app_name', 'scope', 'user_id', 'return_url', 'callback_url'].map((k) => '<input type="hidden" name="' + k + '" value="' + esc(p[k]) + '">').join('');
  const form = (note) => authPage(res, note ? 401 : 200, 'Authorize ' + p.app_name,
    '<p><span class="k">' + esc(p.app_name) + '</span> wants access to your NIKORA orders (<span class="k">' + esc(p.scope.replace('_', '/')) + '</span>).</p>'
    + '<p>Keys are sent to <span class="k">' + esc(cb.hostname) + '</span>.</p>' + (note ? '<p class="err">' + esc(note) + '</p>' : '')
    + '<form method="post" action="/wc-auth/v1/authorize">' + hidden
    + '<input type="password" name="password" placeholder="Store admin password" autocomplete="current-password" required>'
    + '<button class="ok" name="decision" value="approve" type="submit">Approve</button><button class="no" name="decision" value="deny" type="submit" formnovalidate>Deny</button></form>');

  if (req.method !== 'POST') return form('');

  if (String(src.decision) === 'deny') {
    return ret ? backTo(res, p.return_url, { success: '0', user_id: p.user_id }) : authPage(res, 200, 'Access denied', '<p>No keys were shared.</p>');
  }
  const adminPw = process.env.WC_AUTH_PASSWORD, ck = process.env.WC_CONSUMER_KEY, cs = process.env.WC_CONSUMER_SECRET;
  if (!adminPw || !ck || !cs) {
    console.error('[wc-auth] WC_AUTH_PASSWORD, WC_CONSUMER_KEY and WC_CONSUMER_SECRET must be set');
    return authPage(res, 503, 'Not configured', '<p>App authorization is not enabled on this store.</p>');
  }
  if (!b.safeEqual(String(src.password || ''), adminPw)) return form('Wrong password.');

  let r;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    r = await fetch(cb.toString(), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: ctl.signal, redirect: 'error',
      body: JSON.stringify({ key_id: 1, user_id: p.user_id, consumer_key: ck, consumer_secret: cs, key_permissions: p.scope })
    });
    clearTimeout(t);
  } catch (e) {
    console.error('[wc-auth] callback failed:', e && e.message);
    return authPage(res, 502, 'Could not reach the app', '<p>The app did not answer. Nothing was approved; please try again.</p>');
  }
  if (r.status >= 300) { console.error('[wc-auth] callback HTTP', r.status); return authPage(res, 502, 'The app rejected the keys', '<p>HTTP ' + esc(r.status) + ' from ' + esc(cb.hostname) + '.</p>'); }
  return ret ? backTo(res, p.return_url, { success: '1', user_id: p.user_id }) : authPage(res, 200, 'Connected', '<p>' + esc(p.app_name) + ' is now connected to your store.</p>');
}

/* ------------------------------------------------------------------ ?rest_route= support */
function mapRestRoute(req) {
  if (!req.query || String(req.query.route) !== 'rest') return;
  const rr = String(req.query.rr || '').replace(/^\/?(wp-json)?\/*/i, '').replace(/\/+$/, '');
  const q = Object.assign({}, req.query); delete q.rr;
  let m;
  if (rr === '') q.route = 'root';
  else if (rr === 'wc/v3') q.route = 'namespace';
  else if (rr === 'wp/v2') q.route = 'wp_namespace';
  else if (/^wp\/v2\//.test(rr)) { q.route = 'wp_other'; q.path = rr.replace(/^wp\/v2\//, ''); }
  else if (rr === 'wc/v3/system_status') q.route = 'system_status';
  else if (rr === 'wc/v3/orders') delete q.route;
  else if ((m = /^wc\/v3\/orders\/(\d+)$/.exec(rr))) { delete q.route; q.id = m[1]; }
  else { q.route = 'other'; q.path = rr.replace(/^wc\/v3\/?/, ''); }
  try { req.query = q; } catch (e) { Object.keys(q).forEach((k) => { req.query[k] = q[k]; }); }
}

/* Collections some connectors list during setup. We hold no WooCommerce catalog, so they are empty (keys still required). */
const EMPTY_COLLECTIONS = ['products', 'products/categories', 'products/tags', 'products/attributes', 'customers', 'coupons', 'webhooks', 'refunds', 'shipping/zones', 'payment_gateways'];

/* ------------------------------------------------------------------ discovery + system status */
/* Route table in the shape a real WordPress + WooCommerce site returns it: every route carries namespace, methods,
   endpoints[] (with args) and _links, because some connectors iterate over routes[*].endpoints. */
const CTX_ARG = { context: { description: 'Scope under which the request is made; determines fields present in response.', type: 'string', enum: ['view', 'embed', 'edit'], default: 'view', required: false } };
function routeMap(base) {
  const link = (path) => ({ self: [{ href: base + '/wp-json' + path }] });
  const ep = (methods, args) => ({ methods, args: Object.assign({}, args || {}) });
  const mk = (ns, path, endpoints, withLinks) => {
    const o = { namespace: ns, methods: Array.from(new Set([].concat.apply([], endpoints.map((e) => e.methods)))), endpoints };
    if (withLinks !== false) o._links = link(path);
    return o;
  };
  const nsArg = (ns) => Object.assign({ namespace: { default: ns, required: false } }, CTX_ARG);
  const listArgs = Object.assign({ page: { type: 'integer', default: 1 }, per_page: { type: 'integer', default: 10 }, status: { type: 'array', default: ['any'] }, after: { type: 'string' }, before: { type: 'string' }, modified_after: { type: 'string' }, order: { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, orderby: { type: 'string', default: 'date' }, supplier: { type: 'string' } }, CTX_ARG);
  const idArg = Object.assign({ id: { type: 'integer', required: false } }, CTX_ARG);
  const r = {
    '/': mk('', '/', [ep(['GET'], CTX_ARG)]),
    '/wp/v2': mk('wp/v2', '/wp/v2', [ep(['GET'], nsArg('wp/v2'))]),
    '/wc/v3': mk('wc/v3', '/wc/v3', [ep(['GET'], nsArg('wc/v3'))]),
    '/wc/v3/orders': mk('wc/v3', '/wc/v3/orders', [ep(['GET'], listArgs), ep(['POST'], {})]),
    '/wc/v3/orders/(?P<id>[\\d]+)': mk('wc/v3', '', [ep(['GET'], idArg), ep(['POST', 'PUT', 'PATCH'], idArg)], false),
    '/wc/v3/system_status': mk('wc/v3', '/wc/v3/system_status', [ep(['GET'], CTX_ARG)])
  };
  /* documented alias keys, same full shape */
  r['/wp-json/'] = mk('', '/', [ep(['GET'], CTX_ARG)]);
  r['/wp-json/wc/v3'] = mk('wc/v3', '/wc/v3', [ep(['GET'], nsArg('wc/v3'))]);
  r['/wp-json/wc/v3/orders'] = mk('wc/v3', '/wc/v3/orders', [ep(['GET'], listArgs), ep(['POST', 'PUT'], {})]);
  r['/wp-json/wc/v3/orders/<id>'] = mk('wc/v3', '/wc/v3/orders', [ep(['GET', 'PUT'], idArg)], false);
  return r;
}
function discovery(req, res, route) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return b.wcError(res, 405, 'rest_no_route', 'No route was found matching the URL and request method.');
  }
  const base = b.baseUrlOf(req);
  res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  res.setHeader('Link', '<' + base + '/wp-json/>; rel="https://api.w.org/"');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Allow', 'GET');

  if (route === 'root') {                                          /* public: no auth, never 401 */
    return res.status(200).json({
      name: 'NIKORA Store', description: 'K-Beauty Store',
      url: base, home: base, gmt_offset: '0', timezone_string: '',
      page_for_posts: 0, page_on_front: 0, show_on_front: 'posts',
      namespaces: ['wp/v2', 'wc/v3'],
      authentication: {},
      routes: routeMap(base),
      site_logo: 0, site_icon: 0, site_icon_url: '',
      _links: { help: [{ href: 'https://developer.wordpress.org/rest-api/' }] }
    });
  }
  if (route === 'wp_namespace') {                                  /* public */
    return res.status(200).json({ namespace: 'wp/v2', routes: { '/wp/v2': routeMap(base)['/wp/v2'] }, _links: { up: [{ href: base + '/wp-json/' }] } });
  }
  if (route === 'wp_other') {                                      /* WordPress core routes this bridge does not provide */
    const wpPath = String((req.query && req.query.path) || '').replace(/^\/+|\/+$/g, '');
    if (wpPath === 'users/me') return b.wcError(res, 401, 'rest_not_logged_in', 'You are not currently logged in.');
    return b.wcError(res, 404, 'rest_no_route', 'No route was found matching the URL and request method.');
  }
  if (route === 'namespace') {                                     /* public: no auth, never 401 */
    return res.status(200).json({
      namespace: 'wc/v3', routes: routeMap(base),
      _links: { up: [{ href: base + '/wp-json/' }] }
    });
  }
  if (route === 'system_status') {
    /* public probe: nothing sensitive in this object; order routes are the ones that enforce the ck_/cs_ keys */
    return res.status(200).json({
      environment: {
        home_url: base, site_url: base, store_id: 'nikora-store', version: '9.0.0', wp_version: '6.6.0', wp_multisite: false,
        wp_memory_limit: 268435456, wp_debug_mode: false, wp_cron: false, language: 'en_US',
        server_info: 'Vercel Serverless (NIKORA WooCommerce bridge)', php_version: '8.2.0', max_upload_size: 52428800,
        default_timezone: 'UTC', curl_version: '8.0.0', external_object_cache: null
      },
      database: { wc_database_version: '9.0.0', database_prefix: 'wp_', maxmind_geoip_database: '', database_tables: { woocommerce: {}, other: {} }, database_size: { data: 0, index: 0 } },
      active_plugins: [], inactive_plugins: [], dropins_mu_plugins: { dropins: [], mu_plugins: [] },
      theme: { name: 'NIKORA', version: '1.0.0', is_child_theme: false, has_woocommerce_support: true },
      settings: {
        api_enabled: true, force_ssl: true, currency: 'USD', currency_symbol: '$', currency_position: 'left',
        thousand_separator: ',', decimal_separator: '.', number_of_decimals: 2, geolocation_enabled: false,
        taxonomies: {}, product_visibility_terms: {}
      },
      security: { secure_connection: true, hide_errors: true },
      pages: [],
      _links: { self: [{ href: base + '/wp-json/wc/v3/system_status' }], collection: [{ href: base + '/wp-json/wc/v3/system_status' }] }
    });
  }
  if (route === 'other') {
    const path = String((req.query && req.query.path) || '').replace(/^\/+|\/+$/g, '');
    if (EMPTY_COLLECTIONS.indexOf(path) !== -1) {
      if (!b.authenticate(req)) return unauthorized(res, 'woocommerce_rest_cannot_view', 'Sorry, you cannot list resources.');
      res.setHeader('X-WP-Total', '0'); res.setHeader('X-WP-TotalPages', '1');
      return res.status(200).json([]);
    }
  }
  return b.wcError(res, 404, 'rest_no_route', 'No route was found matching the URL and request method.');
}
