/**
 * lib/wc-bridge.js
 * Shared helpers for the WooCommerce REST API v3 emulator (api/wc/v3/orders.js).
 * Lives outside /api on purpose, so it does not count as a Vercel Serverless Function.
 *
 * Environment variables (Vercel > Settings > Environment Variables):
 *   WC_CONSUMER_KEY / WC_CONSUMER_SECRET   ck_... / cs_... pair you type into K-Dropshipping (generate long random values)
 *   FIREBASE_SERVICE_ACCOUNT               the service-account JSON as one line (or base64 of it)
 *      -or- FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *   FIREBASE_DATABASE_URL                  optional, defaults to https://nikora-store-default-rtdb.firebaseio.com
 *   WC_DEFAULT_SUPPLIER                    optional, supplier for unmapped products (default "k-dropshipping")
 *   WC_DEFAULT_STATUS                      optional, status served when the poller sends none (default "processing")
 */
'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');

/* ------------------------------------------------------------------ constants */
const FREE_SHIPPING_FROM = 50.0;
const FLAT_SHIPPING = 4.99;
const SUPPLIERS = {
  'k-dropshipping': { name: 'K-Dropshipping', processing: [1, 3], transit: [7, 15] },
  'qksource':       { name: 'QKSource',       processing: [1, 3], transit: [3, 7]  }
};
const DEFAULT_SUPPLIER = process.env.WC_DEFAULT_SUPPLIER || 'k-dropshipping';

/* Catalog slug -> numeric WooCommerce product_id. Products 1-7 = K-Beauty (K-Dropshipping), 8-9 = devices (QKSource), 10 = bundle. */
const SLUG_TO_NUM = {
  'cosrx-snail-mucin': 1, 'anua-heartleaf-toner': 2, 'boj-relief-sun': 3, 'skin1004-centella-ampoule': 4,
  'laneige-lip-sleeping-mask': 5, 'biodance-collagen-mask': 6, 'roundlab-birch-cream': 7,
  'nikora-booster-wand': 8, 'nikora-cryo-globe': 9, 'nikora-glass-skin-bundle': 10
};
const NUM_TO_SUPPLIER = { 1: 'k-dropshipping', 2: 'k-dropshipping', 3: 'k-dropshipping', 4: 'k-dropshipping', 5: 'k-dropshipping', 6: 'k-dropshipping', 7: 'k-dropshipping', 8: 'qksource', 9: 'qksource' };

/* Product 10 (Glass Skin Bundle) is ALWAYS split into two package items, one per supplier.
   `share` divides the bundle price between the two items (the parts sum back to the bundle price exactly).
   ADJUST the shares and the SKUs (placeholders!) to your real supplier SKUs. */
const BUNDLE_SPLITS = {
  10: [
    { supplier: 'k-dropshipping', label: 'K-Beauty package', sku: 'NIKORA-BUNDLE-10-KBEAUTY', contents: ['cosrx-snail-mucin', 'skin1004-centella-ampoule', 'biodance-collagen-mask'], share: 0.4 },
    { supplier: 'qksource',       label: 'Beauty device package', sku: 'NIKORA-WAND-01', contents: ['nikora-booster-wand'], share: 0.6 }
  ]
};

const COUNTRY_CODES = {"United States":"US","Canada":"CA","United Kingdom":"GB","Ireland":"IE","Australia":"AU","New Zealand":"NZ","Germany":"DE","France":"FR","Spain":"ES","Italy":"IT","Netherlands":"NL","Belgium":"BE","Switzerland":"CH","Austria":"AT","Sweden":"SE","Norway":"NO","Denmark":"DK","Finland":"FI","Poland":"PL","Czechia":"CZ","Portugal":"PT","Greece":"GR","Romania":"RO","Hungary":"HU","Ukraine":"UA","Lithuania":"LT","Latvia":"LV","Estonia":"EE","United Arab Emirates":"AE","Saudi Arabia":"SA","Israel":"IL","Turkey":"TR","India":"IN","Japan":"JP","South Korea":"KR","Singapore":"SG","Hong Kong":"HK","Malaysia":"MY","Thailand":"TH","Philippines":"PH","Indonesia":"ID","Mexico":"MX","Brazil":"BR","Argentina":"AR","Chile":"CL","Colombia":"CO","South Africa":"ZA","Egypt":"EG"};
const PAID_STATES = ['paid', 'succeeded', 'captured', 'completed', 'complete', 'external', 'processing'];

