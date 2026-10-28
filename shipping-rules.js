/**
 * shipping-rules.js - the ONE place that defines NIKORA's shipping rules. Loaded by every storefront page, the cart drawers and checkout.html.
 *
 *   Cost:      orders of $50.00 and above ship FREE (Express); below $50.00 a flat $4.99 is charged ONCE per order, even when the order
 *              ships in several packages. The amount compared is the payable subtotal after any promo discount, before tax.
 *   Suppliers: K-Dropshipping (K-Beauty, products 1-7): processing 1-3 business days, transit 7-15 business days.
 *              QKSource (beauty devices, products 8-9): processing 1-3 business days, transit 3-7 business days (US: SpeedX, GOFO Express, UNI or USPS).
 *              Product 10 (Glass Skin Ritual Set) ships as 2 packages: one from K-Dropshipping and one from QKSource.
 *   Products added later in the admin panel (ids above 10) have no supplier mapping yet, so no estimate is shown for them: add them to MAP below.
 *
 * Keep these numbers identical to the server's own shipping calculation (the checkout API), which is the amount actually charged.
 */
(function (root) {
  'use strict';
  var FREE_AT = 50, FLAT = 4.99;
  var SUPPLIERS = {
    kd: { name: 'K-Dropshipping', what: 'K-Beauty', process: [1, 3], transit: [7, 15] },
    qk: { name: 'QKSource', what: 'beauty devices', process: [1, 3], transit: [3, 7] }
  };
  var MAP = { '1': ['kd'], '2': ['kd'], '3': ['kd'], '4': ['kd'], '5': ['kd'], '6': ['kd'], '7': ['kd'], '8': ['qk'], '9': ['qk'], '10': ['kd', 'qk'] };

  function money(n) { return '$' + Number(n).toFixed(2); }
  function suppliersOf(id) { return MAP[String(id)] ? MAP[String(id)].slice() : []; }
  function total(k) { var s = SUPPLIERS[k]; return [s.process[0] + s.transit[0], s.process[1] + s.transit[1]]; }
  function rng(r) { return r[0] + '\u2013' + r[1]; }
  /** Shipping fee for a payable amount (after discount): 0 from $50.00, else 4.99. Cent-exact. */
  function cost(amount) { return Math.round((Number(amount) || 0) * 100) >= FREE_AT * 100 ? 0 : FLAT; }
  /** Distinct supplier keys needed by a list of cart items ({id}); 2 keys = the order ships in 2 packages. */
  function packagesOf(items) {
    var seen = {}, out = [];
    (items || []).forEach(function (it) { suppliersOf(it && it.id).forEach(function (k) { if (!seen[k]) { seen[k] = 1; out.push(k); } }); });
    return out;
  }
  /** [{key, name, what, total:[min,max]}] for a cart. */
  function shipmentsOf(items) {
    return packagesOf(items).map(function (k) { return { key: k, name: SUPPLIERS[k].name, what: SUPPLIERS[k].what, total: total(k) }; });
  }
  /** One-line estimate for a product page / card, or null when the product has no supplier mapping. */
  function cardLine(id) {
    var s = suppliersOf(id);
    if (!s.length) return null;
    if (s.length === 1) return 'Est. delivery: ' + rng(total(s[0])) + ' business days';
    return 'Ships in 2 packages \u00b7 ' + rng([Math.min(total('kd')[0], total('qk')[0]), Math.max(total('kd')[1], total('qk')[1])]) + ' business days';
  }
  function productLine(id) {
    var s = suppliersOf(id);
    if (!s.length) return null;
    var costTxt = ' Express shipping is FREE on orders of ' + money(FREE_AT) + '+, otherwise a ' + money(FLAT) + ' flat rate per order.';
    if (s.length === 1) {
      var k = s[0], S = SUPPLIERS[k];
      return 'Ships from ' + S.name + ': processed in ' + rng(S.process) + ' business days, then ' + rng(S.transit) + ' business days of tracked transit (about ' + rng(total(k)) + ' business days in total).' + costTxt;
    }
    return 'This set ships in 2 packages with separate tracking: the K-Beauty items from K-Dropshipping (about ' + rng(total('kd')) + ' business days) and the device from QKSource (about ' + rng(total('qk')) + ' business days). They may arrive on different days.' + costTxt;
  }
  function cartNote(items) {
    var p = shipmentsOf(items);
    if (!p.length) return '';
    if (p.length === 1) return 'Ships from ' + p[0].name + ' \u00b7 est. delivery ' + rng(p[0].total) + ' business days';
    return 'Ships in 2 separate packages \u2014 shipping fee applies only once.';
  }
  /** Updates a cart drawer's free-shipping progress (text + bar + split-package note). payable = subtotal after discount. */
  function renderProgress(textEl, fillEl, payable, count, items, icons) {
    if (!textEl || !fillEl) return;
    var cents = Math.round((Number(payable) || 0) * 100), thr = FREE_AT * 100;
    var unlocked = cents >= thr, pct = Math.min(100, Math.round(cents / thr * 100));
    fillEl.style.width = pct + '%';
    textEl.classList.toggle('unlocked', unlocked);
    fillEl.classList.toggle('unlocked', unlocked);
    var bar = fillEl.parentNode;
    if (bar) { bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); bar.setAttribute('aria-valuenow', String(pct)); bar.setAttribute('aria-label', 'Progress toward free Express shipping'); }
    var msg = unlocked ? 'You\u2019ve unlocked FREE Express Shipping!'
      : (count > 0 ? 'Add ' + money((thr - cents) / 100) + ' more to unlock FREE Express Shipping (otherwise ' + money(FLAT) + ' flat rate)'
        : 'FREE Express Shipping on orders of ' + money(FREE_AT) + '+ \u00b7 ' + money(FLAT) + ' flat rate below');
    textEl.innerHTML = (icons ? icons[unlocked ? 'check' : 'truck'] : '') + msg;
    var note = document.getElementById('ship-split-note');
    if (!note && textEl.parentNode && bar) { note = document.createElement('div'); note.id = 'ship-split-note'; note.className = 'ship-split-note'; textEl.parentNode.insertBefore(note, bar.nextSibling); }
    if (note) { var t = count > 0 ? cartNote(items) : ''; note.textContent = t; note.hidden = !t; }
  }

  if (typeof document !== 'undefined') {
    var st = document.createElement('style');
    st.textContent = '.ship-split-note{margin:8px 0 0;font-size:11.5px;line-height:1.5;color:var(--text-soft,#8a8493)}.ship-split-note[hidden]{display:none}' +
      '.nk-card .nk-ship{margin:-6px 0 12px;font-size:11px;line-height:1.4;color:var(--text-faint,#8a8493)}';
    (document.head || document.documentElement).appendChild(st);
  }
  root.NKShipping = { FREE_AT: FREE_AT, FLAT: FLAT, SUPPLIERS: SUPPLIERS, MAP: MAP, cost: cost, suppliersOf: suppliersOf, packagesOf: packagesOf, shipmentsOf: shipmentsOf,
    total: total, range: rng, cardLine: cardLine, productLine: productLine, cartNote: cartNote, renderProgress: renderProgress };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NKShipping;
})(typeof window !== 'undefined' ? window : this);
