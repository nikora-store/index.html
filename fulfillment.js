/**
 * POST /api/webhooks/fulfillment   (Vercel Serverless Function, Node 18+)
 * https://nikora-store.vercel.app/api/webhooks/fulfillment
 * ---------------------------------------------------------------------------------------------
 * Receives the "order shipped" webhook from CJ Dropshipping / Zendrop (via Shopify) and then:
 *   1. authenticates the call and extracts orderId (#NK-####), carrier and trackingNumber
 *   2. updates /orders/{orderId}   status "Shipped", trackingNumber, carrier, shippedAt
 *      and the public mirror /tracking/{orderId}, which makes track-order.html flip to "Shipped" live
 *   3. calls /api/send-email with type SHIPPING_TRACKING ("Your Order Has Shipped!")
 * A payload whose status says "delivered" marks the order Delivered (no email).
 *
 * AUTH (fails closed): configure at least one
 *   FULFILLMENT_WEBHOOK_SECRET   shared secret; the supplier must send it as header  x-webhook-secret: <secret>
 *                                (or add ?secret=<secret> to the webhook URL if the supplier cannot set headers)
 *   SHOPIFY_WEBHOOK_SECRET       verifies Shopify's X-Shopify-Hmac-Sha256 signature (use this for Zendrop/Shopify)
 * ENV also needed: FIREBASE_SERVICE_ACCOUNT, EMAIL_ADMIN_SECRET (same value as in /api/send-email), SITE_URL
 *
 * Supplier payload field names differ and I could not test live webhooks, so the extractor accepts the common
 * spellings (see FIELDS). Send one real test shipment and check the Vercel logs; add a key to FIELDS if needed.
 * Status codes: 200 handled, 400 bad payload, 401 unauthorized, 404 unknown order, 502 email failed (the supplier retries;
 * retries are safe because the DB update is idempotent and send-email sends each tracking code only once).
 */
'use strict';

const crypto = require('crypto');
const { SITE_URL, getDb, clip, safeEq, parseOrderId, maskEmail, reply, timedFetch } = require('../../lib/common');

const FIELDS = {
  order:   ['orderId', 'order_id', 'orderNumber', 'order_number', 'externalOrderId', 'external_order_id', 'data.orderNumber', 'data.orderId', 'order.orderNumber', 'order.name', 'name', 'note'],
  carrier: ['carrier', 'logisticName', 'logistic_name', 'logisticsName', 'tracking_company', 'shipping_carrier', 'data.logisticName', 'data.carrier', 'fulfillment.tracking_company'],
  track:   ['trackingNumber', 'tracking_number', 'trackNumber', 'trackingCode', 'tracking_code', 'tracking_numbers.0', 'data.trackNumber', 'data.trackingNumber', 'fulfillment.tracking_number'],
  status:  ['status', 'event', 'type', 'logisticsStatus', 'shipment_status', 'shipping_status', 'data.status']
};

