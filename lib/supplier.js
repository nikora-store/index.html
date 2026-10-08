/**
 * Supplier push adapters: CJ Dropshipping (direct API) or Shopify Admin API (the route Zendrop uses:
 * Zendrop fulfils orders that land in your connected Shopify store).
 *
 * ENV
 *   SUPPLIER               cj | shopify | zendrop (alias of shopify) | none   (default none = skip the push)
 *   SUPPLIER_SKU_MAP       optional JSON { "<product id>": "<supplier variant id>" }  (fallback when the
 *                          product has no cjVid / shopifyVariantId field in Firebase /products/{id})
 *   --- CJ ---
 *   CJ_API_KEY             CJ API key (or CJ_ACCESS_TOKEN to supply a ready token)
 *   CJ_LOGISTIC_NAME       shipping line name, e.g. the one your CJ account uses
 *   CJ_FROM_COUNTRY        warehouse country code (default CN)
 *   --- Shopify / Zendrop ---
 *   SHOPIFY_STORE_DOMAIN   your-store.myshopify.com
 *   SHOPIFY_ADMIN_TOKEN    Admin API access token (scope: write_orders)
 *
 * NOTE: I wrote these against the public docs from memory and could not call the live APIs from here.
 * Send one real test order and compare the request/response fields with the current CJ / Shopify docs.
 *
 * Every adapter resolves to { provider, status: 'pushed'|'skipped'|'failed', ref?, error? } and never throws,
 * so a supplier outage can never lose a paid order.
 */
'use strict';

const { timedFetch, clip } = require('./common');

const PROVIDER = String(process.env.SUPPLIER || (process.env.CJ_API_KEY ? 'cj' : 'none')).toLowerCase();   // CJ_API_KEY alone is enough to enable CJ
const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
// CJ's documented create-order endpoint is /shopping/order/createOrderV2. Override with CJ_CREATE_ORDER_PATH if your CJ account/docs say otherwise.
const CJ_CREATE_ORDER_PATH = process.env.CJ_CREATE_ORDER_PATH || '/shopping/order/createOrderV2';
const SHOPIFY_API_VERSION = '2024-10';

const COUNTRY = { 'united states': 'US', usa: 'US', 'united kingdom': 'GB', uk: 'GB', canada: 'CA', australia: 'AU', germany: 'DE', france: 'FR',
  spain: 'ES', italy: 'IT', netherlands: 'NL', poland: 'PL', ukraine: 'UA', ireland: 'IE', sweden: 'SE', norway: 'NO', denmark: 'DK',
  belgium: 'BE', austria: 'AT', switzerland: 'CH', portugal: 'PT', 'new zealand': 'NZ', israel: 'IL', 'united arab emirates': 'AE' };
function countryCode(v) {
  const s = String(v || '').trim();
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return COUNTRY[s.toLowerCase()] || '';
}

let skuMapEnv = null;
function envSkuMap() {
  if (skuMapEnv) return skuMapEnv;
  try { skuMapEnv = JSON.parse(process.env.SUPPLIER_SKU_MAP || '{}'); } catch (e) { skuMapEnv = {}; }
  return skuMapEnv;
}
async function variantFor(db, item, field) {
  const snap = await db.ref('products/' + item.id + '/' + field).once('value');
  const v = snap.val() || envSkuMap()[item.id];
  if (!v) throw new Error('No supplier variant for product ' + item.id + ' (set ' + field + ' in /products/' + item.id + ' or SUPPLIER_SKU_MAP)');
  return String(v);
}

