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
  wand         : cjRef('WAND'),
  sculptor     : cjRef('SCULPTOR'),
  poreCleaner  : cjRef('PORECLEANER'),
  ledMask      : cjRef('LEDMASK'),
  bodySculptor : cjRef('BODYSCULPTOR'),
  eyeMassager  : cjRef('EYEMASSAGER'),
  scrubber     : cjRef('SCRUBBER'),
  neckMassager : cjRef('NECKMASSAGER'),
  iceRoller    : cjRef('ICEROLLER'),
  rfDevice     : cjRef('RFDEVICE'),
};

/** productId -> product. Ids are the storefront's ids (see product.html DEFAULT_CATALOG). */
const PRODUCTS_CATALOG = {
  '1': {
    id: '1', type: 'single', name: "NIKORA RED Light & EMS Facial Wand 4-in-1", category: "Facial Wand", image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600",
    variants: { default: { label: 'Standard', price: 34.99, cjItems: [{ ...CJ.wand, quantity: 1 }] } }
  },
  '2': {
    id: '2', type: 'single', name: "3D EMS Gua Sha Sculptor", category: "Sculptors", image: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=600",
    variants: { default: { label: 'Standard', price: 24.99, cjItems: [{ ...CJ.sculptor, quantity: 1 }] } }
  },
  '3': {
    id: '3', type: 'single', name: "Hydro-Vacuum Pore Cleaner", category: "Cleansing", image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600",
    variants: { default: { label: 'Standard', price: 29.99, cjItems: [{ ...CJ.poreCleaner, quantity: 1 }] } }
  },
  '4': {
    id: '4', type: 'single', name: "LED Therapy Mask 7-in-1 Pro", category: "LED Therapy", image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600",
    variants: { default: { label: 'Standard', price: 49.99, cjItems: [{ ...CJ.ledMask, quantity: 1 }] } }
  },
  '5': {
    id: '5', type: 'single', name: "EMS Body Sculptor RF", category: "Body Care", image: "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=600",
    variants: { default: { label: 'Standard', price: 59.99, cjItems: [{ ...CJ.bodySculptor, quantity: 1 }] } }
  },
  '6': {
    id: '6', type: 'single', name: "Sonic Eye Massager", category: "Eye Care", image: "https://images.unsplash.com/photo-1608248597261-83325b6ba584?w=600",
    variants: { default: { label: 'Standard', price: 19.99, cjItems: [{ ...CJ.eyeMassager, quantity: 1 }] } }
  },
  '7': {
    id: '7', type: 'single', name: "Ultrasonic Skin Scrubber", category: "Cleansing", image: "https://images.unsplash.com/photo-1556228722-d119f018d480?w=600",
    variants: { default: { label: 'Standard', price: 24.99, cjItems: [{ ...CJ.scrubber, quantity: 1 }] } }
  },
  '8': {
    id: '8', type: 'single', name: "Thermal Neck & Face Massager", category: "Sculptors", image: "https://images.unsplash.com/photo-1567928254714-3a216c5b969d?w=600",
    variants: { default: { label: 'Standard', price: 39.99, cjItems: [{ ...CJ.neckMassager, quantity: 1 }] } }
  },
  '9': {
    id: '9', type: 'single', name: "Cryo Ice Roller", category: "Cooling Therapy", image: "https://images.unsplash.com/photo-1512290900673-10705a3962d3?w=600",
    variants: { default: { label: 'Standard', price: 19.99, cjItems: [{ ...CJ.iceRoller, quantity: 1 }] } }
  },
  '10': {
    id: '10', type: 'single', name: "RF Anti-Aging Device", category: "Anti-Aging", image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600",
    variants: { default: { label: 'Standard', price: 69.99, cjItems: [{ ...CJ.rfDevice, quantity: 1 }] } }
  },
  '11': {
    id: '11', type: 'bundle', name: "NIKORA Ultimate Glow Ritual Set (Full Gadget Bundle)", category: "Bundles & Sets", image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600",
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
 * EXAMPLES of other shapes you can add (copy, rename, fill in the real CJ values):
 *
 * A "Duo Pack" = 2x the same device, sold as an extra variant of product 1 (cart line: { id: '1', variant: 'duo', quantity: 1 }):
 *   PRODUCTS_CATALOG['1'].variants.duo = { label: 'Duo Pack (2 devices)', price: 59.99, cjItems: [{ ...CJ.wand, quantity: 2 }] };
 *
 * A "Starter Bundle" = 1 device + 2 conductive gels (add a CJ.gel component first):
 *   PRODUCTS_CATALOG['12'] = { id: '12', type: 'bundle', name: 'Starter Bundle', category: 'Bundles & Sets', image: 'https://...',
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

module.exports = { PRODUCTS_CATALOG, CJ, getProduct, getVariant, mapCartToCJProducts, hasPlaceholder, lineQuantity };