function get(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function pick(obj, keys) {
  for (const k of keys) { const v = get(obj, k); if (v !== undefined && v !== null && String(v).trim() !== '') return v; }
  return undefined;
}
async function readRaw(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1024 * 1024) throw new Error('payload too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}

function authorised(req, raw) {
  const shared = process.env.FULFILLMENT_WEBHOOK_SECRET, shopify = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!shared && !shopify) return null;                                     // nothing configured: refuse everything
  if (shared) {
    const url = new URL(req.url, 'https://x');
    const given = String(req.headers['x-webhook-secret'] || url.searchParams.get('secret') || '');
    if (given && safeEq(given, shared)) return true;
  }
  const sig = req.headers['x-shopify-hmac-sha256'];
  if (shopify && sig) {
    const mac = crypto.createHmac('sha256', shopify).update(raw).digest('base64');
    return safeEq(String(sig), mac);
  }
  return false;
}

async function resolveOrderId(db, payload, rawText) {
  for (const k of FIELDS.order) {                                           // 1) one of our own NK-#### values
    const v = get(payload, k);
    const m = v == null ? null : /NK-\d{4}/i.exec(String(v));
    if (m) return parseOrderId(m[0]);
  }
  for (const k of ['order_id', 'orderId', 'data.orderId', 'id']) {          // 2) the supplier's own order id we stored at push time
    const v = get(payload, k);
    if (v == null) continue;
    const key = String(v).replace(/[.#$\[\]\/]/g, '_');
    for (const p of ['shopify', 'cj']) {
      const hit = (await db.ref('fulfillmentIndex/' + p + '_' + key).once('value')).val();
      if (hit) return parseOrderId(hit);
    }
  }
  const m = /NK-\d{4}/i.exec(rawText);                                      // 3) last resort: our id anywhere in the body (notes, tags)
  return m ? parseOrderId(m[0]) : null;
}

async function sendShippingEmail(order, orderId, carrier, trackingNumber, shippedAt) {
  const secret = process.env.EMAIL_ADMIN_SECRET;
  if (!secret) throw new Error('EMAIL_ADMIN_SECRET is not set');
  const r = await timedFetch(SITE_URL + '/api/send-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
    body: JSON.stringify({ type: 'SHIPPING_TRACKING', orderData: {
      orderId,
      customer: { name: order.customer.name, email: order.customer.email, address: order.customer.address },
      shipping: { carrier, trackingCode: trackingNumber, trackingUrl: 'https://www.17track.net/en/track?nums=' + encodeURIComponent(trackingNumber), shippedAt }
    } })
  }, 20000);
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch (e) { /* ignore */ } throw new Error('send-email HTTP ' + r.status + ' ' + (m || '')); }
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { ok: false, error: 'Method not allowed.' }); }

  let raw;
  try { raw = await readRaw(req); } catch (e) { return reply(res, 413, { ok: false, error: 'Payload too large.' }); }
  const auth = authorised(req, raw);
  if (auth === null) { console.error('fulfillment webhook: no FULFILLMENT_WEBHOOK_SECRET / SHOPIFY_WEBHOOK_SECRET configured'); return reply(res, 503, { ok: false, error: 'Webhook is not configured.' }); }
  if (!auth) return reply(res, 401, { ok: false, error: 'Unauthorized.' });

  const rawText = raw.toString('utf8');
  let payload; try { payload = JSON.parse(rawText); } catch (e) { return reply(res, 400, { ok: false, error: 'Body must be JSON.' }); }
  if (!payload || typeof payload !== 'object') return reply(res, 400, { ok: false, error: 'Body must be a JSON object.' });

  let db;
  try { db = getDb(); } catch (e) { console.error('Firebase admin init failed:', e.message); return reply(res, 500, { ok: false, error: 'Not configured.' }); }

  try {
    const orderId = await resolveOrderId(db, payload, rawText);
    const carrier = clip(pick(payload, FIELDS.carrier), 60);
    const trackingNumber = String(pick(payload, FIELDS.track) || '').replace(/[^A-Za-z0-9\-_.]/g, '').slice(0, 64);
    const statusText = String(pick(payload, FIELDS.status) || '').toLowerCase();
    const delivered = /deliver/.test(statusText) && !/out.?for|undeliver|not.?deliver|fail/.test(statusText);

    if (!orderId) return reply(res, 400, { ok: false, error: 'No NIKORA order id (NK-####) found in the payload.' });
    const order = (await db.ref('orders/' + orderId).once('value')).val();
    if (!order) return reply(res, 404, { ok: false, error: 'Unknown order.' });

    const now = Date.now(), upd = {};
    const set = (k, v) => { upd['orders/' + orderId + '/' + k] = v; upd['tracking/' + orderId + '/' + k] = v; };

    if (delivered) {
      set('status', 'Delivered'); upd['tracking/' + orderId + '/step'] = 3; set('deliveredAt', now);
      if (trackingNumber && !order.trackingNumber) { set('trackingNumber', trackingNumber); if (carrier) set('carrier', carrier); }
      await db.ref().update(upd);
      console.log('Delivered', orderId);
      return reply(res, 200, { ok: true, orderId, status: 'Delivered' });
    }

    if (!trackingNumber || trackingNumber.length < 6) return reply(res, 400, { ok: false, error: 'No tracking number found in the payload.' });
    if (!carrier) return reply(res, 400, { ok: false, error: 'No carrier found in the payload.' });
    if (order.status === 'Delivered') return reply(res, 200, { ok: true, orderId, ignored: 'already-delivered' });

    const sameShipment = order.status === 'Shipped' && order.trackingNumber === trackingNumber;
    const shippedAt = sameShipment && order.shippedAt ? order.shippedAt : now;      // retries keep the original time
    set('status', 'Shipped'); upd['tracking/' + orderId + '/step'] = 2;
    set('trackingNumber', trackingNumber); set('carrier', carrier); set('shippedAt', shippedAt);
    await db.ref().update(upd);

    await sendShippingEmail(order, orderId, carrier, trackingNumber, shippedAt);    // throws on failure -> 502 -> supplier retries
    console.log('Shipped', orderId, carrier, maskEmail(order.customer.email));
    return reply(res, 200, { ok: true, orderId, status: 'Shipped', trackingNumber, carrier });
  } catch (e) {
    console.error('fulfillment webhook failed:', e.message);
    return reply(res, 502, { ok: false, error: 'Processing failed; please retry.' });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };       // we need the raw bytes for HMAC verification