/* ------------------------------------------------------------------ firebase */
function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    let credential;
    if (raw) {
      const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      const sa = JSON.parse(text);
      if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
      credential = admin.credential.cert(sa);
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else {
      throw new Error('firebase-credentials-missing');
    }
    admin.initializeApp({ credential, databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://nikora-store-default-rtdb.firebaseio.com' });
  }
  return admin.database();
}

/* ------------------------------------------------------------------ auth */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
/* WooCommerce style: HTTP Basic (consumer key : consumer secret), or ?consumer_key=&consumer_secret= over HTTPS. */
function authenticate(req) {
  const ck = process.env.WC_CONSUMER_KEY, cs = process.env.WC_CONSUMER_SECRET;
  if (!ck || !cs) return false;
  let user = '', pass = '';
  const h = req.headers.authorization || '';
  if (/^basic\s/i.test(h)) {
    const d = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8');
    const i = d.indexOf(':');
    user = i < 0 ? d : d.slice(0, i); pass = i < 0 ? '' : d.slice(i + 1);
  } else if (req.query && req.query.consumer_key) {
    user = String(req.query.consumer_key); pass = String(req.query.consumer_secret || '');
  }
  if (!user || !pass) return false;
  return (safeEqual(user, ck) & safeEqual(pass, cs)) === 1;
}

/* ------------------------------------------------------------------ small utils */
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const cents = (n) => Math.round((Number(n) || 0) * 100);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max || 200);
function toIso(v) {
  if (v == null || v === '') return new Date(0).toISOString();
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}
const wcDate = (iso) => iso.replace(/\.\d{3}Z$/, '').replace(/Z$/, '');   /* WooCommerce shows UTC dates without the Z */
function countryCode(v) {
  const s = str(v, 60);
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY_CODES[s] || s;
}
function shippingFor(subtotalAfterDiscount) { return cents(subtotalAfterDiscount) >= cents(FREE_SHIPPING_FROM) ? 0 : FLAT_SHIPPING; }

/* Numeric WooCommerce order id: the digits of #NK-1234 when present, otherwise a stable 9-digit number from the key. */
function wcIdFor(key, displayId) {
  const m = /^#?NK-?(\d{3,})$/i.exec(String(displayId || key || ''));
  if (m) return parseInt(m[1], 10);
  const h = crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 8);
  return 100000000 + (parseInt(h, 16) % 900000000);
}
function productNum(id) {
  const s = String(id == null ? '' : id).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return SLUG_TO_NUM[s] || 0;
}
function supplierOfNum(n) { return NUM_TO_SUPPLIER[n] || DEFAULT_SUPPLIER; }

/* ------------------------------------------------------------------ status mapping */
function toWcStatus(s) {
  switch (String(s || '').toLowerCase()) {
    case 'shipped': case 'delivered': case 'completed': return 'completed';
    case 'cancelled': case 'canceled': return 'cancelled';
    case 'refunded': return 'refunded';
    case 'failed': return 'failed';
    case 'on-hold': case 'on hold': return 'on-hold';
    case 'pending payment': case 'pending': return 'pending';
    default: return 'processing';
  }
}
function fromWcStatus(s, hasTracking) {
  switch (String(s || '').toLowerCase()) {
    case 'completed': return hasTracking ? 'Shipped' : 'Shipped';
    case 'cancelled': return 'Cancelled';
    case 'refunded': return 'Refunded';
    case 'failed': return 'Failed';
    case 'on-hold': return 'Processing';
    default: return 'Processing';
  }
}
function isPaid(o) {
  const p = o && o.payment;
  if (!p || !p.status) return true;            /* orders written by the paid pipeline carry no pending flag */
  return PAID_STATES.indexOf(String(p.status).toLowerCase()) !== -1;
}

