#!/usr/bin/env node
/**
 * Compares lib/products.js (what the SERVER charges) with the /products node in Firebase (what the STOREFRONT shows)
 * and lists every difference, plus CJ placeholders that still need real vid/sku values.
 *
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/check-catalog.js
 *
 * Exit code 1 when something needs fixing, so it can also run in CI before a deploy.
 */
'use strict';
const { getDb } = require('../lib/common');
const { PRODUCTS_CATALOG, hasPlaceholder, BUNDLE_CATEGORY } = require('../lib/products');

(async () => {
  let problems = 0;
  const say = (m) => { problems++; console.log('  - ' + m); };

  console.log('CJ mapping');
  for (const p of Object.values(PRODUCTS_CATALOG)) {
    for (const [vid, v] of Object.entries(p.variants)) {
      const unset = v.cjItems.filter(hasPlaceholder);
      if (unset.length) say(`${p.id} "${p.name}" [${vid}] still has placeholder CJ ids`);
    }
  }

  console.log('Gallery images (exactly 4 distinct URLs per product, image === images[0])');
  for (const p of Object.values(PRODUCTS_CATALOG)) {
    const imgs = p.images || [], distinct = new Set(imgs).size;
    if (imgs.length !== 4 || distinct !== imgs.length) say(`${p.id} "${p.name}" has ${imgs.length} images (${distinct} distinct), expected exactly 4 distinct`);
    if (p.image !== imgs[0]) say(`${p.id} "${p.name}": image is not images[0]`);
  }

  console.log('Bundles (category "' + BUNDLE_CATEGORY + '" is what puts a product in the Bundles sections)');
  for (const p of Object.values(PRODUCTS_CATALOG)) {
    if (p.type === 'bundle' && p.category !== BUNDLE_CATEGORY) say(`${p.id} "${p.name}" is type "bundle" but its category is "${p.category}", so it will NOT appear in the Bundles sections`);
    if (p.type !== 'bundle' && p.category === BUNDLE_CATEGORY) say(`${p.id} "${p.name}" is in "${BUNDLE_CATEGORY}" but is not type "bundle"`);
  }

  console.log('Storefront vs server prices (Firebase /products)');
  const snap = await getDb().ref('products').once('value');
  const live = snap.val() || {};
  const rows = Array.isArray(live) ? live.map((v, i) => [String(i), v]) : Object.entries(live);
  const seen = new Set();
  for (const [key, p] of rows) {
    if (!p || p._deleted) continue;
    const id = String(p.id != null ? p.id : key); seen.add(id);
    const cat = PRODUCTS_CATALOG[id];
    if (!cat) { say(`product ${id} "${p.name || p.title}" is on the storefront but NOT in lib/products.js (customers cannot buy it)`); continue; }
    const server = cat.variants.default.price, shown = Number(p.price);
    if (Math.abs(server - shown) > 0.001) say(`product ${id} "${cat.name}": storefront ${shown.toFixed(2)} vs server ${server.toFixed(2)}`);
  }
  for (const id of Object.keys(PRODUCTS_CATALOG)) if (!seen.has(id)) say(`product ${id} is in lib/products.js but not on the storefront`);

  console.log(problems ? `\n${problems} thing(s) to fix.` : '\nAll good.');
  process.exit(problems ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });
