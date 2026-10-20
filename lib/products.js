/**
 * lib/products.js: catalog, bundle splitting and supplier (CJ Dropshipping / Korean B2B) item mapping.
 *
 * This file is the SERVER'S source of truth for what can be sold and for how much. The browser only sends
 * { id, variant, quantity }; prices and the supplier items to order are looked up here, so a tampered cart
 * cannot change a price or what gets shipped.
 *
 * SHAPE. CATALOG_ROWS below is the flat list you maintain:
 *   { id, name, brand, category, price, compareAtPrice, supplierSku, supplierVid }  (+ type, displayCategory, legacyId, ...)
 * From it this file builds
 *   PRODUCTS          array of every product (flat fields above + description, tags, images, bestseller fields ...)
 *   PRODUCTS_CATALOG  the same products keyed by id, with variants.default = { label, price, cjItems } that the
 *                     checkout / api/agent.js code already uses
 *
 * SUPPLIER FIELDS (used by mapCartToCJProducts() and api/agent.js):
 *   supplierSku  the supplier's bar code / SKU for this product (StyleKorean B2B bar codes for the 7 K-Beauty items). Always kept as a STRING
 *                (a number would drop leading zeros). Replace each БАРКОД_* marker with the real code.
 *   supplierVid  a variant id, only for suppliers that use one (CJ). '' = the supplier identifies items by supplierSku alone.
 *   A BUNDLE is never ordered as one item: bundleItems lists the products it contains and mapCartToCJProducts() splits
 *   it into those products' supplierSku / supplierVid. The bundle's own supplierSku is only an internal reference.
 *   Every INSERT_* value is a placeholder; an order that still contains one is flagged "needs_review" by api/agent.js and
 *   is NOT sent to the supplier.
 *
 * IDS. Ids are slugs ("cosrx-snail-mucin"). The old numeric ids '1'..'10' still resolve through LEGACY_ID_ALIASES, so carts,
 * orders and pages created before the switch keep working. The storefront pages still use the numeric ids, so
 * toStorefrontProduct() sends those until you set STOREFRONT_IDS = 'slug' (after catalog.html / product.html / the admin seed use slugs).
 *
 * LIVE PRICES. price / compareAtPrice below are the built-in defaults. The admin panel saves the real, current prices to Firebase /products
 * (price, originalPrice, promoEnabled). refreshLivePrices() reads them (cached ~30 s) and updates this catalog in place, so everything that
 * reads PRODUCTS_CATALOG afterwards (storefront catalog API, order creation, ...) sees the prices set in the admin panel.
 * Call `await refreshLivePrices()` once at the top of every API handler that shows or charges prices.
 * KEEP the storefront and the server on the same source: if they ever differ, checkout answers "prices were updated" and the sale is blocked.
 */
'use strict';

const PLACEHOLDER = /^(REPLACE_WITH_|INSERT_|\u0411\u0410\u0420\u041a\u041e\u0414_)/;   // INSERT_*, REPLACE_WITH_* and the Cyrillic "BARCODE_*" (БАРКОД_*) markers are NOT real supplier codes
const VALIDATE_BARCODE_CHECKSUM = true;   // digit-only 8 / 12 / 13 / 14 digit codes must pass the GS1 check digit (EAN-8, UPC-A, EAN-13, GTIN-14)
const STOREFRONT_IDS = 'legacy';          // 'legacy' = numeric ids '1'..'10' (what the pages use today) | 'slug' = the ids below

