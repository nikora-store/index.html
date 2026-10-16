/**
 * lib/products.js: catalog, bundle mapping and CJ Dropshipping item mapping.
 *
 * This file is the SERVER'S source of truth for what can be sold and for how much. The browser only sends
 * { id, variant, quantity }; prices and the CJ components to order are looked up here, so a tampered cart
 * cannot change a price or what gets shipped.
 *
 * HOW IT FITS TOGETHER
 *   PRODUCTS_CATALOG[productId].variants[variantId] = { label, price, cjItems: [{ vid, sku, quantity }] }
 *   - a SINGLE product has one variant ("default") that maps to one CJ item
 *   - a BUNDLE / KIT has cjItems with several components (or the same component several times)
 *   - mapCartToCJProducts() turns cart lines into one flat CJ item list with quantities scaled by the cart quantity
 *
 * BEFORE GOING LIVE: replace every REPLACE_WITH_CJ_VID_* / REPLACE_WITH_CJ_SKU_* placeholder in CJ below with the
 * real CJ variant id (vid) and SKU from your CJ product pages. Orders containing a placeholder are still saved
 * (and paid) but are NOT sent to CJ; they are flagged on /orders/{id}/fulfillment so nothing is shipped by mistake.
 *
 * MERCHANDISING + GALLERY FIELDS (added to every product by the finalize step at the bottom of the catalog):
 *   images[]          exactly 4 distinct URLs by default (GALLERY_SIZE); images[0] is the main shot. A gallery set on the product in Firebase (admin panel) overrides it, any length. `image` is always images[0] (backwards compatible).
 *   isBestseller      STATIC value = the CJ fallback table (BESTSELLER_RANKS). The LIVE ranking comes from this store's own
 *                     orders: see computeBestsellerRanking() below, used by api/catalog.js
 *   bestsellerRank    1..n, or null when the product is not ranked
 *   bestsellerLabel   badge sub-label ("Top Bestseller", "Top Bundle", "Trending", "Bestseller") or null
 *   rating, salesCount  null on purpose, see the note above MERCH. Fill them only from real data.
 *   description, oldPrice  storefront copy (STOREFRONT_COPY), so every page shows the same text and "was" price
 *
 * KEEP PRICES IN SYNC with what the storefront shows (the /products node in Firebase and product.html's
 * DEFAULT_CATALOG). If they differ, checkout answers "prices were updated" and the sale is blocked. Run
 * `node scripts/check-catalog.js` to list any differences.
 */
'use strict';

const PLACEHOLDER = /^REPLACE_WITH_/;

/** One CJ component. Replace the placeholders with the real CJ strings. */
const cjRef = (key) => ({ vid: 'REPLACE_WITH_CJ_VID_' + key, sku: 'REPLACE_WITH_CJ_SKU_' + key });

/** The physical components you order from CJ (one entry per CJ variant). Singles and bundles are both built from these. */
const CJ = {
  wand         : cjRef(vid: 'QSJT231129101AZ', sku: 'QSJT231129101AZ'),
  sculptor     : cjRef(vid: 'QSYD279592301AZ', sku: 'QSYD279592301AZ'),
  poreCleaner  : cjRef(vid: 'QSPF103528301AZ', sku: 'QSPF103528301AZ'),
  ledMask      : cjRef(vid: 'QSYD262895304DW', sku: 'QSYD262895304DW'),
  bodySculptor : cjRef(vid: 'QSJJJTJT00167-Black', sku: 'QSJJJTJT00167-Black'),
  eyeMassager  : cjRef(vid: 'QSJT204367002BY', sku: 'QSJT204367002BY'),
  scrubber     : cjRef(vid: 'QSPF232795401AZ', sku: 'QSPF232795401AZ'),
  neckMassager : cjRef(vid: 'QSJT148505001AZ', sku: 'QSJT148505001AZ'),
  iceRoller    : cjRef(vid: 'QSAM295354101AZ', sku: 'QSAM295354101AZ'),
  rfDevice     : cjRef(vid: 'QSPF288536301AZ', sku: 'QSPF288536301AZ'),
};


/**
 * Builds a gallery from ONE image. images[0] is the original URL untouched; the others are different crops of the same
 * Unsplash photo (same technique as product.html's buildGallery), so every URL is distinct and known to load.
 * These are stand-ins: replace a product's `images` with the real CJ gallery (main, in-use, detail/head, packaging)
 * from its CJ product page when you have it, e.g.  images: ['https://cc-west-usa.oss-accelerate.aliyuncs.com/...', ...]
 */
const GALLERY_SIZE = 4;   // every product ships with exactly this many distinct images by default
const gallery = (url, extra) => {
  const base = String(url).split('?')[0];
  const crops = ['top', 'bottom', 'entropy'].map((c) => base + '?w=900&h=900&fit=crop&crop=' + c + '&q=80');
  return [url, ...(extra || []), ...crops].slice(0, GALLERY_SIZE);
};

/** productId -> product. Ids are the storefront's ids (see product.html DEFAULT_CATALOG). */
const PRODUCTS_CATALOG = {
  '1': {
    id: '1', type: 'single', name: "NIKORA RED Light & EMS Facial Wand 4-in-1", category: "Facial Wand", images: gallery("https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600"),
    variants: { default: { label: 'Standard', price: 34.99, cjItems: [{ ...CJ.wand, quantity: 1 }] } }
  },
  '2': {
    id: '2', type: 'single', name: "3D EMS Gua Sha Sculptor", category: "Sculptors", images: gallery("https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600"),
    variants: { default: { label: 'Standard', price: 24.99, cjItems: [{ ...CJ.sculptor, quantity: 1 }] } }
  },
  '3': {
    id: '3', type: 'single', name: "Hydro-Vacuum Pore Cleaner", category: "Cleansing", images: gallery("https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600"),
    variants: { default: { label: 'Standard', price: 29.99, cjItems: [{ ...CJ.poreCleaner, quantity: 1 }] } }
  },
  '4': {
    id: '4', type: 'single', name: "LED Therapy Mask 7-in-1 Pro", category: "LED Therapy", images: gallery("https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600"),
    variants: { default: { label: 'Standard', price: 49.99, cjItems: [{ ...CJ.ledMask, quantity: 1 }] } }
  },
  '5': {
    id: '5', type: 'single', name: "EMS Body Sculptor RF", category: "Body Care", images: gallery("https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600"),
    variants: { default: { label: 'Standard', price: 59.99, cjItems: [{ ...CJ.bodySculptor, quantity: 1 }] } }
  },
  '6': {
    id: '6', type: 'single', name: "Sonic Eye Massager", category: "Eye Care", images: gallery("https://images.unsplash.com/photo-1608248597261-83325b6ba584?w=600"),
    variants: { default: { label: 'Standard', price: 19.99, cjItems: [{ ...CJ.eyeMassager, quantity: 1 }] } }
  },
  '7': {
    id: '7', type: 'single', name: "Ultrasonic Skin Scrubber", category: "Cleansing", images: gallery("https://images.unsplash.com/photo-1556228722-d119f018d480?w=600"),
    variants: { default: { label: 'Standard', price: 24.99, cjItems: [{ ...CJ.scrubber, quantity: 1 }] } }
  },
  '8': {
    id: '8', type: 'single', name: "Thermal Neck & Face Massager", category: "Sculptors", images: gallery("https://images.unsplash.com/photo-1567928254714-3a216c5b969d?w=600"),
    variants: { default: { label: 'Standard', price: 39.99, cjItems: [{ ...CJ.neckMassager, quantity: 1 }] } }
  },
  '9': {
    id: '9', type: 'single', name: "Cryo Ice Roller", category: "Cooling Therapy", images: gallery("https://images.unsplash.com/photo-1512290900673-10705a3962d3?w=600"),
    variants: { default: { label: 'Standard', price: 19.99, cjItems: [{ ...CJ.iceRoller, quantity: 1 }] } }
  },
  '10': {
    id: '10', type: 'single', name: "RF Anti-Aging Device", category: "Anti-Aging", images: gallery("https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600"),
    variants: { default: { label: 'Standard', price: 69.99, cjItems: [{ ...CJ.rfDevice, quantity: 1 }] } }
  },
  '11': {
    id: '11', type: 'bundle', name: "NIKORA Ultimate Glow Ritual Set (Full Gadget Bundle)", category: "Bundles & Sets", images: gallery("https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600"),
    variants: {
      default: {
        label: 'Full Gadget Bundle', price: 149.99,
        // Facial Wand + LED Mask + Gua Sha Sculptor + Sonic Eye Massager, one of each.
        cjItems: [
          { ...CJ.wand, quantity: 1 },
          { ...CJ.ledMask, quantity: 1 },
          { ...CJ.sculptor, quantity: 1 },
          { ...CJ.eyeMassager, quantity: 1 }
        ]
      }
    }
  },
};


/*
 * BESTSELLER FALLBACK TABLE (CJ Dropshipping beauty-tech sales stats). This is NOT the store's ranking.
 * The ranking shown on the site comes from this store's own orders (lib/sales.js -> computeBestsellerRanking below).
 * This table is used only when the store has no countable sales yet, e.g. right after launch or if the orders
 * lookup fails. Only ranks 1-4 are defined; every other product stays unranked.
 *
 * rating and salesCount are null on purpose: ratings come from real Firebase /reviews data, and salesCount is only
 * ever filled with this store's real unit counts (computeBestsellerRanking), never with an invented number.
 */
const BESTSELLER_RANKS = {
  '1' : { bestsellerRank: 1, bestsellerLabel: 'Top Bestseller' },   // Microcurrent Facial Wand
  '11': { bestsellerRank: 2, bestsellerLabel: 'Top Bundle' },       // Ultimate Glow Ritual Set
  '4' : { bestsellerRank: 3, bestsellerLabel: 'Trending' },         // LED Therapy Mask
  '6' : { bestsellerRank: 4, bestsellerLabel: 'Bestseller' },       // Sonic Eye Massager
};
const REAL_STATS = {
  // '1': { rating: 4.7, salesCount: 1280 },   // only with real data
};

/*
 * STOREFRONT COPY: the description and the "was" (compare-at) price shown with each product. Taken from catalog.html's DEFAULT_CATALOG so
 * every page can show the same text and prices from this one file. Edit here to change them everywhere.
 */
const STOREFRONT_COPY = {
  '1': { oldPrice: 49.99, description: "Microcurrent, red light therapy, therapeutic warmth, and facial massage for youthful glow." },
  '2': { oldPrice: 34.99, description: "Advanced ergonomic electric Gua Sha with heat and microcurrent for facial contouring." },
  '3': { oldPrice: 39.99, description: "Deep pore suction cleaner with water circulation and blue light sterilization." },
  '4': { oldPrice: 79.99, description: "Professional 7-color light therapy mask targeting acne, collagen production, and hyperpigmentation." },
  '5': { oldPrice: 89.99, description: "Radio frequency and electrical muscle stimulation device for body toning and firming." },
  '6': { oldPrice: 29.99, description: "Thermal sonic vibration tool to reduce dark circles, eye bags, and fine lines." },
  '7': { oldPrice: 34.99, description: "High-frequency spatula for deep skin peeling, blackhead extraction, and serum infusion." },
  '8': { oldPrice: 54.99, description: "Dolphin-tail lifting device targeting neck lines, jawline firmness, and double chin." },
  '9': { oldPrice: 24.99, description: "Cold therapy facial roller for instant puffiness relief, redness calming, and pore shrinking." },
  '10': { oldPrice: 99.99, description: "Ultimate multi-polar radiofrequency skin tightening and collagen remodeling device." },
  '11': { oldPrice: 219.99, description: "Complete beauty gadget set: Facial Wand, LED Mask, Gua Sha Sculptor, and Sonic Eye Massager." },
};

// Finalize: every product gets the same merchandising + gallery shape, and `image` always mirrors images[0].
for (const p of Object.values(PRODUCTS_CATALOG)) {
  const r = BESTSELLER_RANKS[p.id];
  p.isBestseller = !!r;
  p.bestsellerRank = r ? r.bestsellerRank : null;
  p.bestsellerLabel = r ? r.bestsellerLabel : null;
  p.rating = null;
  p.salesCount = null;
  const copy = STOREFRONT_COPY[p.id] || {};
  p.description = copy.description || '';
  p.oldPrice = copy.oldPrice != null ? copy.oldPrice : null;
  Object.assign(p, REAL_STATS[p.id] || {});
  p.images = (Array.isArray(p.images) ? p.images : []).filter(Boolean);
  p.image = p.images[0] || '';
}


/* ------------------------------ LIVE BESTSELLER RANKING (this store's own sales) ------------------------------ */

const BESTSELLER_COUNT   = 4;      // how many products get isBestseller / a rank
const MIN_UNITS_TO_RANK  = 1;      // a product needs at least this many units sold (in the sales window) to be ranked
const FILL_FROM_FALLBACK = false;  // false: CJ table is used only when there are NO sales. true: it also pads empty slots when fewer than BESTSELLER_COUNT products have sales.

const fallbackRankOf = (p) => (p.bestsellerRank == null ? Infinity : p.bestsellerRank);

/**
 * sales: { [productId]: { units, orders } } built from this store's orders (see lib/sales.js), or null / {} when there are none.
 * Returns { source: 'sales' | 'fallback', byId: { [productId]: { isBestseller, bestsellerRank, bestsellerLabel, salesCount } } }
 * Ranking: units sold (desc), then number of orders, then the CJ fallback rank, then id. Bundles compete as their own product id.
 * Pure: it never changes PRODUCTS_CATALOG.
 */
function computeBestsellerRanking(sales) {
  const products = Object.values(PRODUCTS_CATALOG);
  const stat = (id) => (sales && sales[id]) || { units: 0, orders: 0 };

  const sold = products
    .filter((p) => stat(p.id).units >= MIN_UNITS_TO_RANK)
    .sort((a, b) => stat(b.id).units - stat(a.id).units || stat(b.id).orders - stat(a.id).orders
      || fallbackRankOf(a) - fallbackRankOf(b) || Number(a.id) - Number(b.id));

  const byId = {};
  if (!sold.length) {                                   // no internal sales yet: static CJ fallback table
    for (const p of products) {
      byId[p.id] = { isBestseller: p.isBestseller, bestsellerRank: p.bestsellerRank, bestsellerLabel: p.bestsellerLabel, salesCount: null };
    }
    return { source: 'fallback', byId };
  }

  let chosen = sold.slice(0, BESTSELLER_COUNT);
  if (FILL_FROM_FALLBACK && chosen.length < BESTSELLER_COUNT) {
    const extra = products.filter((p) => p.isBestseller && !chosen.includes(p)).sort((a, b) => fallbackRankOf(a) - fallbackRankOf(b));
    chosen = chosen.concat(extra).slice(0, BESTSELLER_COUNT);
  }
  const topBundle = chosen.find((p) => p.type === 'bundle');
  for (const p of products) {
    const i = chosen.indexOf(p);
    byId[p.id] = {
      isBestseller: i !== -1,
      bestsellerRank: i === -1 ? null : i + 1,
      bestsellerLabel: i === -1 ? null : (i === 0 ? 'Top Bestseller' : (p === topBundle ? 'Top Bundle' : 'Bestseller')),
      salesCount: stat(p.id).units                       // real units sold in the window
    };
  }
  return { source: 'sales', byId };
}

/*
 * EXAMPLES of other shapes you can add (copy, rename, fill in the real CJ values):
 *
 * A "Duo Pack" = 2x the same device, sold as an extra variant of product 1 (cart line: { id: '1', variant: 'duo', quantity: 1 }):
 *   PRODUCTS_CATALOG['1'].variants.duo = { label: 'Duo Pack (2 devices)', price: 59.99, cjItems: [{ ...CJ.wand, quantity: 2 }] };
 *
 * A "Starter Bundle" = 1 device + 2 conductive gels (add a CJ.gel component first):
 *   PRODUCTS_CATALOG['12'] = { id: '12', type: 'bundle', name: 'Starter Bundle', category: 'Bundles & Sets', images: gallery('https://...'),
 *     variants: { default: { label: 'Device + 2 Gels', price: 44.99, cjItems: [{ ...CJ.wand, quantity: 1 }, { ...CJ.gel, quantity: 2 }] } } };
 * Remember to add the same product (id, name, price) to the storefront so customers can actually put it in the cart.
 */

/* ---------------------------------- helpers ---------------------------------- */

