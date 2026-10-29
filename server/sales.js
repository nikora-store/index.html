/**
 * lib/sales.js: this store's own sales statistics, read from Firebase /orders.
 * Feeds computeBestsellerRanking() in lib/products.js (CJ stats are only the fallback when this returns nothing).
 *
 * ASSUMED ORDER SHAPE (adjust ITEM_KEYS / the field readers below if api/orders/create.js stores it differently):
 *   /orders/{orderId} = { status, createdAt, items: [ { id, quantity | qty, ... } ] }
 *   - `items` may also be called `cart` or `lineItems`, and may be a Firebase object instead of an array
 *   - an item's product id may be `id`, `productId` or `product_id`; it must be an id from PRODUCTS_CATALOG ("1".."11")
 *   - createdAt may be epoch ms / seconds or an ISO string; orders without a readable date are counted
 * Orders whose status matches EXCLUDED_STATUS (cancelled, refunded, failed, ...) are not counted.
 */
'use strict';
const { getProduct } = require('./products');

const SALES_WINDOW_DAYS = 90;                         // only orders from the last N days count; 0 = all time
const CACHE_TTL_MS = 5 * 60 * 1000;                   // orders are re-read at most every 5 minutes per warm server instance
const ITEM_KEYS = ['items', 'cart', 'lineItems'];
const EXCLUDED_STATUS = /cancel|refund|fail|void|declin|chargeback/i;

function toMillis(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e11 ? v * 1000 : v;          // seconds -> ms
  const n = Number(v);
  if (isFinite(n)) return n < 1e11 ? n * 1000 : n;
  const t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}

function itemsOf(order) {
  for (const k of ITEM_KEYS) {
    const v = order[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
  }
  return [];
}

/**
 * Pure: turns the /orders object into { [productId]: { units, orders } }.
 * `units` = quantity summed over counted orders; `orders` = number of distinct orders containing the product.
 */
function aggregateSales(orders, opts) {
  const o = opts || {};
  const now = o.now != null ? o.now : Date.now();
  const days = o.days != null ? o.days : SALES_WINDOW_DAYS;
  const cutoff = days > 0 ? now - days * 86400000 : null;
  const out = {};
  for (const order of Object.values(orders || {})) {
    if (!order || typeof order !== 'object') continue;
    if (EXCLUDED_STATUS.test(String(order.status || ''))) continue;
    const created = toMillis(order.createdAt);
    if (cutoff !== null && created !== null && created < cutoff) continue;
    const seenInOrder = {};
    for (const it of itemsOf(order)) {
      if (!it) continue;
      const id = String(it.id != null ? it.id : (it.productId != null ? it.productId : it.product_id));
      if (!getProduct(id)) continue;                                   // unknown / legacy ids are ignored
      const q = Math.floor(Number(it.quantity != null ? it.quantity : it.qty));
      const qty = q >= 1 ? q : 1;
      const row = out[id] || (out[id] = { units: 0, orders: 0 });
      row.units += qty;
      if (!seenInOrder[id]) { seenInOrder[id] = true; row.orders += 1; }
    }
  }
  return out;
}

let cache = null;
/** Reads /orders from Firebase (cached). Throws if Firebase is unreachable; callers decide the fallback. */
async function loadSalesByProduct(opts) {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  const { getDb } = require('./common');
  const snap = await getDb().ref('orders').once('value');
  const value = aggregateSales(snap.val() || {}, Object.assign({ now }, opts));
  cache = { at: now, value };
  return value;
}

module.exports = { aggregateSales, loadSalesByProduct, SALES_WINDOW_DAYS };
