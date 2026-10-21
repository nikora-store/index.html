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
 *
 * TWO REPORTS, ONE ORDER FILTER (so they can never disagree):
 *   aggregateSales / loadSalesByProduct       { [productId]: { units, orders } }  PUBLIC-SAFE: product ids and counts only. Feeds
 *                                             computeBestsellerRanking() (lib/products.js), which publishes salesCount / ranks.
 *   aggregateSupplierDemand / loadSupplierDemand   what to buy from each supplier: bundles expanded to their components and every line
 *                                             mapped to supplier + supplierSku / vid / supplierProductId exactly as lib/supplier.js sends it.
 *                                             PRIVATE: contains supplier codes. Use it in server code or an authenticated admin endpoint only,
 *                                             never in a public API response and never write it to /products.
 * Product ids in orders are normalised with getProduct(): legacy ids ("1".."10") and slugs ("cosrx-snail-mucin") count as the SAME product.
 */
'use strict';
const { getProduct, mapCartToCJProducts } = require('./products');

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

/** Pure: the counted orders as { order, lines: [{ id (canonical slug), variant, qty }] }. Applies status / window / unknown-id rules once. */
function countedOrders(orders, opts) {
  const o = opts || {};
  const now = o.now != null ? o.now : Date.now();
  const days = o.days != null ? o.days : SALES_WINDOW_DAYS;
  const cutoff = days > 0 ? now - days * 86400000 : null;
  const out = [];
  for (const order of Object.values(orders || {})) {
    if (!order || typeof order !== 'object') continue;
    const status = String(order.status || '');
    if (EXCLUDED_STATUS.test(status)) continue;
    if (o.status instanceof RegExp && !o.status.test(status)) continue;     // e.g. /processing/i for "still to be ordered from the supplier"
    const created = toMillis(order.createdAt);
    if (cutoff !== null && created !== null && created < cutoff) continue;
    const lines = [];
    for (const it of itemsOf(order)) {
      if (!it) continue;
      const raw = it.id != null ? it.id : (it.productId != null ? it.productId : it.product_id);
      const p = raw != null ? getProduct(String(raw)) : null;
      if (!p) continue;                                                    // unknown / legacy ids are ignored
      const q = Math.floor(Number(it.quantity != null ? it.quantity : it.qty));
      lines.push({ id: p.id, variant: it.variant || it.variantId || undefined, qty: q >= 1 ? q : 1 });
    }
    if (lines.length) out.push({ order, lines });
  }
  return out;
}

/**
 * Pure: turns the /orders object into { [productId]: { units, orders } } keyed by the canonical product id (slug).
 * `units` = quantity summed over counted orders; `orders` = number of distinct orders containing the product.
 */
function aggregateSales(orders, opts) {
  const out = {};
  for (const { lines } of countedOrders(orders, opts)) {
    const seenInOrder = {};
    for (const l of lines) {
      const row = out[l.id] || (out[l.id] = { units: 0, orders: 0 });
      row.units += l.qty;
      if (!seenInOrder[l.id]) { seenInOrder[l.id] = true; row.orders += 1; }
    }
  }
  return out;
}

/**
 * Pure, PRIVATE: what the counted orders require from each supplier.
 * Result: { items: [{ supplier, productId, sku, vid, externalId, units, orders }], skipped: [orderKey ...] }
 * Uses mapCartToCJProducts() (the same expansion lib/supplier.js uses), so bundle components and variant SKUs always match what is ordered.
 * A line that cannot be mapped (unknown variant ...) is left out and its order is listed in `skipped`; the order's other lines still count.
 */
function aggregateSupplierDemand(orders, opts) {
  const rows = new Map(), skipped = [];
  const entries = Object.entries(orders || {});
  const keyOf = new Map(entries.map(([k, v]) => [v, k]));
  for (const { order, lines } of countedOrders(orders, opts)) {
    const seen = new Set(); let bad = false;
    for (const l of lines) {
      let mapped;
      try { mapped = mapCartToCJProducts([{ id: l.id, variant: l.variant, quantity: l.qty }]); }    // line by line: one bad line must not hide the rest of the order
      catch (e) { bad = true; continue; }
      for (const m of mapped) {
        const key = m.supplier + '|' + (m.vid || m.sku);
        const row = rows.get(key) || { supplier: m.supplier, productId: m.productId, sku: m.sku, vid: m.vid, externalId: m.externalId, units: 0, orders: 0 };
        row.units += m.quantity;
        if (!seen.has(key)) { seen.add(key); row.orders += 1; }
        rows.set(key, row);
      }
    }
    if (bad) skipped.push(String(order.orderId || keyOf.get(order) || '?'));
  }
  return { items: Array.from(rows.values()).sort((a, b) => a.supplier.localeCompare(b.supplier) || b.units - a.units), skipped };
}

let cache = null;
/** One cached read of /orders shared by both reports. Throws if Firebase is unreachable; callers decide the fallback. */
async function readOrders() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache;
  const { getDb } = require('./common');
  const snap = await getDb().ref('orders').once('value');
  cache = { at: now, orders: snap.val() || {}, sales: null, demand: null };
  return cache;
}

/** Public-safe sales counts per product id (default options are cached; custom opts are computed fresh from the cached orders). */
async function loadSalesByProduct(opts) {
  const c = await readOrders();
  if (opts) return aggregateSales(c.orders, Object.assign({ now: Date.now() }, opts));
  return c.sales || (c.sales = aggregateSales(c.orders, { now: Date.now() }));
}

/** PRIVATE supplier purchasing report (see aggregateSupplierDemand). Server / authenticated admin use only. */
async function loadSupplierDemand(opts) {
  const c = await readOrders();
  if (opts) return aggregateSupplierDemand(c.orders, Object.assign({ now: Date.now() }, opts));
  return c.demand || (c.demand = aggregateSupplierDemand(c.orders, { now: Date.now() }));
}

module.exports = { aggregateSales, aggregateSupplierDemand, loadSalesByProduct, loadSupplierDemand, SALES_WINDOW_DAYS };