/* ------------------------------------------------------------------ line items (bundle split lives here) */
function buildLineItems(order) {
  const out = [];
  let n = 0;
  const list = Array.isArray(order.items) ? order.items : Object.values(order.items || {});
  list.forEach((it) => {
    const qty = Math.max(1, parseInt(it.quantity != null ? it.quantity : it.qty, 10) || 1);
    const unit = Number(it.price) || 0;
    const lineTotalC = it.lineTotal != null ? cents(it.lineTotal) : cents(unit) * qty;
    const num = productNum(it.id);
    const split = BUNDLE_SPLITS[num];
    const base = (extra) => Object.assign({ id: ++n, name: str(it.title || it.name, 200), product_id: num, variation_id: 0, quantity: qty, tax_class: '', subtotal_tax: '0.00', total_tax: '0.00', taxes: [] }, extra);

    if (split) {
      let allocated = 0;
      split.forEach((part, idx) => {
        const last = idx === split.length - 1;
        const partC = last ? lineTotalC - allocated : Math.round(lineTotalC * part.share);
        allocated += partC;
        out.push(base({
          name: str(it.title || it.name, 160) + ' \u2013 ' + part.label,
          sku: part.sku,
          price: Math.round(partC / qty) / 100,
          subtotal: money(partC / 100), total: money(partC / 100),
          meta_data: [
            { id: 1, key: '_supplier', value: part.supplier },
            { id: 2, key: '_package', value: (idx + 1) + ' of ' + split.length },
            { id: 3, key: '_split_from_product_id', value: String(num) },
            { id: 4, key: '_package_contents', value: part.contents.join(', ') }
          ]
        }));
      });
    } else {
      out.push(base({
        sku: str(it.sku || it.supplierSku || '', 80),
        price: unit,
        subtotal: money(lineTotalC / 100), total: money(lineTotalC / 100),
        meta_data: [{ id: 1, key: '_supplier', value: supplierOfNum(num) }]
      }));
    }
  });
  return out;
}
const supplierOfLine = (li) => { const m = (li.meta_data || []).find((x) => x.key === '_supplier'); return m ? m.value : DEFAULT_SUPPLIER; };

