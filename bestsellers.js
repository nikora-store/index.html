/**
 * bestsellers.js - shared by index.html and catalog.html so both pages rank, badge and show galleries identically.
 * Data comes from GET /api/catalog (a read-only view of lib/products.js). If that request fails (offline, file://),
 * both pages quietly fall back to whatever the Firebase /products data already says.
 * Load with a plain <script src="bestsellers.js"></script> before the page's main script.
 */
(function (root) {
  'use strict';
  var ENDPOINT = '/api/catalog';
  var TOP_RATED_MIN = 4.5;          // "TOP RATED" only shows for a REAL rating at or above this
  var BUNDLE_CATEGORY = 'Bundles & Sets';
  var SERVER_FIELDS = ['name', 'category', 'price', 'desc', 'oldPrice', 'img', 'images', 'bestseller', 'bestsellerRank', 'bestsellerLabel', 'rating', 'salesCount'];
  var serverList = null, pending = null, rankingSource = null;   // 'sales' = ranked from real store orders, 'fallback' = initial ranks from lib/products.js

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }

  /** Promise<product[]>. Resolves [] (never rejects) when the endpoint is unreachable. */
  function load() {
    if (serverList) return Promise.resolve(serverList);
    if (pending) return pending;
    if (typeof fetch !== 'function') return Promise.resolve([]);
    pending = fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        serverList = (d && Array.isArray(d.products)) ? d.products : [];
        rankingSource = (d && d.source) || null;
        if (rankingSource === 'fallback' && root.console && console.info) console.info('Bestsellers: no store sales logged yet, showing the initial ranking from lib/products.js.');
        pending = null; return serverList;
      })
      .catch(function (err) { console.warn('Bestseller data unavailable, using storefront data.', err); pending = null; return []; });
    return pending;
  }

  var MIN_OWN_IMAGES = 2;   // a product's own gallery (Firebase / local override) is used only when it has at least this many photos; with fewer, the 4 default images from lib/products.js are used instead. Set to 1 to let a single-photo override win.

  /** The gallery set on the product itself (Firebase `images`: array or {0:..,1:..} object), cleaned and de-duplicated.
   *  Returns null when it has fewer than `min` photos (default MIN_OWN_IMAGES), so a missing or 1-photo override falls back to the lib/products.js gallery.
   *  A qualifying list wins over the lib default, so adding or removing images in the admin panel changes every page. */
  function ownImages(p, min) {
    var v = p && p.images, seen = {}, out = [];
    if (v && typeof v === 'object' && !Array.isArray(v)) v = Object.keys(v).sort(function (a, c) { return Number(a) - Number(c); }).map(function (k) { return v[k]; });
    if (!Array.isArray(v)) return null;
    v.forEach(function (u) { if (typeof u !== 'string') return; u = u.trim(); if (u && !seen[u]) { seen[u] = true; out.push(u); } });
    return out.length >= (min == null ? MIN_OWN_IMAGES : min) && out.length ? out : null;
  }
  /** Copy of p with the server record s laid over it; images stay the admin's own list when it has one. */
  function overlayRecord(p, s) {
    var o = {}, k;
    for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
    SERVER_FIELDS.forEach(function (f) { o[f] = s[f]; });
    var own = ownImages(p);
    if (own) { o.images = own; o.img = own[0]; }
    return o;
  }

  /** Overlays lib/products.js data onto a storefront list. Server wins for name, category, price, images and all rank fields;
   *  Firebase keeps desc / oldPrice / lowStock. Products missing from lib/products.js lose their bestseller flag. No-op until load() succeeded. */
  function apply(list) {
    list = Array.isArray(list) ? list : [];
    if (!serverList || !serverList.length) return list;
    var byId = {}, seen = {}, k;
    serverList.forEach(function (s) { byId[String(s.id)] = s; });
    var out = list.map(function (p) {
      if (!p) return p;
      var s = byId[String(p.id)], o = {};
      for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
      if (!s) { o.bestseller = false; o.bestsellerRank = null; o.bestsellerLabel = null; return o; }
      seen[String(p.id)] = true;
      return overlayRecord(p, s);
    });
    serverList.forEach(function (s) {
      if (seen[String(s.id)]) return;
      var o = { desc: '' };
      for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k];
      out.push(o);
    });
    return out;
  }

  /** One product with lib/products.js data laid over it (name, category, price, was-price, description, images, rank fields).
   *  Used by product.html so the detail page shows exactly what the home page and catalog show. Returns the same object until load() has succeeded. */
  function overlayOne(p) {
    if (!p || !serverList || !serverList.length) return p;
    var s = get(p.id), o = {}, k;
    if (s) return overlayRecord(p, s);
    for (k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
    o.bestseller = false; o.bestsellerRank = null; o.bestsellerLabel = null;
    return o;
  }

  /** Sort comparator: bestsellerRank 1, 2, 3 ... then unranked products by id. */
  function compare(a, b) {
    var ra = num(a.bestsellerRank), rb = num(b.bestsellerRank);
    if (ra === null) ra = Infinity;
    if (rb === null) rb = Infinity;
    return (ra - rb) || (Number(a.id) - Number(b.id));   // Infinity - Infinity is NaN, which falls through to the id compare
  }
  /** Only the "Bundles & Sets" products (e.g. #11), best rank first, then by id. */
  function bundles(list) { return (list || []).filter(function (p) { return p && p.category === BUNDLE_CATEGORY; }).sort(compare); }

  /** Only bestsellers, best rank first. */
  function ranked(list) { return (list || []).filter(function (p) { return p && p.bestseller; }).sort(compare); }

  /** Badge texts for a product, e.g. ['BESTSELLER', 'TOP BUNDLE']. TOP RATED needs a real rating, so it stays hidden while rating is null. */
  function badges(p) {
    var out = [];
    if (p.bestseller) {
      out.push('BESTSELLER');
      if (p.bestsellerLabel && !/bestseller/i.test(p.bestsellerLabel)) out.push(String(p.bestsellerLabel).toUpperCase());
    }
    var r = num(p.rating);
    if (r !== null && r >= TOP_RATED_MIN) out.push('TOP RATED');
    return out;
  }

  /** The server's record (from lib/products.js) for one product id, or null until load() has succeeded. */
  function get(id) {
    if (!serverList) return null;
    for (var i = 0; i < serverList.length; i++) if (String(serverList[i].id) === String(id)) return serverList[i];
    return null;
  }

  function imagesOf(p) {
    var own = ownImages(p);
    if (own) return own;
    var one = p.img || p.image || (ownImages(p, 1) || [])[0];
    return one ? [one] : [];
  }
  function thumbUrl(u, size) {
    u = String(u); size = size || 120;
    if (u.indexOf('images.unsplash.com') === -1) return u;
    var parts = u.split('?'), m = (parts[1] || '').match(/crop=([a-z]+)/);
    return parts[0] + '?w=' + size + '&h=' + size + '&fit=crop&crop=' + (m ? m[1] : 'entropy') + '&q=70';
  }
  /** Thumbnail strip (empty string when the product has a single image). */
  function thumbsHtml(p) {
    var imgs = imagesOf(p);
    if (imgs.length < 2) return '';
    return '<div class="bs-thumbs" role="group" aria-label="Product images">' + imgs.map(function (src, i) {
      return '<button type="button" class="bs-thumb' + (i === 0 ? ' is-active' : '') + '" data-src="' + esc(src) + '" aria-label="Show image ' + (i + 1) + ' of ' + imgs.length + '">' +
        '<img src="' + esc(thumbUrl(src)) + '" alt="" loading="lazy" draggable="false"></button>';
    }).join('') + '</div>';
  }

  function setImage(card, src) {
    var img = card.querySelector('[data-bs-main]');
    if (!img || !src) return;
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    var t = card.querySelectorAll('.bs-thumb');
    for (var i = 0; i < t.length; i++) t[i].classList.toggle('is-active', t[i].getAttribute('data-src') === src);
  }
  /** Hover / focus / tap a thumbnail to swap the main image; leaving the card restores image 1. Needs [data-bs-card] on the card and [data-bs-main][data-bs-src0] on its main <img>. Safe to call repeatedly. */
  function bindGallery(rootEl) {
    if (!rootEl || rootEl.getAttribute('data-bs-bound')) return;
    rootEl.setAttribute('data-bs-bound', '1');
    function show(e) {
      var t = e.target.closest && e.target.closest('.bs-thumb');
      var card = (t || e.target).closest && (t || e.target).closest('[data-bs-card]');
      if (!card) return;
      if (t) { setImage(card, t.getAttribute('data-src')); return; }
      /* hovering the card's own image previews the 2nd image (unless a thumbnail was already chosen) */
      if (e.type === 'mouseover' && e.target.closest('.bs-media, .card-media')) {
        var th = card.querySelectorAll('.bs-thumb'), img = card.querySelector('[data-bs-main]');
        if (th.length > 1 && img && img.getAttribute('src') === img.getAttribute('data-bs-src0')) setImage(card, th[1].getAttribute('data-src'));
      }
    }
    rootEl.addEventListener('mouseover', show);
    rootEl.addEventListener('focusin', show);
    rootEl.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.bs-thumb')) { e.preventDefault(); show(e); } });
    rootEl.addEventListener('mouseout', function (e) {
      var card = e.target.closest && e.target.closest('[data-bs-card]');
      if (!card || (e.relatedTarget && card.contains(e.relatedTarget))) return;
      var img = card.querySelector('[data-bs-main]');
      if (img) setImage(card, img.getAttribute('data-bs-src0'));
    });
  }

  var api = { source: function () { return rankingSource; }, ownImages: ownImages, overlayOne: overlayOne, bundles: bundles, load: load, get: get, thumbUrl: thumbUrl, apply: apply, compare: compare, ranked: ranked, badges: badges, imagesOf: imagesOf, thumbsHtml: thumbsHtml, bindGallery: bindGallery, esc: esc };
  root.NKBestsellers = api;
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; api._setServerList = function (l) { serverList = l; }; }
})(typeof window !== 'undefined' ? window : this);