/* ------------------------------ the catalog (edit here) ------------------------------ */
const U = 'https://images.unsplash.com/photo-';
const CATALOG_ROWS = [
  { id: 'cosrx-snail-mucin', legacyId: '1', name: 'COSRX Advanced Snail 96 Mucin Power Essence', brand: 'COSRX', category: 'skincare', displayCategory: 'Essences',
    price: 25.00, compareAtPrice: 29.00, supplierSku: 'БАРКОД_COSRX', supplierVid: '', label: 'Standard', photo: '1556228722-d119f018d480' },
  { id: 'anua-heartleaf-toner', legacyId: '2', name: 'Anua Heartleaf 77% Soothing Toner 250ml', brand: 'Anua', category: 'skincare', displayCategory: 'Toners',
    price: 22.00, compareAtPrice: 28.00, supplierSku: 'БАРКОД_ANUA', supplierVid: '', label: '250ml', photo: '1608248597261-83325b6ba584' },
  { id: 'boj-relief-sun', legacyId: '3', name: 'Beauty of Joseon Relief Sun: Rice + Probiotics SPF50+', brand: 'Beauty of Joseon', category: 'skincare', displayCategory: 'Sun Care',
    price: 18.00, compareAtPrice: 24.00, supplierSku: 'БАРКОД_BOJ', supplierVid: '', label: 'Standard', photo: '1567928254714-3a216c5b969d' },
  { id: 'skin1004-centella-ampoule', legacyId: '4', name: 'Skin1004 Madagascar Centella Ampoule 100ml', brand: 'Skin1004', category: 'skincare', displayCategory: 'Serums & Ampoules',
    price: 24.00, compareAtPrice: 30.00, supplierSku: 'БАРКОД_SKIN1004', supplierVid: '', label: '100ml', photo: '1556228720-195a672e8a03' },
  { id: 'laneige-lip-sleeping-mask', legacyId: '5', name: 'Laneige Lip Sleeping Mask Berry', brand: 'Laneige', category: 'skincare', displayCategory: 'Lip Care',
    price: 24.00, compareAtPrice: 29.00, supplierSku: 'БАРКОД_LANEIGE', supplierVid: '', label: 'Berry', photo: '1608248543803-ba4f8c70ae0b' },
  { id: 'biodance-collagen-mask', legacyId: '6', name: 'Biodance Bio-Collagen Real Deep Mask Set', brand: 'Biodance', category: 'skincare', displayCategory: 'Masks',
    price: 19.00, compareAtPrice: 25.00, supplierSku: 'БАРКОД_BIODANCE', supplierVid: '', label: 'Mask Set', photo: '1570172619644-dfd03ed5d881' },
  { id: 'roundlab-birch-cream', legacyId: '7', name: 'Round Lab Birch Juice Moisturizing Cream 80ml', brand: 'Round Lab', category: 'skincare', displayCategory: 'Moisturizers',
    price: 28.00, compareAtPrice: 34.00, supplierSku: 'БАРКОД_ROUNDLAB', supplierVid: '', label: '80ml', photo: '1608248543803-ba4f8c70ae0b' },
  { id: 'nikora-booster-wand', legacyId: '8', name: 'NIKORA Electroporation & LED Skin Booster Wand', brand: 'NIKORA Beauty Tech', category: 'beauty-tech', displayCategory: 'Facial Wand',
    price: 129.00, compareAtPrice: 169.00, supplierSku: 'NIKORA-WAND-01', supplierVid: '', label: 'Standard', photo: '1620916566398-39f1143ab7be' },
  { id: 'nikora-cryo-globe', legacyId: '9', name: 'NIKORA Cryo-Cooling Ice Globe Sculptor', brand: 'NIKORA Beauty Tech', category: 'beauty-tech', displayCategory: 'Cooling Therapy',
    price: 39.00, compareAtPrice: 52.00, supplierSku: 'NIKORA-CRYO-01', supplierVid: '', label: 'Standard', photo: '1512290900673-10705a3962d3' },
  { id: 'nikora-glass-skin-bundle', legacyId: '10', name: 'The NIKORA x K-Beauty Glass Skin Ritual Set', brand: 'NIKORA Bundles', category: 'bundles', displayCategory: 'Bundles & Sets', type: 'bundle',
    price: 159.00, compareAtPrice: 215.00, supplierSku: 'NIKORA-BUNDLE-01', supplierVid: null, label: 'Glass Skin Ritual Set', photo: '1522337360788-8b13dee7a37e',
    // split into these products' supplier items: Booster Wand + COSRX essence + Skin1004 ampoule + Biodance mask, one of each
    bundleItems: [
      { productId: 'nikora-booster-wand', quantity: 1 },
      { productId: 'cosrx-snail-mucin', quantity: 1 },
      { productId: 'skin1004-centella-ampoule', quantity: 1 },
      { productId: 'biodance-collagen-mask', quantity: 1 }
    ] }
];

/** Old numeric ids -> slug ids, so carts, orders and pages from before the switch still resolve. */
const LEGACY_ID_ALIASES = CATALOG_ROWS.reduce((m, r) => { m[r.legacyId] = r.id; return m; }, {});

/* Builds a gallery from ONE image: the photo plus 3 crops of it (4 distinct URLs, images[0] = the original).
   These are stand-ins: replace a product's images with the real, brand-approved photos. */