/* ------------------------------------------------------------------ Firebase order -> WooCommerce v3 order */
function toWooOrder(key, o, baseUrl, opts) {
  opts = opts || {};
  const display = o.displayId || o.orderId || key;
  const id = wcIdFor(key, display);
  const c = o.customer || {};
  const a = c.address || {};
  const pr = o.pricing || {};
  const created = toIso(o.createdAt);
  const modified = toIso(o.updatedAt || o.shippedAt || o.createdAt);
  const status = toWcStatus(o.status);

  let lines = buildLineItems(o);
  if (opts.supplier && opts.supplier !== 'all') lines = lines.filter((li) => supplierOfLine(li) === opts.supplier);

  const person = {
    first_name: str(c.firstName || (c.name || '').split(' ')[0], 80),
    last_name: str(c.lastName || (c.name || '').split(' ').slice(1).join(' '), 80),
    company: '',
    address_1: str(a.line1, 200), address_2: str(a.line2, 200), city: str(a.city, 100), state: str(a.state, 100),
    postcode: str(a.postalCode, 20), country: countryCode(a.country || 'US')
  };
  const shipTotal = money(pr.shipping);
  const shipLabel = pr.shippingLabel || (Number(pr.shipping) > 0 ? 'Express Shipping (flat rate)' : 'Free Express Shipping');
  const suppliersInOrder = Array.from(new Set(buildLineItems(o).map(supplierOfLine)));
  const packages = suppliersInOrder.map((s) => ({ supplier: s, name: (SUPPLIERS[s] || {}).name || s, processing_business_days: (SUPPLIERS[s] || {}).processing, transit_business_days: (SUPPLIERS[s] || {}).transit }));
  const meta = [
    { id: 1, key: '_nikora_order_id', value: String(display) },
    { id: 2, key: '_nikora_firebase_key', value: String(key) },
    { id: 3, key: '_nikora_packages', value: packages }
  ];
  if (o.trackingNumber) meta.push({ id: 4, key: '_tracking_number', value: String(o.trackingNumber) });
  if (o.carrier) meta.push({ id: 5, key: '_tracking_carrier', value: String(o.carrier) });

  const pay = o.payment || {};
  const discount = Number(pr.discount) || 0;
  return {
    id, parent_id: 0, number: String(id),
    order_key: 'wc_order_' + crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 13),
    created_via: o.source || 'checkout', version: '9.0.0', status, currency: o.currency || 'USD',
    date_created: wcDate(created), date_created_gmt: wcDate(created),
    date_modified: wcDate(modified), date_modified_gmt: wcDate(modified),
    discount_total: money(discount), discount_tax: '0.00',
    shipping_total: shipTotal, shipping_tax: '0.00',
    cart_tax: money(pr.tax), total: money(o.total), total_tax: money(pr.tax),
    prices_include_tax: false, customer_id: 0, customer_ip_address: '', customer_user_agent: '',
    customer_note: str(o.notes, 500),
    billing: Object.assign({}, o.billing && typeof o.billing === 'object' ? o.billing : person, { email: str(c.email, 120), phone: str(c.phone, 40) }),
    shipping: Object.assign({}, person, { phone: str(c.phone, 40) }),
    payment_method: str(pay.method || 'stripe', 40), payment_method_title: str(pay.title || pay.method || 'Card', 80),
    transaction_id: str(pay.transactionId || pay.paymentIntentId || pay.id || '', 80),
    date_paid: wcDate(created), date_paid_gmt: wcDate(created),
    date_completed: o.shippedAt ? wcDate(toIso(o.shippedAt)) : null, date_completed_gmt: o.shippedAt ? wcDate(toIso(o.shippedAt)) : null,
    cart_hash: '', set_paid: true, meta_data: meta,
    line_items: lines, tax_lines: [],
    shipping_lines: [{ id: 1, method_title: shipLabel, method_id: Number(pr.shipping) > 0 ? 'flat_rate' : 'free_shipping', instance_id: '0', total: shipTotal, total_tax: '0.00', taxes: [], meta_data: [] }],
    fee_lines: [],
    coupon_lines: pr.promoCode ? [{ id: 1, code: String(pr.promoCode).toLowerCase(), discount: money(discount), discount_tax: '0.00', meta_data: [] }] : [],
    refunds: [],
    _links: { self: [{ href: baseUrl + '/wp-json/wc/v3/orders/' + id }], collection: [{ href: baseUrl + '/wp-json/wc/v3/orders' }] }
  };
}

/* ------------------------------------------------------------------ errors */
function wcError(res, status, code, message) {
  res.status(status).json({ code, message, data: { status } });
}
function baseUrlOf(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'nikora-store.vercel.app';
  return 'https://' + host;
}

module.exports = {
  getDb, authenticate, safeEqual, money, cents, str, toIso, countryCode, shippingFor, wcIdFor, productNum, supplierOfNum,
  toWcStatus, fromWcStatus, isPaid, buildLineItems, supplierOfLine, toWooOrder, wcError, baseUrlOf,
  FREE_SHIPPING_FROM, FLAT_SHIPPING, SUPPLIERS, BUNDLE_SPLITS, DEFAULT_SUPPLIER
};
