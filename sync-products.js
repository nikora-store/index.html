#!/usr/bin/env node
/**
 * scripts/sync-products.js - replaces Firebase Realtime Database /products with the official catalog from lib/products.js.
 *
 *   node scripts/sync-products.js                       dry run: prints what would be written and deleted
 *   node scripts/sync-products.js --write               applies it as ONE atomic multi-path update
 *   node scripts/sync-products.js --write --replace-all also removes every product that is not one of the official 10
 *
 * Default (without --replace-all): the official products are overwritten and the old gadget catalog is removed;
 * products you added yourself in the admin panel are left untouched.
 *
 * Needs the same environment as the API functions: FIREBASE_SERVICE_ACCOUNT (+ FIREBASE_DB_URL). Run it from the project root.
 * /products is publicly readable, so supplier bar codes / SKUs are never written to it (they stay in lib/products.js).
 * Keep SEED_VERSION equal to SEED_VERSION in nikora-admin/index.html.
 * NOTE: this resets prices and promo settings of products 1-10 to the defaults in lib/products.js. Prices you changed in the admin panel are replaced.
 */
'use strict';

const common = require('../lib/common');
const lib = require('../lib/products');

const SEED_VERSION = 'lib-products-v3';
const LEGACY_NAMES = ['NIKORA RED Light & EMS Facial Wand 4-in-1', '3D EMS Gua Sha Sculptor', 'Hydro-Vacuum Pore Cleaner', 'LED Therapy Mask 7-in-1 Pro',
  'EMS Body Sculptor RF', 'Sonic Eye Massager', 'Ultrasonic Skin Scrubber', 'Thermal Neck & Face Massager', 'Cryo Ice Roller', 'RF Anti-Aging Device',
  'NIKORA Ultimate Glow Ritual Set (Full Gadget Bundle)'];

/** The 10 official products in the shape the storefront and the admin panel read, keyed by storefront id. */
function buildRecords() {
  const sf = lib.buildStorefrontCatalog(lib.computeBestsellerRanking(null));
  const now = Date.now();
  const records = {};
  for (const r of sf) {
    const rec = {
      id: /^\d+$/.test(String(r.id)) ? Number(r.id) : r.id, slug: r.slug,
      name: r.name, title: r.name, brand: r.brand, category: r.category,
      price: r.price, oldPrice: r.oldPrice, originalPrice: r.oldPrice, promoEnabled: r.oldPrice != null && r.oldPrice > r.price, promoOriginalPrice: r.oldPrice,
      discountPercent: r.oldPrice > r.price ? Math.round((1 - r.price / r.oldPrice) * 100) : null, desc: r.desc, tags: r.tags,
      bestseller: !!r.bestseller, isBestseller: !!r.bestseller, bestsellerRank: r.bestsellerRank, bestsellerLabel: r.bestsellerLabel,
      lowStock: false, images: r.images, img: r.img, image: r.img, seedVersion: SEED_VERSION, updatedAt: now
    };
    if (Object.keys(rec).some((k) => /supplier|sku|vid|barcode/i.test(k))) throw new Error('Refusing to publish supplier fields to /products');
    records[String(r.id)] = rec;
  }
  if (Object.keys(records).length !== lib.PRODUCTS.length) throw new Error('Catalog build produced the wrong number of products');
  return records;
}

/** What to write and what to delete, given the current /products value. */
function plan(records, current, replaceAll) {
  const updates = {}, deletes = [];
  for (const k of Object.keys(records)) updates['products/' + k] = records[k];
  for (const k of Object.keys(current || {})) {
    if (records[k]) continue;
    const p = current[k];
    const isProduct = p && typeof p === 'object' && typeof p.name === 'string';       // other nodes under /products (overrides, settings) are never touched
    const legacy = isProduct && LEGACY_NAMES.indexOf(p.name) !== -1;
    if (legacy || (replaceAll && isProduct)) { updates['products/' + k] = null; deletes.push(k); }
  }
  return { updates, deletes };
}

async function run(argv) {
  const write = argv.includes('--write'), replaceAll = argv.includes('--replace-all');
  const records = buildRecords();
  let current = null;
  try { current = (await common.getDb().ref('products').once('value')).val() || {}; }
  catch (e) { console.warn('Could not read /products (' + e.message + '). Showing the products that would be written only.'); }

  const { updates, deletes } = plan(records, current, replaceAll);
  console.log((write ? 'WRITING' : 'DRY RUN') + ': ' + Object.keys(records).length + ' official products' + (deletes.length ? ', removing ' + deletes.length + ' old item(s)' : ''));
  for (const k of Object.keys(records)) {
    const was = current && current[k] && current[k].name;
    console.log('  + ' + k.padEnd(3) + records[k].name + '  $' + records[k].price.toFixed(2) + (was && was !== records[k].name ? '   (replaces "' + was + '")' : ''));
  }
  for (const k of deletes) console.log('  - ' + k.padEnd(3) + ((current[k] && current[k].name) || '(unnamed)'));
  if (current) {
    const kept = Object.keys(current).filter((k) => !records[k] && deletes.indexOf(k) === -1);
    if (kept.length) console.log('  = kept untouched (not official, not old catalog): ' + kept.join(', '));
  }
  if (!write) { console.log('\nNothing was changed. Run again with --write to apply.'); return { records, updates, deletes, written: false }; }
  if (!current) throw new Error('Refusing to write without being able to read /products first (check FIREBASE_SERVICE_ACCOUNT).');
  await common.getDb().ref().update(updates);
  console.log('\nDone. /products now holds the official catalog.');
  return { records, updates, deletes, written: true };
}

module.exports = { buildRecords, plan, run, SEED_VERSION };

if (require.main === module) {
  run(process.argv.slice(2)).then(() => process.exit(0)).catch((e) => { console.error('Sync failed:', e.message); process.exit(1); });
}
