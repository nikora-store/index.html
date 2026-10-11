/**
 * GET /api/catalog
 * Public, read-only storefront view of lib/products.js (the single source of truth for ranks, names, prices, galleries).
 * Uses toStorefrontProduct(), so CJ vid / sku / cjItems never leave the server.
 */
'use strict';
const { listProductsByRank, toStorefrontProduct } = require('../lib/products');

module.exports = (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // CDN caches for 60 s and serves a stale copy for up to 5 min while refreshing, so a re-rank shows up within ~1 minute of a deploy.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ products: listProductsByRank().map(toStorefrontProduct) });
};