const GALLERY_SIZE = 4;
const gallery = (url) => {
  const base = String(url).split('?')[0];
  const crops = ['top', 'bottom', 'entropy'].map((c) => base + '?w=900&h=900&fit=crop&crop=' + c + '&q=80');
  return [url, ...crops].slice(0, GALLERY_SIZE);
};

/* ------------------------------ merchandising copy ------------------------------ */
/* Fallback ranks used only until the store has real sales (see computeBestsellerRanking). */
const BESTSELLER_RANKS = {
  'nikora-booster-wand'     : { bestsellerRank: 1, bestsellerLabel: 'Top Bestseller' },
  'nikora-glass-skin-bundle': { bestsellerRank: 2, bestsellerLabel: 'Top Bundle' },
  'cosrx-snail-mucin'       : { bestsellerRank: 3, bestsellerLabel: 'Trending' },
  'boj-relief-sun'          : { bestsellerRank: 4, bestsellerLabel: 'Bestseller' }
};
const REAL_STATS = {
  // 'cosrx-snail-mucin': { rating: 4.7, salesCount: 1280 },   // only with real data
};
const DESCRIPTIONS = {
  'cosrx-snail-mucin': 'A lightweight Korean essence with snail secretion filtrate that hydrates and leaves skin looking smooth, bouncy and glowy.',
  'anua-heartleaf-toner': 'A soothing toner built around heartleaf extract that calms the look of stressed, oily or sensitive-feeling skin and preps it for the rest of your routine.',
  'boj-relief-sun': 'A lightweight daily sunscreen with rice extract and probiotics, SPF50+ and PA++++, that wears comfortably under makeup with a soft, dewy finish.',
  'skin1004-centella-ampoule': 'A single-focus Centella Asiatica ampoule that soothes and comforts the look of irritated-feeling skin and supports a healthy-looking skin barrier.',
  'laneige-lip-sleeping-mask': 'The cult overnight lip treatment in Berry: a creamy mask that leaves lips feeling soft, smooth and moisturized by morning.',
  'biodance-collagen-mask': 'A bio-collagen hydrogel mask set that melts onto skin overnight for a plump, hydrated and refreshed look by morning.',
  'roundlab-birch-cream': 'A cushiony moisturizing cream with birch tree sap that seals in hydration and leaves skin feeling soft and comfortable.',
  'nikora-booster-wand': 'Our hero beauty-tech wand: gentle electroporation-style infusion plus LED light, designed to help your K-Beauty essences and ampoules absorb for a visible glow.',
  'nikora-cryo-globe': 'A cryo-cooling facial globe for a refreshing sculpting massage that helps de-puff and contour the look of your face and neck.',
  'nikora-glass-skin-bundle': 'The complete Glass Skin ritual: NIKORA Booster Wand, COSRX Snail 96 Mucin Power Essence, Skin1004 Madagascar Centella Ampoule and a Biodance Bio-Collagen Real Deep Mask Set.'
};

/* SKIN CONCERN TAGS: filter / routine tags shown on catalog cards and product pages. Cosmetic wording only, never a medical claim. */
const SKIN_CONCERNS = [
  { key: 'BarrierRepair',  tag: '#BarrierRepair',  label: 'Barrier Repair',  hint: 'Comfort and moisture support for dry, tight or sensitive-feeling skin' },
  { key: 'Hydration',      tag: '#Hydration',      label: 'Hydration',       hint: 'Water-bound, plump, dewy-looking skin' },
  { key: 'AcneCalming',    tag: '#AcneCalming',    label: 'Acne Calming',    hint: 'Calming, lightweight care for oily or blemish-prone-feeling skin' },
  { key: 'AntiAgingGlow',  tag: '#AntiAgingGlow',  label: 'Anti-Aging Glow', hint: 'Smoother-looking, firmer-feeling, radiant skin' }
];
const SKIN_TAGS = {
  'cosrx-snail-mucin'        : ['#Hydration', '#BarrierRepair'],
  'anua-heartleaf-toner'     : ['#AcneCalming', '#Hydration'],
  'boj-relief-sun'           : ['#AntiAgingGlow'],
  'skin1004-centella-ampoule': ['#BarrierRepair', '#AcneCalming'],
  'laneige-lip-sleeping-mask': ['#Hydration'],
  'biodance-collagen-mask'   : ['#Hydration', '#AntiAgingGlow'],
  'roundlab-birch-cream'     : ['#BarrierRepair', '#Hydration'],
  'nikora-booster-wand'      : ['#Hydration', '#AntiAgingGlow'],
  'nikora-cryo-globe'        : ['#AcneCalming'],
  'nikora-glass-skin-bundle' : ['#BarrierRepair', '#Hydration', '#AntiAgingGlow']
};

