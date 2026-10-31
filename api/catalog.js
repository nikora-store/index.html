/**
 * GET /api/catalog  -  read-only storefront view of lib/products.js (names, descriptions, prices, bestseller ranks, stock state).
 *
 * LIVE PRICES: every request first runs refreshLivePrices() so prices / promo flags / stock set in the admin panel (Firebase /products)
 * are applied before the answer is built (re-read at most every 5 s per warm instance), and the response is marked no-store so neither a
 * browser nor Vercel's CDN can serve an old copy. Before this, a cached answer kept showing the built-in default (e.g. $25.00).
 *
 * Lives at api/catalog.js (one Vercel function, not routed through api/router.js). If your existing file differs, keep your own ranking /
 * response shape and copy over just these three things: the refreshLivePrices() call, assertPublic(), and the Cache-Control header.
 */
'use strict';

const { refreshLivePrices, computeBestsellerRanking, buildStorefrontCatalog, assertPublic } = require('../lib/products');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); return res.status(405).json({ error: 'method-not-allowed' }); }

  await refreshLivePrices({ ttlMs: 5000 });                       // never throws: keeps the last known prices if Firebase is unreachable

  let sales = null;
  try { sales = await require('../lib/sales').loadSalesByProduct(); } catch (e) { console.warn('[catalog] sales unavailable, using the fallback ranking:', e && e.message); }
  const ranking = computeBestsellerRanking(sales && Object.keys(sales).length ? sales : null);

  const products = assertPublic(buildStorefrontCatalog(ranking), 'GET /api/catalog');   // throws instead of leaking supplier codes
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  return res.status(200).send(JSON.stringify({ source: ranking.source, updatedAt: Date.now(), products }));
};