/** Returns the variant object (price, label, cjItems) or null when the product / variant does not exist. */
function getVariant(id, variant) {
  const product = PRODUCTS_CATALOG[String(id)];
  if (!product) return null;
  return product.variants[variant || 'default'] || null;
}
const getProduct = (id) => PRODUCTS_CATALOG[String(id)] || null;


const BUNDLE_CATEGORY = 'Bundles & Sets';   // every product in this category is a bundle / gift set and is shown in the Bundles sections of index.html and catalog.html
/** All bundles in this file (category "Bundles & Sets"), e.g. #11. Add a bundle to PRODUCTS_CATALOG and it appears on both pages. */
const listBundles = () => Object.values(PRODUCTS_CATALOG).filter((p) => p.category === BUNDLE_CATEGORY);

/** Products ordered for display by the STATIC fallback ranks: ranked first (rank 1, 2, ...), then the rest in id order. */
function listProductsByRank() {
  return Object.values(PRODUCTS_CATALOG).sort((a, b) => {
    const ra = a.bestsellerRank == null ? Infinity : a.bestsellerRank;
    const rb = b.bestsellerRank == null ? Infinity : b.bestsellerRank;
    return ra - rb || Number(a.id) - Number(b.id);
  });
}

/**
 * Storefront-shaped record (the field names catalog.html / product.html already read: img, bestseller, images).
 * Pass the result of computeBestsellerRanking() to use the store's own sales ranking; without it the static fallback fields are used.
 */
function toStorefrontProduct(p, ranking) {
  const r = (ranking && ranking.byId && ranking.byId[p.id]) || { isBestseller: p.isBestseller, bestsellerRank: p.bestsellerRank, bestsellerLabel: p.bestsellerLabel, salesCount: p.salesCount };
  return {
    id: p.id, name: p.name, category: p.category, price: p.variants.default.price,
    desc: p.description, oldPrice: p.oldPrice,
    img: p.image, images: p.images.slice(),
    bestseller: r.isBestseller, bestsellerRank: r.bestsellerRank, bestsellerLabel: r.bestsellerLabel,
    rating: p.rating, salesCount: r.salesCount
  };
}

/** Whole storefront catalog for a ranking, best rank first (unranked products after, by id). */
function buildStorefrontCatalog(ranking) {
  return Object.values(PRODUCTS_CATALOG).map((p) => toStorefrontProduct(p, ranking)).sort((a, b) => {
    const ra = a.bestsellerRank == null ? Infinity : a.bestsellerRank;
    const rb = b.bestsellerRank == null ? Infinity : b.bestsellerRank;
    return ra - rb || Number(a.id) - Number(b.id);
  });
}

/** Cart quantities arrive as `quantity` (API) or `qty` (this site's cart). Always a whole number >= 1. */
const lineQuantity = (item) => Math.floor(Number(item.quantity != null ? item.quantity : item.qty)) || 0;

/** True when a CJ item still contains a placeholder instead of a real vid / sku. */
const hasPlaceholder = (c) => PLACEHOLDER.test(String(c.vid || '')) || (!c.vid && PLACEHOLDER.test(String(c.sku || ''))) || (!c.vid && !c.sku);

/**
 * Converts front-end cart items  [{ id, variant, quantity }]  into the flat list CJ needs  [{ vid, sku, quantity }].
 * Bundle components are expanded and multiplied by the cart quantity; identical CJ items are merged.
 *   cart  [{ id: '11', quantity: 2 }, { id: '1', quantity: 1 }]   (bundle 11 contains one wand)
 *   ->    [{ vid: WAND, quantity: 3 }, { vid: LED_MASK, quantity: 2 }, ...]
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
      const key = c.vid || c.sku;
      const prev = merged.get(key);
      merged.set(key, { vid: c.vid, sku: c.sku, quantity: (prev ? prev.quantity : 0) + c.quantity * qty });
    }
  }
  return Array.from(merged.values());
}

module.exports = { PRODUCTS_CATALOG, BESTSELLER_RANKS, CJ, getProduct, getVariant, listProductsByRank, listBundles, BUNDLE_CATEGORY, toStorefrontProduct, buildStorefrontCatalog, computeBestsellerRanking, BESTSELLER_COUNT, mapCartToCJProducts, hasPlaceholder, lineQuantity };
