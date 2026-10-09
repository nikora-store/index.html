/**
 * lib/supplier.js: CJ Dropshipping integration.
 *
 * createCJOrder(orderData) turns a paid NIKORA order into a CJ order:
 *   1. mapCartToCJProducts() expands bundles into the exact CJ components (lib/products.js)
 *   2. exchanges CJ_API_KEY for a short-lived CJ access token (cached between calls)
 *   3. POSTs the order to CJ and resolves with the CJ order id
 * It NEVER throws: the customer has already paid, so a CJ problem is returned as { status: 'failed', error }
 * and recorded on /orders/{id}/fulfillment for you to fix and re-send, instead of failing the checkout.
 *
 * ENV
 *   CJ_API_KEY            required, from the CJ developer settings
 *   CJ_LOGISTIC_NAME      shipping line to use on CJ (as named in your CJ account)
 *   CJ_FROM_COUNTRY       warehouse country code, default CN
 *   CJ_CREATE_ORDER_PATH  default /shopping/order/createOrder. CJ also documents a newer
 *                         /shopping/order/createOrderV2: if CJ rejects the call, set the variable to that path.
 *   CJ_ACCESS_TOKEN       optional: a ready-made token (skips the key exchange)
 *
 * I could not call the live CJ API from here: send one real test order and compare the request fields with CJ's
 * current docs before relying on this.
 *
 * orderData = { orderId, customer: { name, email, phone, address: { line1, line2, city, state, postalCode, country } },
 *               items: [{ id, variant, quantity | qty }] }
 * Resolves { provider: 'cj', status: 'pushed' | 'failed', ref?, error? }
 */
'use strict';

const { timedFetch, clip, countryCode } = require('./common');
const { mapCartToCJProducts, hasPlaceholder } = require('./products');

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CJ_CREATE_ORDER_PATH = process.env.CJ_CREATE_ORDER_PATH || '/shopping/order/createOrder';

let tokenCache = { value: '', exp: 0 };
async function cjAccessToken() {
  if (process.env.CJ_ACCESS_TOKEN) return process.env.CJ_ACCESS_TOKEN;
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  if (!process.env.CJ_API_KEY) throw new Error('CJ_API_KEY is not set');
  const r = await timedFetch(CJ_BASE + '/authentication/getAccessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: process.env.CJ_API_KEY })
  }, 10000);
  const j = await r.json().catch(() => ({}));
  const t = j && j.data && j.data.accessToken;
  if (!r.ok || !t) throw new Error('CJ authentication failed: ' + clip(j && j.message, 120));
  tokenCache = { value: t, exp: Date.now() + 12 * 60 * 60 * 1000 };       // tokens last days; refresh well before that
  return t;
}

async function createCJOrder(orderData) {
  try {
    const a = orderData.customer.address;
    const cc = countryCode(a.country);
    if (!cc) throw new Error('Cannot map country "' + a.country + '" to an ISO country code');

    /* bundles -> exact CJ components, quantities scaled by the cart quantity */
    const products = mapCartToCJProducts(orderData.items);
    const unset = products.filter(hasPlaceholder);
    if (unset.length) throw new Error('CJ vid/sku not configured in lib/products.js for: ' + unset.map((p) => p.vid || p.sku).join(', '));

    const token = await cjAccessToken();
    const r = await timedFetch(CJ_BASE + CJ_CREATE_ORDER_PATH, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
      body: JSON.stringify({
        orderNumber: orderData.orderId,                                    // our NK-#### id, so CJ webhooks can be matched back
        shippingCountryCode: cc, shippingCountry: a.country,
        shippingProvince: a.state || a.city,                               // CJ requires a province; fall back to the city when the country has none
        shippingCity: a.city, shippingAddress: a.line1, shippingAddress2: a.line2 || '', shippingZip: a.postalCode || '',
        shippingCustomerName: orderData.customer.name, shippingPhone: orderData.customer.phone || '', email: orderData.customer.email,
        fromCountryCode: process.env.CJ_FROM_COUNTRY || 'CN',
        logisticName: process.env.CJ_LOGISTIC_NAME || '',
        remark: 'NIKORA ' + orderData.orderId,
        products: products.map((p) => (p.vid ? { vid: p.vid, quantity: p.quantity } : { sku: p.sku, quantity: p.quantity }))
      })
    }, 15000);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.result === false || j.success === false) throw new Error('CJ rejected the order: ' + clip(j && j.message, 200));
    const ref = j.data && (j.data.orderId || j.data.id);
    return { provider: 'cj', status: 'pushed', ref: ref ? String(ref) : '' };
  } catch (e) {
    console.error('createCJOrder failed for', orderData && orderData.orderId, e.message);
    return { provider: 'cj', status: 'failed', error: clip(e.message, 300) };
  }
}

module.exports = { createCJOrder };
