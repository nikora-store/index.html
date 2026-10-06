/*!
 * NIKORA reviews-data.js
 * Lightweight review store (localStorage key 'nikora_reviews') + renderers for index.html and reviews.html.
 *
 * Public API (namespaced on window.NikoraReviews, never as bare globals, so it cannot clobber the
 * getReviews()/renderReviews() functions that index.html already defines):
 *   getReviews()                         -> Array   all stored reviews (newest first)
 *   addReview(newReview [, opts])        -> Array   unshifts a review, fires 'reviewsUpdated', returns the new array
 *   setReviews(list)                     -> Array   replaces the cache (use it to mirror Firebase), fires 'reviewsUpdated'
 *   getStats()                           -> {count, average, verified}  computed only from real stored reviews
 *   renderHomepageReviews(id [, opts])   -> Array   top 3-4 reviews (highest rated, then latest)
 *   renderAllReviews(id [, filters])     -> {total, page, pages, pageSize}  filtered + paginated list
 *
 * Review shape (all fields optional except name, rating and text):
 *   { id, name, avatar (https/data-image URL, else an SVG initials badge is drawn), rating 1-5, text,
 *     verified (boolean), product, country, createdAt (ms), date (display string), photos: [url, ...] }
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'nikora_reviews';
  var EVENT_NAME = 'reviewsUpdated';
  var MAX_STORED = 500;

  /* ---------------------------------------------------------------------------------------------
     DEFAULT DATA
     Seeded into localStorage only when the 'nikora_reviews' key does not exist yet.
     Intentionally EMPTY: only add reviews written by real customers who agreed to be shown.
     Fabricated reviews (especially with "Verified Buyer" badges) are fake testimonials. Template:
       { name: 'Customer Name', rating: 5, text: 'Their own words.', verified: true,
         product: 'Product name', country: 'Country', createdAt: Date.parse('2026-09-12'),
         avatar: 'https://.../photo.jpg', photos: ['https://.../result.jpg'] }
     --------------------------------------------------------------------------------------------- */
  var DEFAULT_REVIEWS = [];

  var mem = null;          /* in-memory source of truth (keeps photos even when storage quota is tight) */
  var registry = {};       /* containerId -> how it was rendered, so it can re-render on updates */
  var pageState = {};      /* containerId -> { key, page } */

  /* ---------------- tiny utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function byId(id) { return typeof id === 'string' ? document.getElementById(id) : null; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function makeId() { return 'r-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36); }
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return 'N';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }

  /* only these URL shapes are ever rendered (blocks javascript: and other schemes) */
  var RE_DATA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/;
  var RE_HTTPS = /^https:\/\/[^\s"'<>\\]+$/i;
  var RE_LOCAL = /^(?!\/\/)[\w\-.\/]+\.(png|jpe?g|webp|gif|svg|avif)$/i;
  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    return (RE_DATA.test(u) || RE_HTTPS.test(u) || RE_LOCAL.test(u)) ? u : '';
  }

  /* ---------------- storage ---------------- */
  function lsGet() { try { return global.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
  function lsSet(str) { try { global.localStorage.setItem(STORAGE_KEY, str); return true; } catch (e) { return false; } }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var rating = Math.round(Number(raw.rating));
    var text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!(rating >= 1 && rating <= 5) || !text) return null;

    var r = {};
    Object.keys(raw).forEach(function (k) { r[k] = raw[k]; });          /* keep extra fields (e.g. Firebase _path) */
    r.id = (raw.id != null && raw.id !== '') ? String(raw.id) : makeId();
    r.name = (typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Anonymous').slice(0, 60);
    r.text = text.slice(0, 1500);
    r.rating = rating;
    r.verified = raw.verified === true;
    r.avatar = safeUrl(raw.avatar);
    r.product = typeof raw.product === 'string' ? raw.product.trim().slice(0, 80) : '';
    r.country = typeof raw.country === 'string' ? raw.country.trim().slice(0, 40) : '';

    var ct = Number(raw.createdAt);
    if (!(ct > 0)) { var p = Date.parse(raw.date); ct = isNaN(p) ? 0 : p; }
    r.createdAt = ct;

    var list = [];
    function add(v) { var s = safeUrl(v); if (s && list.indexOf(s) === -1) list.push(s); }
    if (Array.isArray(raw.photos)) raw.photos.forEach(add);
    else if (raw.photos && typeof raw.photos === 'object') Object.keys(raw.photos).forEach(function (k) { add(raw.photos[k]); });
    add(raw.photo);
    r.photos = list.slice(0, 4);
    if (r.photos.length) r.photo = r.photos[0]; else delete r.photo;
    return r;
  }

  function byRecent(a, b) { return (b.createdAt - a.createdAt) || (a.id < b.id ? 1 : -1); }

  function persist() {
    if (lsSet(JSON.stringify(mem))) return true;
    /* quota exceeded: keep a text-only copy (the in-memory list still has the images this session) */
    var slim = mem.map(function (r) {
      var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; });
      delete c.photos; delete c.photo;
      if (/^data:/.test(c.avatar || '')) c.avatar = '';
      return c;
    });
    return lsSet(JSON.stringify(slim));
  }

  function load() {
    if (mem) return mem;
    var raw = lsGet();
    if (raw !== null) {
      try {
        var parsed = JSON.parse(raw);
        mem = Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean).sort(byRecent) : [];
        return mem;
      } catch (e) { /* corrupt value: fall through and re-seed */ }
    }
    mem = DEFAULT_REVIEWS.map(normalize).filter(Boolean).sort(byRecent);
    persist();
    return mem;
  }

  function emit(detail) {
    var ev;
    try { ev = new CustomEvent(EVENT_NAME, { detail: detail, bubbles: true }); }
    catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent(EVENT_NAME, true, false, detail); }
    document.dispatchEvent(ev);
  }

  function signature(list) {
    return list.map(function (r) {
      return r.id + ':' + r.rating + ':' + (r.verified ? 1 : 0) + ':' + r.text.length + ':' + (r.photos ? r.photos.length : 0);
    }).join('|');
  }

  /* ---------------- public data API ---------------- */
  function getReviews() { return load().slice(); }

  /* opts.trusted === true (server-verified flows only) lets `verified: true` through.
     Everyone else is stored as unverified, so the Verified Buyer badge can't be self-claimed. */
  function addReview(newReview, opts) {
    var src = (newReview && typeof newReview === 'object') ? newReview : {};
    var trusted = !!(opts && opts.trusted === true);
    var c = {}; Object.keys(src).forEach(function (k) { c[k] = src[k]; });
    c.id = makeId();
    c.verified = trusted ? src.verified === true : false;
    if (!(Number(c.createdAt) > 0)) c.createdAt = Date.now();
    if (!c.date) c.date = new Date(c.createdAt).toLocaleDateString('en-US');
    if (typeof c.name !== 'string' || !c.name.trim()) throw new Error('addReview: "name" is required.');
    var r = normalize(c);
    if (!r) throw new Error('addReview: a rating from 1 to 5 and some review text are required.');

    load();
    mem.unshift(r);
    if (mem.length > MAX_STORED) mem.length = MAX_STORED;
    persist();
    emit({ reviews: mem.slice(), added: r, source: 'add' });
    return mem.slice();
  }

  /* replace the whole cache, e.g. mirror the live Firebase list so every page shows the same reviews */
  function setReviews(list) {
    var next = (Array.isArray(list) ? list : []).map(normalize).filter(Boolean).sort(byRecent).slice(0, MAX_STORED);
    load();
    if (signature(next) === signature(mem)) return mem.slice();     /* nothing changed: avoid needless re-renders */
    mem = next;
    persist();
    emit({ reviews: mem.slice(), source: 'set' });
    return mem.slice();
  }

  function getStats(list) {
    var l = list || load(), count = 0, sum = 0, verified = 0;
    l.forEach(function (r) { count++; sum += r.rating; if (r.verified) verified++; });
    return { count: count, average: count ? Math.round(sum / count * 10) / 10 : 0, verified: verified };
  }

  /* ---------------- rendering ---------------- */
  var CSS = [
    '.nkrv-root{color:var(--text,#1c1917);font-family:inherit}',
    '.nkrv-sum{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:0 0 22px}',
    ".nkrv-score{font-family:'Playfair Display',serif;font-size:38px;font-weight:600;line-height:1}",
    '.nkrv-score small{font-size:17px;font-weight:500;color:var(--text-soft,#6b625a)}',
    '.nkrv-sum-meta{font-size:13px;line-height:1.5;color:var(--text-soft,#6b625a)}',
    '.nkrv-status{font-size:13px;color:var(--text-faint,#8f867e);margin:0 2px 18px}',
    '.nkrv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:20px;align-items:start}',
    '.nkrv-card{box-sizing:border-box;padding:22px;border-radius:24px;background:var(--card-bg,rgba(255,255,255,.7));border:1px solid var(--card-border,rgba(0,0,0,.08));box-shadow:var(--shadow-ambient,0 14px 34px -22px rgba(0,0,0,.4));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}',
    '.nkrv-head{display:flex;align-items:flex-start;gap:13px}',
    '.nkrv-avatar{display:block;flex:none;width:48px;height:48px;border-radius:50%;overflow:hidden;border:1.5px solid rgba(var(--gold-rgb,201,161,91),.55)}',
    '.nkrv-avatar img,.nkrv-avatar svg{display:block;width:100%;height:100%}',
    '.nkrv-avatar img{object-fit:cover}',
    '.nkrv-avatar text{font-family:"Playfair Display",serif;font-weight:600;font-size:19px;fill:var(--text,#1c1917)}',
    '.nkrv-h0 circle{fill:rgba(var(--gold-rgb,201,161,91),.42)}.nkrv-h1 circle{fill:rgba(var(--rose-rgb,201,120,130),.38)}',
    '.nkrv-h2 circle{fill:rgba(var(--gold-rgb,201,161,91),.3)}.nkrv-h3 circle{fill:rgba(var(--rose-rgb,201,120,130),.26)}',
    '.nkrv-h4 circle{fill:rgba(var(--gold-rgb,201,161,91),.55)}.nkrv-h5 circle{fill:rgba(var(--rose-rgb,201,120,130),.5)}',
    '.nkrv-who{min-width:0;flex:1}',
    '.nkrv-name-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.nkrv-name{font-weight:700;font-size:14.5px;line-height:1.25;overflow-wrap:anywhere}',
    '.nkrv-ver{display:inline-flex;align-items:center;gap:4px;padding:3px 9px 3px 7px;border-radius:100px;font-size:10.5px;font-weight:700;white-space:nowrap;color:var(--success,#2e6b4f);background:rgba(46,107,79,.12)}',
    '.nkrv-ver svg{width:12px;height:12px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
    '.nkrv-meta{margin-top:5px;font-size:11.5px;color:var(--text-faint,#8f867e)}',
    '.nkrv-rating{display:flex;align-items:center;gap:8px;margin:15px 0 8px}',
    '.nkrv-stars{display:flex;gap:2px}.nkrv-stars svg{width:15px;height:15px}',
    '.nkrv-prod{margin:0 0 9px;font-size:12px;font-weight:600;color:var(--gold,#c9a15b)}',
    '.nkrv-text{margin:0;font-size:13.5px;line-height:1.7;color:var(--text-soft,#6b625a);overflow-wrap:anywhere;white-space:pre-line}',
    '.nkrv-clamp .nkrv-text{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}',
    '.nkrv-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}',
    '.nkrv-photo{width:78px;height:78px;padding:0;border-radius:12px;overflow:hidden;cursor:pointer;border:1px solid var(--card-border,rgba(0,0,0,.1));background:transparent}',
    '.nkrv-photo img{display:block;width:100%;height:100%;object-fit:cover;transition:transform .25s ease}',
    '.nkrv-photo:hover img{transform:scale(1.06)}.nkrv-photo:focus-visible{outline:2px solid var(--gold,#c9a15b);outline-offset:2px}',
    '.nkrv-foot{margin-top:14px}',
    '.nkrv-empty{padding:40px 24px;text-align:center;border-radius:24px;background:var(--card-bg,rgba(255,255,255,.7));border:1px solid var(--card-border,rgba(0,0,0,.08))}',
    ".nkrv-empty h3{margin:0 0 8px;font-family:'Playfair Display',serif;font-weight:500;font-size:23px}",
    '.nkrv-empty p{margin:0 auto 18px;max-width:400px;font-size:14px;line-height:1.65;color:var(--text-soft,#6b625a)}',
    '.nkrv-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:15px 28px;border-radius:100px;font:inherit;font-size:13px;font-weight:700;letter-spacing:.02em;text-decoration:none;cursor:pointer;color:var(--canvas,#fff);background:var(--text,#1c1917);border:1px solid var(--text,#1c1917);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}',
    '.nkrv-btn:hover{transform:translateY(-1px);box-shadow:0 14px 28px -16px rgba(0,0,0,.55)}',
    '.nkrv-btn-ghost{color:var(--text,#1c1917);background:var(--card-bg,rgba(255,255,255,.7));border-color:var(--card-border,rgba(0,0,0,.14));-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}',
    '.nkrv-btn-ghost:hover{border-color:var(--gold,#c9a15b);box-shadow:none}',
    '.nkrv-btn svg{width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.nkrv-empty .nkrv-ico{display:grid;place-items:center;width:62px;height:62px;margin:0 auto 18px;border-radius:50%;color:var(--gold,#c9a15b);background:rgba(var(--gold-rgb,201,161,91),.14)}',
    '.nkrv-empty .nkrv-ico svg{width:30px;height:30px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
    '.nkrv-more-row{text-align:center;margin-top:26px}',
    '.nkrv-pager{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;margin-top:26px}',
    '.nkrv-pg{min-width:42px;height:42px;padding:0 14px;border-radius:100px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;color:var(--text,#1c1917);background:var(--card-bg,rgba(255,255,255,.7));border:1px solid var(--line,rgba(0,0,0,.12))}',
    '.nkrv-pg:hover:not([disabled]){border-color:var(--gold,#c9a15b)}',
    '.nkrv-pg[aria-current="page"]{background:var(--text,#1c1917);color:var(--canvas,#fff);border-color:var(--text,#1c1917)}',
    '.nkrv-pg[disabled]{opacity:.4;cursor:default}.nkrv-dots{color:var(--text-faint,#8f867e)}',
    '.nkrv-lb{position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;padding:24px;background:rgba(10,8,12,.9)}',
    '.nkrv-lb.on{display:flex}.nkrv-lb img{max-width:100%;max-height:100%;border-radius:12px}',
    '.nkrv-lb button{position:absolute;top:18px;right:18px;width:44px;height:44px;border-radius:50%;border:none;cursor:pointer;font-size:22px;line-height:1;color:#fff;background:rgba(255,255,255,.16)}'
  ].join('\n');

  function injectStyles() {
    if (document.getElementById('nkrv-style')) return;
    var s = document.createElement('style');
    s.id = 'nkrv-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>';
  var STAR = 'M12 2l2.9 6.6L22 9.3l-5 5 1.2 7.1L12 18l-6.2 3.4L7 14.3l-5-5 7.1-.7z';

  function starsHtml(n) {
    var out = '<span class="nkrv-stars" role="img" aria-label="Rated ' + n + ' out of 5">';
    for (var i = 1; i <= 5; i++) {
      out += '<svg viewBox="0 0 24 24" aria-hidden="true" style="fill:' + (i <= n ? 'var(--gold,#c9a15b)' : 'none') +
        ';stroke:' + (i <= n ? 'none' : 'var(--text-faint,#8f867e)') + ';stroke-width:1.5"><path d="' + STAR + '"/></svg>';
    }
    return out + '</span>';
  }

  function avatarHtml(r) {
    if (r.avatar) {
      return '<span class="nkrv-avatar"><img src="' + esc(r.avatar) + '" alt="' + esc(r.name) + ' profile photo" loading="lazy"></span>';
    }
    return '<span class="nkrv-avatar nkrv-h' + (hash(r.name) % 6) + '" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false">' +
      '<circle cx="24" cy="24" r="24"/><text x="24" y="25" text-anchor="middle" dominant-baseline="central">' + esc(initials(r.name)) + '</text></svg></span>';
  }

  function dateText(r) {
    if (r.createdAt > 0) return new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return typeof r.date === 'string' ? r.date : '';
  }

  function cardHtml(r, o) {
    var meta = [r.country, dateText(r)].filter(Boolean).map(esc).join(' \u00b7 ');
    var thumbs = (r.photos || []).map(function (src, i) {
      return '<button type="button" class="nkrv-photo" data-nkrv-src="' + esc(src) + '" aria-label="Open photo ' + (i + 1) + ' from ' + esc(r.name) + '">' +
        '<img src="' + esc(src) + '" alt="" loading="lazy"></button>';
    }).join('');
    var footer = (o && typeof o.cardFooter === 'function') ? o.cardFooter(r) : '';
    return '<article class="nkrv-card' + (o && o.clamp ? ' nkrv-clamp' : '') + '">' +
      '<div class="nkrv-head">' + avatarHtml(r) +
        '<div class="nkrv-who"><div class="nkrv-name-row"><span class="nkrv-name">' + esc(r.name) + '</span>' +
          (r.verified ? '<span class="nkrv-ver">' + CHECK + 'Verified Buyer</span>' : '') + '</div>' +
          (meta ? '<div class="nkrv-meta">' + meta + '</div>' : '') + '</div></div>' +
      '<div class="nkrv-rating">' + starsHtml(r.rating) + '</div>' +
      (r.product ? '<p class="nkrv-prod">' + esc(r.product) + '</p>' : '') +
      '<p class="nkrv-text">' + esc(r.text) + '</p>' +
      (thumbs ? '<div class="nkrv-thumbs">' + thumbs + '</div>' : '') +
      (footer ? '<div class="nkrv-foot">' + footer + '</div>' : '') +
    '</article>';
  }

  function emptyHtml(title, msg, linkHref, linkLabel) {
    return '<div class="nkrv-empty"><div class="nkrv-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR + '"/></svg></div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(msg) + '</p>' +
      (linkHref ? '<a class="nkrv-btn" href="' + esc(linkHref) + '">' + esc(linkLabel) + '</a>' : '') + '</div>';
  }

  function summaryHtml(list) {
    var st = getStats(list);
    if (!st.count) return '';
    return '<div class="nkrv-sum"><div class="nkrv-score">' + st.average.toFixed(1) + '<small>/5</small></div><div>' +
      starsHtml(Math.round(st.average)) + '<div class="nkrv-sum-meta">Based on <strong>' + st.count + '</strong> customer review' + (st.count === 1 ? '' : 's') +
      '</div></div></div>';
  }

  /* Top 3-4 reviews, highest rated first and then the most recent. */
  function renderHomepageReviews(containerId, options) {
    var el = byId(containerId);
    if (!el) return [];
    injectStyles();
    var o = options || {};
    registry[containerId] = { type: 'home', args: [containerId, options] };
    var limit = clamp(parseInt(o.limit, 10) || 4, 3, 4);
    var all = load().slice();
    var picked = all.slice().sort(function (a, b) { return (b.rating - a.rating) || (b.createdAt - a.createdAt); }).slice(0, limit);
    var allLink = o.allLink || 'reviews.html';

    el.classList.add('nkrv-root');
    if (!all.length) {
      el.innerHTML = emptyHtml('No reviews yet', 'Be the first to share your NIKORA ritual experience. Your story helps the next customer choose with confidence.', allLink + '#write', o.emptyLabel || 'Be the First to Review');
      return [];
    }
    el.innerHTML = (o.showSummary === false ? '' : summaryHtml(all)) +
      '<div class="nkrv-grid">' + picked.map(function (r) { return cardHtml(r, { clamp: true, cardFooter: o.cardFooter }); }).join('') + '</div>' +
      '<div class="nkrv-more-row"><a class="nkrv-btn nkrv-btn-ghost" href="' + esc(allLink) + '">' + esc(o.allLabel || 'View All Reviews') +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a></div>';
    return picked;
  }

  /* filters: { filter:'all'|'photos'|'verified', sort:'recent'|'rating', page, pageSize (default 9),
                minRating, product, query, cardFooter(review) -> html } */
  function renderAllReviews(containerId, filters) {
    var el = byId(containerId);
    if (!el) return null;
    injectStyles();
    var f = filters || {};
    var filter = ['photos', 'verified'].indexOf(f.filter) > -1 ? f.filter : 'all';
    var sort = f.sort === 'rating' ? 'rating' : 'recent';
    var pageSize = clamp(parseInt(f.pageSize, 10) || 9, 1, 60);
    var minRating = clamp(Number(f.minRating) || 0, 0, 5);
    var product = f.product ? String(f.product).toLowerCase() : '';
    var query = f.query ? String(f.query).trim().toLowerCase() : '';

    var key = [filter, sort, pageSize, minRating, product, query].join('|');
    var st = pageState[containerId] || (pageState[containerId] = { key: key, page: 1 });
    if (f.page) st.page = parseInt(f.page, 10) || 1; else if (st.key !== key) st.page = 1;
    st.key = key;

    var rest = {}; Object.keys(f).forEach(function (k) { if (k !== 'page') rest[k] = f[k]; });
    registry[containerId] = { type: 'all', args: [containerId, rest] };

    var all = load().slice();
    var list = all.filter(function (r) {
      if (filter === 'photos' && !(r.photos && r.photos.length)) return false;
      if (filter === 'verified' && !r.verified) return false;
      if (minRating && r.rating < minRating) return false;
      if (product && (r.product || '').toLowerCase().indexOf(product) === -1) return false;
      if (query && (r.name + ' ' + r.text + ' ' + r.product).toLowerCase().indexOf(query) === -1) return false;
      return true;
    });
    list.sort(sort === 'rating' ? function (a, b) { return (b.rating - a.rating) || (b.createdAt - a.createdAt); } : byRecent);

    var total = list.length, pages = Math.max(1, Math.ceil(total / pageSize));
    st.page = clamp(st.page, 1, pages);
    var start = (st.page - 1) * pageSize, slice = list.slice(start, start + pageSize);

    el.classList.add('nkrv-root');
    el.setAttribute('data-nkrv-id', containerId);
    if (!all.length) {
      el.innerHTML = emptyHtml('No reviews yet', 'Be the first to share your NIKORA experience.', '#write', 'Leave a Review');
    } else if (!total) {
      el.innerHTML = emptyHtml('No matching reviews', 'Try a different filter to see everything our community has shared.');
    } else {
      el.innerHTML = '<p class="nkrv-status" role="status" aria-live="polite">Showing ' + (start + 1) + '\u2013' + (start + slice.length) +
        ' of ' + total + ' review' + (total === 1 ? '' : 's') + '</p>' +
        '<div class="nkrv-grid">' + slice.map(function (r) { return cardHtml(r, { cardFooter: f.cardFooter }); }).join('') + '</div>' +
        (pages > 1 ? pagerHtml(st.page, pages) : '');
    }
    return { total: total, page: st.page, pages: pages, pageSize: pageSize };
  }

  function pagerHtml(page, pages) {
    var nums = [], last = 0;
    for (var p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || Math.abs(p - page) <= 1) {
        if (last && p - last > 1) nums.push('<span class="nkrv-dots" aria-hidden="true">\u2026</span>');
        nums.push('<button type="button" class="nkrv-pg" data-nkrv-page="' + p + '" aria-label="Page ' + p + '"' + (p === page ? ' aria-current="page"' : '') + '>' + p + '</button>');
        last = p;
      }
    }
    return '<nav class="nkrv-pager" aria-label="Reviews pagination">' +
      '<button type="button" class="nkrv-pg" data-nkrv-page="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' aria-label="Previous page">Prev</button>' +
      nums.join('') +
      '<button type="button" class="nkrv-pg" data-nkrv-page="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + ' aria-label="Next page">Next</button></nav>';
  }

  /* ---------------- events: pagination, photo lightbox, live re-render ---------------- */
  function openLightbox(src) {
    if (typeof global.nkLightboxOpen === 'function') { global.nkLightboxOpen(src); return; }   /* the site's own #nk-lightbox */
    var lb = document.getElementById('nkrv-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'nkrv-lightbox'; lb.className = 'nkrv-lb';
      lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Review photo');
      lb.innerHTML = '<button type="button" aria-label="Close">\u00d7</button><img alt="Review photo, full size">';
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'BUTTON') lb.classList.remove('on'); });
      document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.classList.add('on');
    lb.querySelector('button').focus();
  }

  function rerenderAll() {
    Object.keys(registry).forEach(function (id) {
      if (!byId(id)) { delete registry[id]; return; }
      var reg = registry[id];
      (reg.type === 'home' ? renderHomepageReviews : renderAllReviews).apply(null, reg.args);
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var pg = t.closest('[data-nkrv-page]');
    if (pg && !pg.disabled) {
      var root = pg.closest('[data-nkrv-id]');
      if (root) {
        var id = root.getAttribute('data-nkrv-id'), reg = registry[id];
        if (reg && reg.type === 'all') {
          var args = {}; Object.keys(reg.args[1] || {}).forEach(function (k) { args[k] = reg.args[1][k]; });
          args.page = Number(pg.getAttribute('data-nkrv-page'));
          renderAllReviews(id, args);
          if (root.scrollIntoView) root.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
      return;
    }
    var ph = t.closest('.nkrv-photo');
    if (ph) openLightbox(ph.getAttribute('data-nkrv-src'));
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { var lb = document.getElementById('nkrv-lightbox'); if (lb) lb.classList.remove('on'); }
  });
  document.addEventListener(EVENT_NAME, rerenderAll);                    /* addReview / setReviews on this page */
  global.addEventListener('storage', function (e) {                     /* the same store changed in another tab */
    if (e.key === STORAGE_KEY || e.key === null) { mem = null; load(); rerenderAll(); }
  });

  load();   /* seeds localStorage on first run */

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    EVENT_NAME: EVENT_NAME,
    getReviews: getReviews,
    addReview: addReview,
    setReviews: setReviews,
    getStats: getStats,
    renderHomepageReviews: renderHomepageReviews,
    renderAllReviews: renderAllReviews
  };
  global.NikoraReviews = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
