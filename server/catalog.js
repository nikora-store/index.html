/**
 * GET /api/catalog
 * Public, read-only storefront view of the catalog. Names, prices and galleries come from lib/products.js.
 * Bestseller rank / flags come from THIS STORE'S OWN SALES (Firebase /orders via lib/sales.js); the CJ table in
 * lib/products.js is used only when there are no countable sales yet or the orders lookup fails.
 * Uses toStorefrontProduct(), so CJ vid / sku / cjItems never leave the server, and exact unit counts are not exposed.
 */
'use strict';
const { buildStorefrontCatalog, computeBestsellerRanking } = require('../lib/products');
const { loadSalesByProduct } = require('../lib/sales');

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  let sales = null;
  try {
    sales = await loadSalesByProduct();
  } catch (err) {
    console.error('catalog: sales lookup failed, using the fallback ranking:', err && err.message);
  }
  const ranking = computeBestsellerRanking(sales);
  const products = buildStorefrontCatalog(ranking).map((p) => { delete p.salesCount; return p; });
  // CDN caches for 60 s and serves a stale copy for up to 5 min while refreshing.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ source: ranking.source, products });
};