/* ------------------------------- CJ Dropshipping ------------------------------- */
let cjToken = { value: '', exp: 0 };
async function cjAccessToken() {
  if (process.env.CJ_ACCESS_TOKEN) return process.env.CJ_ACCESS_TOKEN;
  if (cjToken.value && Date.now() < cjToken.exp) return cjToken.value;
  if (!process.env.CJ_API_KEY) throw new Error('CJ_API_KEY is not set');
  const r = await timedFetch(CJ_BASE + '/authentication/getAccessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: process.env.CJ_API_KEY })
  }, 10000);
  const j = await r.json().catch(() => ({}));
  const t = j && j.data && j.data.accessToken;
  if (!r.ok || !t) throw new Error('CJ auth failed: ' + clip(j && j.message, 120));
  cjToken = { value: t, exp: Date.now() + 12 * 60 * 60 * 1000 };       // CJ tokens last days; refresh well before that
  return t;
}
async function pushCJ(order, db) {
  const a = order.customer.address, cc = countryCode(a.country);
  if (!cc) throw new Error('Cannot map country "' + a.country + '" to an ISO code');
  const products = [];
  for (const it of order.items) products.push({ vid: await variantFor(db, it, 'cjVid'), quantity: it.qty });
  const token = await cjAccessToken();
  const r = await timedFetch(CJ_BASE + CJ_CREATE_ORDER_PATH, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body: JSON.stringify({
      orderNumber: order.orderId,                                    // our NK-#### id comes back on CJ webhooks
      shippingCountryCode: cc, shippingCountry: a.country,
      shippingProvince: a.state || a.city,                           // state from checkout; falls back to the city for countries without states
      shippingCity: a.city, shippingAddress: a.line1, shippingAddress2: a.line2, shippingZip: a.postalCode,
      shippingCustomerName: order.customer.name, shippingPhone: order.customer.phone || '', email: order.customer.email,
      fromCountryCode: process.env.CJ_FROM_COUNTRY || 'CN',
      logisticName: process.env.CJ_LOGISTIC_NAME || '',
      remark: 'NIKORA ' + order.orderId,
      products
    })
  }, 15000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.result === false || j.success === false) throw new Error('CJ rejected the order: ' + clip(j && j.message, 200));
  const ref = j.data && (j.data.orderId || j.data.id);
  return { provider: 'cj', status: 'pushed', ref: ref ? String(ref) : '' };
}

/* ------------------------------- Shopify (Zendrop) ------------------------------- */
async function pushShopify(order, db) {
  const domain = process.env.SHOPIFY_STORE_DOMAIN, token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!domain || !token) throw new Error('SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_TOKEN are not set');
  const a = order.customer.address, cc = countryCode(a.country);
  const line_items = [];
  for (const it of order.items) line_items.push({ variant_id: Number(await variantFor(db, it, 'shopifyVariantId')), quantity: it.qty, price: it.price.toFixed(2) });
  const first = order.customer.firstName || order.customer.name.split(' ')[0];
  const last = order.customer.lastName || order.customer.name.split(' ').slice(1).join(' ');
  const r = await timedFetch('https://' + domain + '/admin/api/' + SHOPIFY_API_VERSION + '/orders.json', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ order: {
      email: order.customer.email, line_items, financial_status: 'paid', send_receipt: false, send_fulfillment_receipt: false,
      note: 'NIKORA ' + order.orderId, tags: 'nikora,' + order.orderId,
      note_attributes: [{ name: 'nikora_order_id', value: order.orderId }],
      customer: { first_name: first, last_name: last, email: order.customer.email },
      shipping_address: { first_name: first, last_name: last, address1: a.line1, address2: a.line2, city: a.city, zip: a.postalCode,
                          country_code: cc || undefined, country: a.country, phone: order.customer.phone || undefined }
    } })
  }, 15000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.order) throw new Error('Shopify rejected the order: ' + clip(JSON.stringify(j && j.errors), 200));
  return { provider: 'shopify', status: 'pushed', ref: String(j.order.id) };
}

async function pushToSupplier(order, db) {
  if (PROVIDER === 'none' || !PROVIDER) return { provider: 'none', status: 'skipped' };
  try {
    const out = PROVIDER === 'cj' ? await pushCJ(order, db) : (PROVIDER === 'shopify' || PROVIDER === 'zendrop') ? await pushShopify(order, db) : null;
    if (!out) return { provider: PROVIDER, status: 'failed', error: 'Unknown SUPPLIER value' };
    if (out.ref) {   // lets the fulfilment webhook map the supplier's own order id back to NK-####
      await db.ref('fulfillmentIndex/' + out.provider + '_' + String(out.ref).replace(/[.#$\[\]\/]/g, '_')).set(order.orderId);
    }
    return out;
  } catch (e) {
    console.error('Supplier push failed for', order.orderId, e.message);
    return { provider: PROVIDER, status: 'failed', error: clip(e.message, 300) };
  }
}

module.exports = { pushToSupplier };