/* ------------------------------ build PRODUCTS / PRODUCTS_CATALOG ------------------------------ */
const ROW_BY_ID = CATALOG_ROWS.reduce((m, r) => { m[r.id] = r; return m; }, {});

/* ------------------------------ supplier code formatting + checks ------------------------------ */
/** Clean text for the supplier: always a string, Unicode-normalised and trimmed. Digit-only codes lose spaces / hyphens ("4 006381-333931" -> "4006381333931");
 *  codes with letters ("NIKORA-WAND-01") are only trimmed. Never converts to a number, so leading zeros survive. */
function formatSupplierSku(v) {
  const s = String(v == null ? '' : v).normalize('NFKC').trim();
  return /^[\d\s-]+$/.test(s) ? s.replace(/[\s-]+/g, '') : s.replace(/\s+/g, ' ');
}
/** GS1 check digit for EAN-8 / UPC-A / EAN-13 / GTIN-14 */
function gs1Valid(code) {
  const d = String(code).split('').map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
/** '' when the code can be sent to the supplier, otherwise the reason it cannot. */
function supplierSkuProblem(sku) {
  const s = String(sku == null ? '' : sku).trim();
  if (!s) return 'empty';
  if (PLACEHOLDER.test(s)) return 'placeholder';
  if (/[^\x20-\x7E]/.test(s)) return 'non_ascii_characters';          // catches Cyrillic look-alike letters pasted into a code
  const f = formatSupplierSku(s);
  if (VALIDATE_BARCODE_CHECKSUM && /^\d+$/.test(f) && [8, 12, 13, 14].includes(f.length) && !gs1Valid(f)) return 'bad_check_digit';
  return '';
}

/** The supplier items one unit of this row turns into: itself, or (bundle) its components. */
function supplierItemsFor(row) {
  if (!row.bundleItems) return [{ vid: row.supplierVid || '', sku: formatSupplierSku(row.supplierSku), quantity: 1 }];
  return row.bundleItems.map((b) => {
    const c = ROW_BY_ID[b.productId];
    if (!c || c.bundleItems) throw new Error('Bundle ' + row.id + ' contains an unknown or nested product: ' + b.productId);
    return { vid: c.supplierVid || '', sku: formatSupplierSku(c.supplierSku), quantity: b.quantity };
  });
}

const PRODUCTS_CATALOG = {};
for (const r of CATALOG_ROWS) {
  const r0 = BESTSELLER_RANKS[r.id];
  const img = gallery(U + r.photo + '?w=600');
  PRODUCTS_CATALOG[r.id] = Object.assign({
    id: r.id, legacyId: r.legacyId, type: r.type || 'single',
    name: r.name, brand: r.brand, category: r.category, displayCategory: r.displayCategory,
    price: r.price, compareAtPrice: r.compareAtPrice, oldPrice: r.compareAtPrice,      // oldPrice = compareAtPrice, the name the storefront pages read
    supplierSku: r.supplierSku, supplierVid: r.supplierVid,
    bundleItems: r.bundleItems ? r.bundleItems.map((b) => Object.assign({}, b)) : null,
    description: DESCRIPTIONS[r.id] || '',
    tags: (SKIN_TAGS[r.id] || []).slice(),
    images: img, image: img[0],
    isBestseller: !!r0, bestsellerRank: r0 ? r0.bestsellerRank : null, bestsellerLabel: r0 ? r0.bestsellerLabel : null,
    rating: null, salesCount: null,
    variants: { default: { label: r.label, price: r.price, cjItems: supplierItemsFor(r) } }
  }, REAL_STATS[r.id] || {});
}
const PRODUCTS = Object.values(PRODUCTS_CATALOG);

/* Fail fast on a broken catalog instead of selling at a wrong price. */
(function assertCatalog() {
  const seen = new Set();
  for (const p of PRODUCTS) {
    if (seen.has(p.id)) throw new Error('Duplicate product id: ' + p.id);
    seen.add(p.id);
    if (!(p.price > 0) || !(p.compareAtPrice > p.price)) throw new Error('Bad price / compareAtPrice for ' + p.id);
    if (!p.supplierSku || typeof p.supplierSku !== 'string') throw new Error('Missing supplierSku for ' + p.id);
    if (!p.name.trim() || !p.brand.trim()) throw new Error('Missing name or brand for ' + p.id);
  }
})();


/* ------------------------------ LIVE PRICES (set in the admin panel, stored in Firebase /products) ------------------------------ */
const LIVE_PRICE_TTL_MS = 30 * 1000;
const MAX_LIVE_PRICE = 10000;
const BASE_PRICES = new Map(PRODUCTS.map((p) => [p.id, { price: p.price, compareAtPrice: p.compareAtPrice }]));
const round2 = (n) => Math.round(Number(n) * 100) / 100;
let liveFetchedAt = 0, liveInflight = null;

/**
 * fbProducts: the value of Firebase /products ({ '1': {...}, '2': {...} }). Pure apart from updating PRODUCTS_CATALOG.
 *   price          live retail price (ignored if it is not a number between 0 and 10000: the built-in price is kept)
 *   promoEnabled   false = no discount: compareAtPrice / oldPrice become null (storefront shows only the retail price)
 *   originalPrice  (or legacy oldPrice) the crossed-out price; used only when promoEnabled !== false AND it is higher than price
 * A record with neither promoEnabled nor an original price keeps the built-in compare-at price.
 */
function applyLivePrices(fbProducts) {
  const src = fbProducts && typeof fbProducts === 'object' ? fbProducts : {};
  for (const p of PRODUCTS) {
    const base = BASE_PRICES.get(p.id);
    const rec = src[p.legacyId] || src[p.id];
    let price = base.price, compare = base.compareAtPrice > base.price ? base.compareAtPrice : null;
    if (rec && typeof rec === 'object') {
      const lp = Number(rec.price);
      if (Number.isFinite(lp) && lp > 0 && lp <= MAX_LIVE_PRICE) price = round2(lp);
      const origRaw = rec.originalPrice != null ? rec.originalPrice : rec.oldPrice;
      if (rec.promoEnabled === false) compare = null;
      else if (rec.promoEnabled === true || origRaw != null) { const lo = Number(origRaw); compare = Number.isFinite(lo) && lo > price ? round2(lo) : null; }
      else compare = base.compareAtPrice > price ? base.compareAtPrice : null;
    }
    p.price = price;
    p.variants.default.price = price;
    p.compareAtPrice = compare;
    p.oldPrice = compare;
    p.promoEnabled = compare != null;
  }
}

/**
 * Reads Firebase /products and applies it (at most once per ttlMs per server instance). Never throws: if Firebase cannot be read it keeps the last
 * known prices. opts: { force, ttlMs, db }
 */
async function refreshLivePrices(opts) {
  const o = opts || {};
  const ttl = o.ttlMs != null ? o.ttlMs : LIVE_PRICE_TTL_MS;
  if (!o.force && Date.now() - liveFetchedAt < ttl) return false;
  if (liveInflight) return liveInflight;
  liveInflight = (async () => {
    try {
      const db = o.db || require('./common').getDb();
      const snap = await db.ref('products').once('value');
      applyLivePrices(snap.val() || {});
      liveFetchedAt = Date.now();
      return true;
    } catch (e) {
      console.warn('[products] live prices unavailable, keeping the last known prices:', e && e.message);
      liveFetchedAt = Date.now() - ttl + 5000;               // try again in ~5 s
      return false;
    } finally { liveInflight = null; }
  })();
  return liveInflight;
}
/** True when a product currently shows a discount (crossed-out original price above the retail price). */
const promoActive = (p) => !!(p && p.compareAtPrice != null && p.compareAtPrice > p.price);

/* ------------------------------ LIVE BESTSELLER RANKING (this store's own sales) ------------------------------ */
const BESTSELLER_COUNT   = 4;      // how many products get isBestseller / a rank
const MIN_UNITS_TO_RANK  = 1;      // a product needs at least this many units sold (in the sales window) to be ranked
const FILL_FROM_FALLBACK = false;  // false: the fallback table is used only when there are NO sales

const fallbackRankOf = (p) => (p.bestsellerRank == null ? Infinity : p.bestsellerRank);
const orderOf = (p) => Number(p.legacyId) || 0;

/**
 * sales: { [productId]: { units, orders } } from this store's orders (lib/sales.js), or null / {}. Ids may be slugs or old numeric ids.
 * Returns { source: 'sales' | 'fallback', byId: { [slug id]: { isBestseller, bestsellerRank, bestsellerLabel, salesCount } } }
 * Ranking: units sold (desc), then number of orders, then fallback rank, then catalog order. Pure: never changes PRODUCTS_CATALOG.
 */
function computeBestsellerRanking(sales) {
  const stat = (p) => (sales && (sales[p.id] || sales[p.legacyId])) || { units: 0, orders: 0 };

  const sold = PRODUCTS
    .filter((p) => stat(p).units >= MIN_UNITS_TO_RANK)
    .sort((a, b) => stat(b).units - stat(a).units || stat(b).orders - stat(a).orders
      || fallbackRankOf(a) - fallbackRankOf(b) || orderOf(a) - orderOf(b));

  const byId = {};
  if (!sold.length) {
    for (const p of PRODUCTS) byId[p.id] = { isBestseller: p.isBestseller, bestsellerRank: p.bestsellerRank, bestsellerLabel: p.bestsellerLabel, salesCount: null };
    return { source: 'fallback', byId };
  }

  let chosen = sold.slice(0, BESTSELLER_COUNT);
  if (FILL_FROM_FALLBACK && chosen.length < BESTSELLER_COUNT) {
    const extra = PRODUCTS.filter((p) => p.isBestseller && !chosen.includes(p)).sort((a, b) => fallbackRankOf(a) - fallbackRankOf(b));
    chosen = chosen.concat(extra).slice(0, BESTSELLER_COUNT);
  }
  const topBundle = chosen.find((p) => p.type === 'bundle');
  for (const p of PRODUCTS) {
    const i = chosen.indexOf(p);
    byId[p.id] = {
      isBestseller: i !== -1,
      bestsellerRank: i === -1 ? null : i + 1,
      bestsellerLabel: i === -1 ? null : (i === 0 ? 'Top Bestseller' : (p === topBundle ? 'Top Bundle' : 'Bestseller')),
      salesCount: stat(p).units
    };
  }
  return { source: 'sales', byId };
}

/* ---------------------------------- helpers ---------------------------------- */
/** slug id, or an old numeric id, -> the catalog key ('' when unknown) */
const resolveId = (id) => { const k = String(id == null ? '' : id); return PRODUCTS_CATALOG[k] ? k : (LEGACY_ID_ALIASES[k] || ''); };
const getProduct = (id) => PRODUCTS_CATALOG[resolveId(id)] || null;

/** Returns the variant object (price, label, cjItems) or null when the product / variant does not exist. */
function getVariant(id, variant) {
  const product = getProduct(id);
  if (!product) return null;
  return product.variants[variant || 'default'] || null;
}

const BUNDLE_CATEGORY = 'Bundles & Sets';   // displayCategory of bundles, as the storefront pages label them
/** All bundles / gift sets (category "bundles"). */
const listBundles = () => PRODUCTS.filter((p) => p.type === 'bundle');

/** Products with a skin-concern tag, e.g. listByConcern('AcneCalming') or listByConcern('#Hydration'). */
const listByConcern = (concern) => {
  const key = String(concern || '').replace(/^#/, '').toLowerCase();
  return PRODUCTS.filter((p) => p.tags.some((t) => t.replace(/^#/, '').toLowerCase() === key));
};

/** Products ordered by the STATIC fallback ranks: ranked first, then the rest in catalog order. */
function listProductsByRank() {
  return PRODUCTS.slice().sort((a, b) => fallbackRankOf(a) - fallbackRankOf(b) || orderOf(a) - orderOf(b));
}

/**
 * Storefront-shaped record (the field names catalog.html / product.html read: img, oldPrice, bestseller, images).
 * `category` is the storefront's display label (Essences, Toners ...); `slug` and `catalogCategory` carry the new values.
 * Pass computeBestsellerRanking() to use the store's own sales ranking.
 */
function toStorefrontProduct(p, ranking) {
  const r = (ranking && ranking.byId && ranking.byId[p.id]) || { isBestseller: p.isBestseller, bestsellerRank: p.bestsellerRank, bestsellerLabel: p.bestsellerLabel, salesCount: p.salesCount };
  return {
    id: STOREFRONT_IDS === 'slug' ? p.id : p.legacyId, slug: p.id,
    name: p.name, brand: p.brand, category: p.displayCategory, catalogCategory: p.category,
    price: p.price, desc: p.description, oldPrice: p.compareAtPrice, originalPrice: p.compareAtPrice, promoEnabled: p.compareAtPrice != null && p.compareAtPrice > p.price, tags: p.tags.slice(),
    img: p.image, images: p.images.slice(),
    bestseller: r.isBestseller, bestsellerRank: r.bestsellerRank, bestsellerLabel: r.bestsellerLabel,
    rating: p.rating, salesCount: r.salesCount
  };
}

/** Whole storefront catalog for a ranking, best rank first (unranked products after, in catalog order). */
function buildStorefrontCatalog(ranking) {
  const rank = (s) => (s.bestsellerRank == null ? Infinity : s.bestsellerRank);
  return PRODUCTS.map((p) => toStorefrontProduct(p, ranking))
    .sort((a, b) => rank(a) - rank(b) || (Number(PRODUCTS_CATALOG[a.slug].legacyId) || 0) - (Number(PRODUCTS_CATALOG[b.slug].legacyId) || 0));
}

/** Cart quantities arrive as `quantity` (API) or `qty` (this site's cart). Always a whole number >= 1. */
const lineQuantity = (item) => Math.floor(Number(item.quantity != null ? item.quantity : item.qty)) || 0;

/**
 * True when a supplier item must NOT be sent yet: a placeholder (INSERT_* / REPLACE_WITH_* / БАРКОД_*), an empty code, a code with
 * non-ASCII characters, or a bar code with a wrong check digit. api/agent.js holds such orders as "needs_review".
 */
const hasPlaceholder = (c) => {
  if (c.vid && PLACEHOLDER.test(String(c.vid))) return true;
  return supplierSkuProblem(c.sku) !== '' && (!c.vid || supplierSkuProblem(c.sku) !== 'empty');
};

/**
 * Converts front-end cart items  [{ id, variant, quantity }]  (slug or old numeric ids) into the flat list the supplier needs
 * [{ vid, sku, quantity }]. Bundles are split into their component products, multiplied by the cart quantity; identical
 * supplier items are merged.
 *   cart  [{ id: 'nikora-glass-skin-bundle', quantity: 2 }, { id: 'nikora-booster-wand', quantity: 1 }]
 *   ->    [{ vid:'', sku:'NIKORA-WAND-01', quantity:3 }, { sku: <COSRX code>, quantity:2 }, { sku: <SKIN1004 code>, quantity:2 }, { sku: <BIODANCE code>, quantity:2 }]
 * Every sku comes back as a clean string (formatSupplierSku): trimmed, digit-only codes without spaces / hyphens, leading zeros kept.
 * Throws Error('Unknown product ...') for an id / variant that is not in PRODUCTS_CATALOG.
 */
function mapCartToCJProducts(cartItems) {
  const merged = new Map();
  for (const item of cartItems || []) {
    const qty = lineQuantity(item);
    const v = getVariant(item.id, item.variant);
    if (!v) throw new Error('Unknown product or variant: ' + item.id + '/' + (item.variant || 'default'));
    if (!(qty >= 1)) throw new Error('Invalid quantity for product ' + item.id);
    for (const c of v.cjItems) {
      const sku = formatSupplierSku(c.sku);
      const key = c.vid || sku;
      const prev = merged.get(key);
      const line = { vid: c.vid || '', sku, quantity: (prev ? prev.quantity : 0) + c.quantity * qty };
      if (/^\d+$/.test(sku)) line.barcode = sku;                      // bar-code style codes are also sent as `barcode`
      merged.set(key, line);
    }
  }
  return Array.from(merged.values());
}

module.exports = {
  PRODUCTS, PRODUCTS_CATALOG, CATALOG_ROWS, LEGACY_ID_ALIASES, BESTSELLER_RANKS, SKIN_CONCERNS, SKIN_TAGS,
  getProduct, getVariant, resolveId, listProductsByRank, listBundles, BUNDLE_CATEGORY, listByConcern,
  toStorefrontProduct, buildStorefrontCatalog, computeBestsellerRanking, BESTSELLER_COUNT,
  mapCartToCJProducts, hasPlaceholder, lineQuantity, formatSupplierSku, supplierSkuProblem,
  applyLivePrices, refreshLivePrices, promoActive
};
