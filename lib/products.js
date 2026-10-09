// lib/products.js

export const PRODUCTS_CATALOG = {
  // ID товару, який використовується на checkout.html
  "nikora-pro": {
    id: "nikora-pro",
    title: "NIKORA Pro Facial Lifting Device",
    price: 89.99,
    variants: {
      "obsidian-black": {
        name: "Obsidian Black",
        cjVid: "ВСТАВТЕ_СЮДИ_CJ_VID_ДЛЯ_ЧОРНОГО", // Наприклад: "E16629384750121"
        cjSku: "ВСТАВТЕ_СЮДИ_CJ_SKU_ДЛЯ_ЧОРНОГО",
        image: "/assets/images/nikora-black.png"
      },
      "rose-gold": {
        name: "Rose Gold",
        cjVid: "ВСТАВТЕ_СЮДИ_CJ_VID_ДЛЯ_РОЖЕВОГО",
        cjSku: "ВСТАВТЕ_СЮДИ_CJ_SKU_ДЛЯ_РОЖЕВОГО",
        image: "/assets/images/nikora-rose.png"
      }
    }
  }
};

/**
 * Отримати дані варіанта для передачі в CJ Dropshipping API
 */
export function getCJItemDetails(productId, variantKey) {
  const product = PRODUCTS_CATALOG[productId];
  if (!product) throw new Error(`Product ${productId} not found in catalog`);
  
  const variant = product.variants[variantKey] || Object.values(product.variants)[0];
  
  return {
    vid: variant.cjVid,
    sku: variant.cjSku,
    title: `${product.title} - ${variant.name}`,
    price: product.price
  };
}
