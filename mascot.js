/**
 * NIKORA mascot.js  -  the NIKORA Rabbit as a reusable UI guide (stand-alone, no dependencies, lives next to nav.js in the repo root).
 *
 * Artwork: the official bunny head from the header logo (same ear / head outlines, eyes, nose and mouth), drawn as inline SVG.
 *   Gold outline = #C89B54, face = obsidian in light mode / white in dark mode (CSS variables, so it follows the theme toggle without a swap).
 *   Poses add one small line-art prop: 'head' (default), 'sparkle' (tips), 'bag' (empty cart), 'search' (no results), 'box' (parcels), 'lost' (404).
 *
 * API  (window.NKMascot)
 *   svg(pose, { size: 96, label: '' })            -> SVG string (decorative unless a label is given)
 *   tip(text, { title: 'NIKORA Rabbit Tip', mini: false })   -> callout HTML
 *   empty({ pose, title, text, cta: { label, href, closeCart } })  -> empty-state HTML
 *   help(text, { cta: { label, href } })           -> small help strip HTML (FAQ blocks, help sections)
 *   enhance(root)                                  -> upgrades the placeholders below (runs automatically for the whole page and for anything added later)
 *
 * Declarative placeholders (no JS needed in the page):
 *   <div data-nk-mascot-tip="Apply on damp skin for maximum Glass Skin absorption"></div>      add data-nk-mascot-mini for the one-line card version
 *   <div data-nk-mascot-help="Still curious?" data-cta-label="Ask the concierge" data-cta-href="contact.html"></div>
 *   <div data-nk-mascot-empty data-pose="lost" data-title="..." data-text="..." data-cta-label="..." data-cta-href="..."></div>
 * Automatic upgrades (existing markup, no page edits): the empty cart (.cart-empty) and the empty catalog search (.no-results).
 * Opt out of an automatic upgrade with data-nk-mascot-off.
 *
 * LIVE COMPANION (v2): a floating obsidian + gold (#C89B54) rabbit widget in the bottom corner of every page (not at checkout).
 *   Motion      gentle float + breathing, ear wiggles, eye blinks (all off for prefers-reduced-motion; paused while the tab is hidden).
 *   Reactions   joyful bounce when the bag count really goes up; "Lab Specialist" goggles + sparkles while the pointer is on a key ingredient
 *               (mark any element with data-nk-ingredient, optionally data-nk-lab="short fact" for a bubble); a helpful tip after 15 s idle (max 3 per visit).
 *   Memory      reads / writes the customer's skin type + concerns in this browser (localStorage 'nikora_profile'):
 *                 NKMascot.learn(text)   call it with each sentence the CUSTOMER types in the Concierge; it spots "dry", "sensitive", "barrier repair", ...
 *                 NKMascot.setProfile({ skinTypes:['dry'], concerns:['Barrier Repair'] })   or save a profile you already have
 *                 NKMascot.getProfile() / NKMascot.forget()     window event 'nikora:profile' fires on every change
 *   Click       opens a quick guidance popup; "Chat with the Concierge" calls window.openAiAssistant().
 *   Config      window.NK_MASCOT = { widget:true, side:'left'|'right', idleMs:15000, maxNudges:3, hideOn:['checkout'] }  (set before this file loads)
 */
(function () {
  'use strict';
  if (window.NKMascot) return;
  var doc = document;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeHref(u) { u = String(u || ''); return /^(https?:|mailto:|tel:|#|\/|[A-Za-z0-9_.\-]+(\.html)?([?#].*)?$)/.test(u) ? u : '#'; }

  /* ---------------------------------------------------------------- artwork */
  var G = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  var HEAD =
    '<g ' + G + ' style="stroke-width:8">' +
      '<path d="M23 56C14 44 8 29 7.5 15C7.3 7 12 3.7 17.5 3.7C24 4 30 12 34 24C37 33 38.5 42 38.2 50.5"/>' +
      '<path d="M74.2 56C83.2 44 89.2 29 89.7 15C89.9 7 85.2 3.7 79.7 3.7C73.2 4 67.2 12 63.2 24C60.2 33 58.7 42 59 50.5"/>' +
      '<ellipse cx="48.6" cy="86.5" rx="43.2" ry="37"/>' +
    '</g>' +
    '<g style="fill:var(--nkm-face)"><ellipse cx="31.8" cy="76.7" rx="5" ry="5.6"/><ellipse cx="66" cy="76.7" rx="5" ry="5.6"/>' +
    '<path d="M42.6 84.6C42.6 83.7 45.5 83.2 48.6 83.2C51.7 83.2 54.6 83.7 54.6 84.6C54.2 87.2 51.5 89.2 48.6 90.2C45.7 89.2 43 87.2 42.6 84.6Z"/></g>' +
    '<path d="M48.6 89.5V96.5M48.6 96.5C46 99.4 42.6 100.4 39.6 99.5C37.6 98.9 36.2 97.4 35.9 95.6M48.6 96.5C51.2 99.4 54.6 100.4 57.6 99.5C59.6 98.9 61 97.4 61.3 95.6" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--nkm-face)"/>';
  var SPARK = 'M0,-11 L2.6,-2.6 L11,0 L2.6,2.6 L0,11 L-2.6,2.6 L-11,0 L-2.6,-2.6Z';
  var POSES = {
    head:   { vb: [-2, -2, 101.2, 133], art: HEAD },
    sparkle:{ vb: [-2, -2, 125, 133],   art: HEAD + '<path transform="translate(110 20)" d="' + SPARK + '" fill="currentColor"/><path transform="translate(104 48) scale(.5)" d="' + SPARK + '" fill="currentColor"/>' },
    bag:    { vb: [-14, -2, 125, 168],  art: HEAD +
      '<g ' + G + ' style="stroke-width:5;fill:var(--nkm-bag)"><path d="M33 120v-6a16 16 0 0 1 32 0v6" style="fill:none"/><path d="M19 120h60l-4 42H23z"/></g>' +
      '<path d="M40 136c0 5 4 8 9 8s9-3 9-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" opacity=".6"/>' },
    search: { vb: [-2, -2, 135, 152],   art: HEAD +
      '<circle cx="98" cy="108" r="17" ' + G + ' style="stroke-width:6;fill:var(--nkm-glass)"/><path d="M110 121L126 138" ' + G + ' style="stroke-width:7"/>' },
    box:    { vb: [-14, -2, 125, 168],  art: HEAD +
      '<g ' + G + ' style="stroke-width:5;fill:var(--nkm-bag)"><path d="M16 118h66v42H16z"/><path d="M49 118v42M16 132h66" style="fill:none"/></g>' },
    lost:   { vb: [-8, -2, 136, 133],   art: '<g transform="rotate(-8 48.6 86)">' + HEAD + '</g>' +
      '<path d="M104 34c0-10 17-10 17 0c0 7-8 8-8 17" ' + G + ' style="stroke-width:5"/><circle cx="113" cy="63" r="3.4" fill="currentColor"/>' }
  };
  function svg(pose, o) {
    o = o || {};
    var p = POSES[pose] || POSES.head, vb = p.vb, h = Number(o.size) || 96, w = Math.round(h * vb[2] / vb[3] * 10) / 10;
    var a11y = o.label ? 'role="img" aria-label="' + esc(o.label) + '"' : 'aria-hidden="true" focusable="false"';
    return '<svg class="nkm' + (o.className ? ' ' + esc(o.className) : '') + '" viewBox="' + vb.join(' ') + '" width="' + w + '" height="' + h + '" ' + a11y + '>' + p.art + '</svg>';
  }

  /* ---------------------------------------------------------------- styles */
  var CSS = [
    ':root{--nkm-gold:#C89B54;--nkm-face:#0B0B0E;--nkm-bag:#FAF7F2;--nkm-glass:rgba(200,155,84,.16);--nkm-tint:rgba(200,155,84,.11);--nkm-bd:rgba(200,155,84,.38);--nkm-title:#80591F;}',
    ':root[data-theme="dark"]{--nkm-face:#F7F4F0;--nkm-bag:#1A1620;--nkm-glass:rgba(200,155,84,.2);--nkm-tint:rgba(200,155,84,.14);--nkm-bd:rgba(200,155,84,.5);--nkm-title:#E5BA73;}',
    '.nkm{display:block;flex:none;overflow:visible;color:var(--nkm-gold);}',
    /* tip / help callout */
    '.nkm-tip{display:flex;align-items:flex-start;gap:12px;box-sizing:border-box;margin:14px 0 0;padding:12px 14px;border-radius:16px;background:var(--nkm-tint);border:1px solid var(--nkm-bd);text-align:left;}',
    '.nkm-ava{flex:none;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:38px;height:38px;padding:7px;border-radius:50%;background:var(--nkm-tint);border:1px solid var(--nkm-bd);}',
    '.nkm-ava .nkm{width:100%;height:100%;}',
    '.nkm-body{min-width:0;flex:1;}',
    '.nkm-title{margin:0 0 3px;font-size:10.5px;font-weight:700;line-height:1.3;letter-spacing:.09em;text-transform:uppercase;color:var(--nkm-title);}',
    '.nkm-text{margin:0;font-size:13px;line-height:1.55;color:var(--text-soft,rgba(26,22,21,.7));}',
    '.nkm-link{display:inline-block;margin-top:6px;font-size:12px;font-weight:700;color:var(--nkm-title);text-decoration:underline;text-underline-offset:3px;}',
    '.nkm-tip--mini{margin:0 0 12px;padding:8px 10px;gap:9px;border-radius:12px;}',
    '.nkm-tip--mini .nkm-ava{width:28px;height:28px;padding:5px;}',
    '.nkm-tip--mini .nkm-title{margin:0 0 1px;font-size:9.5px;}',
    '.nkm-tip--mini .nkm-text{font-size:12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    /* empty state */
    '.nkm-empty{display:flex;flex-direction:column;align-items:center;gap:4px;box-sizing:border-box;padding:28px 22px 22px;text-align:center;}',
    '.nkm-empty .nkm{margin:0 auto 8px;animation:nkmFloat 4.2s ease-in-out infinite;}',
    '.nkm-empty-title{margin:0;font-family:"Playfair Display",Georgia,serif;font-size:19px;font-weight:500;line-height:1.3;color:var(--text,#1A1615);}',
    '.nkm-empty-text{margin:0;max-width:34ch;font-size:13px;line-height:1.55;color:var(--text-soft,rgba(26,22,21,.62));}',
    '.nkm-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:12px;padding:11px 24px;border:0;border-radius:100px;background:var(--gold,#C89B54);color:#241c0f;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.04em;text-decoration:none;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;}',
    '.nkm-cta:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(200,155,84,.7);}',
    '.nkm-cta:focus-visible{outline:2px solid var(--gold,#C89B54);outline-offset:3px;}',
    '@keyframes nkmFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
    '@media (prefers-reduced-motion:reduce){.nkm-empty .nkm{animation:none}.nkm-cta{transition:none}}'
  ].join('\n');
  function injectCss() {
    if (doc.getElementById('nk-mascot-css')) return;
    var st = doc.createElement('style'); st.id = 'nk-mascot-css'; st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* ---------------------------------------------------------------- components */
  function tipInner(text, o) {
    o = o || {};
    return '<span class="nkm-ava">' + svg('sparkle', { size: 40 }) + '</span>' +
      '<span class="nkm-body"><span class="nkm-title" style="display:block">' + esc(o.title || 'NIKORA Rabbit Tip') + '</span><span class="nkm-text" style="display:block">' + esc(text) + '</span></span>';
  }
  function tip(text, o) {
    o = o || {};
    return '<aside class="nkm-tip' + (o.mini ? ' nkm-tip--mini' : '') + '" data-nkm-done="1">' + tipInner(text, o) + '</aside>';
  }
  function help(text, o) {
    o = o || {}; var c = o.cta;
    return '<aside class="nkm-tip" data-nkm-done="1"><span class="nkm-ava">' + svg('head', { size: 40 }) + '</span><span class="nkm-body">' +
      '<span class="nkm-text" style="display:block">' + esc(text) + '</span>' +
      (c && c.label ? '<a class="nkm-link" href="' + esc(safeHref(c.href)) + '">' + esc(c.label) + '</a>' : '') + '</span></aside>';
  }
  function emptyInner(o) {
    o = o || {}; var c = o.cta;
    return svg(o.pose || 'head', { size: o.size || 104 }) +
      (o.title ? '<h3 class="nkm-empty-title">' + esc(o.title) + '</h3>' : '') +
      (o.text ? '<p class="nkm-empty-text">' + esc(o.text) + '</p>' : '') +
      (c && c.label ? '<a class="nkm-cta" href="' + esc(safeHref(c.href)) + '"' + (c.closeCart ? ' data-nkm-close-cart' : '') + '>' + esc(c.label) + '</a>' : '');
  }
  function empty(o) { return '<div class="nkm-empty" data-nkm-done="1">' + emptyInner(o) + '</div>'; }

  /* ---------------------------------------------------------------- upgrades */
  var SEL = '[data-nk-mascot-tip],[data-nk-mascot-help],[data-nk-mascot-empty],.cart-empty,.no-results';
  function enhanceOne(el) {
    if (!el || el.nodeType !== 1 || el.getAttribute('data-nkm-done') || el.hasAttribute('data-nk-mascot-off')) return false;
    var d = el.dataset || {};
    if (el.hasAttribute('data-nk-mascot-tip')) {
      var mini = el.hasAttribute('data-nk-mascot-mini');
      el.className = (el.className ? el.className + ' ' : '') + 'nkm-tip' + (mini ? ' nkm-tip--mini' : '');
      el.innerHTML = tipInner(el.getAttribute('data-nk-mascot-tip'), { title: d.title });
    } else if (el.hasAttribute('data-nk-mascot-help')) {
      el.className = (el.className ? el.className + ' ' : '') + 'nkm-tip';
      el.innerHTML = '<span class="nkm-ava">' + svg('head', { size: 40 }) + '</span><span class="nkm-body"><span class="nkm-text" style="display:block">' + esc(el.getAttribute('data-nk-mascot-help')) + '</span>' +
        (d.ctaLabel ? '<a class="nkm-link" href="' + esc(safeHref(d.ctaHref)) + '">' + esc(d.ctaLabel) + '</a>' : '') + '</span>';
    } else if (el.hasAttribute('data-nk-mascot-empty')) {
      el.className = (el.className ? el.className + ' ' : '') + 'nkm-empty';
      el.innerHTML = emptyInner({ pose: d.pose, title: d.title, text: d.text, cta: d.ctaLabel ? { label: d.ctaLabel, href: d.ctaHref } : null });
    } else if (el.classList.contains('cart-empty')) {                              /* the empty cart drawer (renderCart() on every page) */
      el.className = el.className + ' nkm-empty';
      el.innerHTML = emptyInner({ pose: 'bag', size: 96, title: 'Your beauty routine is empty', text: 'Add a favorite below to start your glow ritual.',
        cta: { label: 'Explore Bestsellers', href: 'catalog.html?filter=bestsellers', closeCart: true } });
    } else if (el.classList.contains('no-results')) {                              /* the empty catalog search: keeps the page's own message */
      var msg = (el.textContent || '').trim();
      el.className = el.className + ' nkm-empty';
      el.innerHTML = emptyInner({ pose: 'search', size: 112, title: 'No matches yet', text: msg || 'Try another skin concern or clear the search.',
        cta: { label: 'Explore Bestsellers', href: 'catalog.html?filter=bestsellers' } });
    } else return false;
    el.setAttribute('data-nkm-done', '1');
    return true;
  }
  function enhance(root) {
    root = root || doc.body; if (!root) return;
    var changed = enhanceOne(root);
    Array.prototype.forEach.call(root.querySelectorAll ? root.querySelectorAll(SEL) : [], function (el) { if (enhanceOne(el)) changed = true; });
    if (changed && typeof window.refreshAccordionHeights === 'function') { try { window.refreshAccordionHeights(); } catch (e) {} }   /* product.html sizes its accordion panels in px */
  }

  /* ====================================================================== 5. LIVE COMPANION (floating widget, reactions, memory) ====================================================================== */
  var CFG = (function () {
    var d = { widget: true, side: 'left', idleMs: 15000, maxNudges: 3, hideOn: ['checkout'] }, u = window.NK_MASCOT || {}, k;
    for (k in u) if (Object.prototype.hasOwnProperty.call(u, k)) d[k] = u[k];
    return d;
  })();
  var reduceMotion = function () { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  function store(kind) {
    return {
      get: function (k) { try { return window[kind].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[kind].setItem(k, v); } catch (e) {} },
      del: function (k) { try { window[kind].removeItem(k); } catch (e) {} }
    };
  }
  var LS = store('localStorage'), SS = store('sessionStorage');

  /* ---------- 5a. customer profile (skin type + concerns), kept in this browser only ----------
     Written by learn() / setProfile() (the Beauty Concierge calls them), read by every page. Key: localStorage 'nikora_profile'
     { v:1, skinTypes:['dry','sensitive'], concerns:['Barrier Repair'], updatedAt }. Nothing is sent anywhere by this file. */
  var PROFILE_KEY = 'nikora_profile';
  var SKIN_RE = { dry: /\b(dry|dryness)\b/i, oily: /\b(oily|greasy)\b/i, combination: /\b(combination|combo)\b/i, sensitive: /\b(sensitive|sensitivity|reactive|irritated)\b/i, normal: /\bnormal skin\b/i };
  var CONCERN_RE = {
    'Barrier Repair': /\b(barrier|damaged skin|compromised skin)\b/i,
    'Hydration': /\b(hydrat\w*|dehydrat\w*|moisturi[sz]\w*)\b/i,
    'Acne & Blemishes': /\b(acne|breakouts?|blemish\w*|pimples?)\b/i,
    'Dullness': /\b(dull\w*|brighten\w*|radiance)\b/i,
    'Redness': /\b(redness|rosacea|flushed)\b/i,
    'Dark Spots': /\b(dark spots?|hyperpigmentation|pigmentation|sun spots?)\b/i,
    'Fine Lines': /\b(fine lines?|wrinkles?|aging|ageing|firming)\b/i,
    'Pores': /\bpores?\b/i
  };
  /* what a product page has to mention before the rabbit says it lines up with the customer's profile (never claimed otherwise) */
  var PRODUCT_RE = {
    dry: /\b(dry|dryness|hydrat\w*|moisturi[sz]\w*)\b/i, oily: /\b(oil\w*|sebum|pores?)\b/i, combination: /\b(combination|balanc\w*)\b/i,
    sensitive: /\b(sensitive|soothing|calming|centella)\b/i, normal: /\b(all skin types|every skin type)\b/i,
    'Barrier Repair': /\b(barrier|ceramide\w*|repair\w*)\b/i, 'Hydration': /\b(hydrat\w*|moisturi[sz]\w*|hyaluronic)\b/i,
    'Acne & Blemishes': /\b(acne|blemish\w*|breakouts?)\b/i, 'Dullness': /\b(glow\w*|brighten\w*|radian\w*)\b/i, 'Redness': /\b(redness|soothing|calming)\b/i,
    'Dark Spots': /\b(dark spots?|pigment\w*)\b/i, 'Fine Lines': /\b(fine lines?|wrinkle\w*|firm\w*|collagen|lift\w*)\b/i, 'Pores': /\bpores?\b/i
  };
  function negated(text, idx) { return /\b(not|no|isn'?t|never|without)\s+(really\s+|very\s+)?$/i.test(text.slice(Math.max(0, idx - 14), idx)); }
  function hit(re, text) {
    var g = new RegExp(re.source, 'ig'), m;
    while ((m = g.exec(text))) { if (!negated(text, m.index)) return true; }
    return false;
  }
  function cleanList(a, allowed) {
    var out = [];
    (Array.isArray(a) ? a : (a ? [a] : [])).forEach(function (v) {
      v = String(v || '').trim(); if (!v) return;
      var key = allowed ? Object.keys(allowed).filter(function (k) { return k.toLowerCase() === v.toLowerCase(); })[0] : v.slice(0, 40);
      if (key && out.indexOf(key) < 0) out.push(key);
    });
    return out;
  }
  /* tolerant reader for whatever the Concierge itself stores: looks for skinType(s) / concerns / goals up to 3 levels deep */
  var EXTERNAL_KEYS = ['nikora_ai_profile', 'nkai_profile', 'nkai_memory', 'nikora_ai_memory', 'nikora_assistant_memory'];
  function digProfile(o, depth, out) {
    if (!o || typeof o !== 'object' || depth > 3) return;
    Object.keys(o).forEach(function (k) {
      var v = o[k], lk = k.toLowerCase().replace(/[^a-z]/g, '');
      if (/^(skintype|skintypes)$/.test(lk)) String(Array.isArray(v) ? v.join(' ') : v).toLowerCase().split(/[\s,\/&]+/).forEach(function (w) { if (SKIN_RE[w]) out.skinTypes.push(w); });
      else if (/^(concern|concerns|skinconcerns|goal|goals|skingoals)$/.test(lk)) (Array.isArray(v) ? v : [v]).forEach(function (c) {
        c = String(c || ''); Object.keys(CONCERN_RE).forEach(function (n) { if (n.toLowerCase() === c.trim().toLowerCase() || CONCERN_RE[n].test(c)) out.concerns.push(n); });
      });
      else if (v && typeof v === 'object') digProfile(v, depth + 1, out);
    });
  }
  function getProfile() {
    var p = { skinTypes: [], concerns: [] }, raw = LS.get(PROFILE_KEY), o;
    try { o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    if (o) { p.skinTypes = cleanList(o.skinTypes, SKIN_RE); p.concerns = cleanList(o.concerns, CONCERN_RE); }
    EXTERNAL_KEYS.forEach(function (k) { var r = LS.get(k); if (!r) return; try { digProfile(JSON.parse(r), 0, p); } catch (e) {} });
    p.skinTypes = cleanList(p.skinTypes, SKIN_RE); p.concerns = cleanList(p.concerns, CONCERN_RE).slice(0, 4);
    return (p.skinTypes.length || p.concerns.length) ? p : null;
  }
  function saveProfile(p) {
    LS.set(PROFILE_KEY, JSON.stringify({ v: 1, skinTypes: p.skinTypes, concerns: p.concerns.slice(0, 4), updatedAt: Date.now() }));
    try { window.dispatchEvent(new CustomEvent('nikora:profile', { detail: getProfile() })); } catch (e) {}
    if (widget.el) refreshDot();
  }
  /** Merge a profile object { skinTypes | skinType, concerns | concern } into the saved profile. */
  function setProfile(o) {
    o = o || {}; var cur = getProfile() || { skinTypes: [], concerns: [] };
    var st = cleanList([].concat(o.skinTypes || [], o.skinType || []).map(function (s) { return String(s).toLowerCase(); }), SKIN_RE);
    var cn = cleanList([].concat(o.concerns || [], o.concern || []), CONCERN_RE);
    cur.skinTypes = cleanList(cur.skinTypes.concat(st), SKIN_RE); cur.concerns = cleanList(cur.concerns.concat(cn), CONCERN_RE);
    saveProfile(cur); return getProfile();
  }
  /** Reads a sentence the CUSTOMER typed to the Concierge ("my skin is dry and sensitive, I want barrier repair") and remembers skin type / concerns. */
  function learn(text) {
    text = String(text || '').slice(0, 600); if (!text) return getProfile();
    var st = [], cn = [];
    Object.keys(SKIN_RE).forEach(function (k) { if (hit(SKIN_RE[k], text)) st.push(k); });
    Object.keys(CONCERN_RE).forEach(function (k) { if (hit(CONCERN_RE[k], text)) cn.push(k); });
    return (st.length || cn.length) ? setProfile({ skinTypes: st, concerns: cn }) : getProfile();
  }
  function forget() { LS.del(PROFILE_KEY); EXTERNAL_KEYS.forEach(function (k) { LS.del(k); }); if (widget.el) refreshDot(); try { window.dispatchEvent(new CustomEvent('nikora:profile', { detail: null })); } catch (e) {} }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function profileLabel(p) { return p ? (p.skinTypes.length ? p.skinTypes.map(cap).join('/') + ' skin' : p.concerns[0]) : ''; }

  /* the one personal note: a product page only gets "matches" when its own text mentions what the customer asked for */
  function productText() {
    var parts = [], h1 = doc.querySelector('h1'), md = doc.querySelector('meta[name="description"]'), sci = doc.getElementById('panel-science');
    if (h1) parts.push(h1.textContent); if (md) parts.push(md.getAttribute('content')); if (sci) parts.push(sci.textContent);
    return parts.join(' ').slice(0, 4000);
  }
  function personalNote() {
    var p = getProfile(); if (!p) return null;
    if (/product(\.html)?$/i.test(location.pathname) || /product\.html/i.test(location.pathname)) {
      var txt = productText(), keys = p.skinTypes.concat(p.concerns), i, m;
      for (i = 0; i < keys.length; i++) {
        var re = PRODUCT_RE[keys[i]]; if (!re || !txt) continue;
        if ((m = re.exec(txt))) return { text: 'Mascot Note: this one mentions \u201c' + m[0].toLowerCase() + '\u201d, which lines up with your ' + (SKIN_RE[keys[i]] ? cap(keys[i]) + ' skin' : keys[i]) + ' goals.' };
      }
    }
    if (p.skinTypes.indexOf('sensitive') >= 0) return { text: 'Mascot Note: Remember to patch test on sensitive skin!' };
    if (p.skinTypes.indexOf('dry') >= 0) return { text: 'Mascot Note: Dry skin loves hydration layered on damp skin.' };
    if (p.concerns.length) return { text: 'Mascot Note: Your focus is ' + p.concerns[0] + '. Ask me for picks that fit.', ask: true };
    return null;
  }
  function pageTip() {
    var path = location.pathname.toLowerCase(), t;
    if (/product/.test(path)) { t = doc.querySelector('[data-nk-mascot-tip]'); var s = t && (t.getAttribute('data-nk-mascot-tip') || ''); return { text: s ? 'Tip: ' + s : 'Not sure about this one? Ask the Beauty Concierge.', ask: !s }; }
    if (/catalog/.test(path)) return { text: 'Tip: use the concern chips to narrow your routine faster.' };
    if (/track/.test(path)) return { text: 'This page updates live when your order ships.' };
    if (/faq|contact|shipping|returns/.test(path)) return { text: 'Cannot find an answer? The Beauty Concierge can help.', ask: true };
    return { text: 'New here? Bestsellers are a lovely place to start.', href: 'catalog.html?filter=bestsellers', hrefLabel: 'Explore Bestsellers' };
  }

  /* ---------- 5b. the live rabbit: solid obsidian head, gold outline, cream face ---------- */
  var EAR_L = 'M23 56C14 44 8 29 7.5 15C7.3 7 12 3.7 17.5 3.7C24 4 30 12 34 24C37 33 38.5 42 38.2 50.5Z';
  var EAR_R = 'M74.2 56C83.2 44 89.2 29 89.7 15C89.9 7 85.2 3.7 79.7 3.7C73.2 4 67.2 12 63.2 24C60.2 33 58.7 42 59 50.5Z';
  function liveSvg() {
    return '<svg class="nkm-live" viewBox="-2 -2 101.2 133" aria-hidden="true" focusable="false">' +
      '<g class="nkm-body">' +
        '<path class="nkm-ear nkm-ear-l nkm-shape" d="' + EAR_L + '"/><path class="nkm-ear nkm-ear-r nkm-shape" d="' + EAR_R + '"/>' +
        '<ellipse class="nkm-shape" cx="48.6" cy="86.5" rx="43.2" ry="37"/>' +
        '<g class="nkm-eyes"><ellipse class="nkm-cream" cx="31.8" cy="76.7" rx="5" ry="5.6"/><ellipse class="nkm-cream" cx="66" cy="76.7" rx="5" ry="5.6"/></g>' +
        '<g class="nkm-eye-happy"><path d="M26.2 78.4Q31.8 70 37.4 78.4"/><path d="M60.4 78.4Q66 70 71.6 78.4"/></g>' +
        '<g class="nkm-goggles"><rect x="21.5" y="67.5" width="20.6" height="18" rx="8.4"/><rect x="55.7" y="67.5" width="20.6" height="18" rx="8.4"/><path d="M42.1 76.7H55.7"/><path d="M21.5 76.7L8 74M76.3 76.7L90 74"/></g>' +
        '<path class="nkm-nose" d="M42.6 84.6C42.6 83.7 45.5 83.2 48.6 83.2C51.7 83.2 54.6 83.7 54.6 84.6C54.2 87.2 51.5 89.2 48.6 90.2C45.7 89.2 43 87.2 42.6 84.6Z"/>' +
        '<path class="nkm-mouth" d="M48.6 89.5V96.5M48.6 96.5C46 99.4 42.6 100.4 39.6 99.5C37.6 98.9 36.2 97.4 35.9 95.6M48.6 96.5C51.2 99.4 54.6 100.4 57.6 99.5C59.6 98.9 61 97.4 61.3 95.6"/>' +
      '</g>' +
      '<path class="nkm-spk nkm-spk1" transform="translate(92 22)" d="' + SPARK + '"/><path class="nkm-spk nkm-spk2" transform="translate(6 38) scale(.7)" d="' + SPARK + '"/><path class="nkm-spk nkm-spk3" transform="translate(88 62) scale(.5)" d="' + SPARK + '"/>' +
    '</svg>';
  }

  var COMPANION_CSS = [
    '.nkm-widget{position:fixed;z-index:1500;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px) + var(--nkm-lift,0px));font-family:"Montserrat",system-ui,sans-serif;transition:bottom .25s ease,opacity .25s ease;}',
    '.nkm-widget[data-side="right"]{left:auto;right:max(16px,env(safe-area-inset-right,0px));}',
    'html.nkn-menu-open .nkm-widget{opacity:0;pointer-events:none;}',
    '.nkm-fab{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:64px;height:64px;padding:0;border:2px solid #C89B54;border-radius:50%;cursor:pointer;color:#C89B54;',
    ' background:radial-gradient(circle at 35% 28%,#2B2431,#0B0B0E 72%);box-shadow:0 14px 30px -12px rgba(0,0,0,.65),0 0 0 4px rgba(200,155,84,.14);transition:transform .2s ease,box-shadow .2s ease;-webkit-tap-highlight-color:transparent;}',
    '.nkm-fab:hover{transform:scale(1.07);box-shadow:0 18px 36px -12px rgba(0,0,0,.7),0 0 0 6px rgba(200,155,84,.2);}',
    '.nkm-fab:focus-visible{outline:2px solid #E5BA73;outline-offset:4px;}',
    '.nkm-float{display:flex;align-items:center;justify-content:center;width:100%;height:100%;animation:nkmFloatW 5s ease-in-out infinite;}',
    '.nkm-live{display:block;width:40px;height:auto;overflow:visible;}',
    '.nkm-live .nkm-shape{fill:#1C1722;stroke:#C89B54;stroke-width:6.5;stroke-linejoin:round;stroke-linecap:round;}',
    '.nkm-live .nkm-cream{fill:#F7F4F0;}',
    '.nkm-live .nkm-nose{fill:#C89B54;}',
    '.nkm-live .nkm-mouth{fill:none;stroke:#F7F4F0;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;}',
    '.nkm-live .nkm-eye-happy,.nkm-live .nkm-goggles{opacity:0;transition:opacity .18s ease;}',
    '.nkm-live .nkm-eye-happy{fill:none;stroke:#F7F4F0;stroke-width:3.4;stroke-linecap:round;}',
    '.nkm-live .nkm-goggles{fill:rgba(200,155,84,.2);stroke:#E5BA73;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;}',
    '.nkm-live .nkm-spk{fill:#E5BA73;opacity:0;transform-box:fill-box;transform-origin:center;}',
    '.nkm-live .nkm-body{transform-box:fill-box;transform-origin:50% 100%;animation:nkmBreathe 4.2s ease-in-out infinite;}',
    '.nkm-live .nkm-ear{transform-box:fill-box;transform-origin:50% 96%;}',
    '.nkm-live .nkm-eyes{transform-box:fill-box;transform-origin:center;transition:transform .09s ease,opacity .15s ease;}',
    '.nkm-live.is-blink .nkm-eyes{transform:scaleY(.1);}',
    '.nkm-live.is-wiggle .nkm-ear-l{animation:nkmWigL .75s ease;}',
    '.nkm-live.is-wiggle .nkm-ear-r{animation:nkmWigR .75s ease .08s;}',
    /* reactions */
    '.nkm-widget.is-joy{animation:nkmJoy .85s cubic-bezier(.3,.7,.4,1);}',
    '.nkm-widget.is-joy .nkm-eyes{opacity:0;}.nkm-widget.is-joy .nkm-eye-happy{opacity:1;}',
    '.nkm-widget.is-joy .nkm-live .nkm-ear-l{transform:rotate(-8deg);}.nkm-widget.is-joy .nkm-live .nkm-ear-r{transform:rotate(8deg);}',
    '.nkm-widget.is-joy .nkm-spk,.nkm-widget.is-lab .nkm-spk{opacity:1;animation:nkmTwinkle 1.1s ease-in-out infinite;}',
    '.nkm-widget.is-lab .nkm-goggles{opacity:1;}',
    '.nkm-widget.is-lab .nkm-spk2{animation-delay:.3s;}.nkm-widget.is-lab .nkm-spk3{animation-delay:.6s;}',
    '.nkm-dot{position:absolute;top:1px;right:1px;width:13px;height:13px;border-radius:50%;background:#E5BA73;border:2px solid #0B0B0E;box-shadow:0 0 0 0 rgba(229,186,115,.6);animation:nkmPing 2.2s ease-out infinite;}',
    '.nkm-dot[hidden]{display:none;}',
    /* bubble + popover: solid obsidian with a gold hairline, identical in both themes */
    '.nkm-bubble,.nkm-pop{position:absolute;bottom:78px;left:0;box-sizing:border-box;color:#F7F4F0;background:#0B0B0E;border:1px solid rgba(200,155,84,.55);border-radius:18px;box-shadow:0 22px 44px -18px rgba(0,0,0,.7);}',
    '.nkm-widget[data-side="right"] .nkm-bubble,.nkm-widget[data-side="right"] .nkm-pop{left:auto;right:0;}',
    '.nkm-bubble{width:max-content;max-width:min(270px,calc(100vw - 32px));padding:12px 34px 12px 14px;font-size:12.5px;line-height:1.5;animation:nkmPop .28s cubic-bezier(.2,.8,.2,1);}',
    '.nkm-bubble::after{content:"";position:absolute;bottom:-7px;left:24px;width:12px;height:12px;background:#0B0B0E;border-right:1px solid rgba(200,155,84,.55);border-bottom:1px solid rgba(200,155,84,.55);transform:rotate(45deg);}',
    '.nkm-widget[data-side="right"] .nkm-bubble::after{left:auto;right:24px;}',
    '.nkm-bubble[hidden],.nkm-pop[hidden]{display:none;}',
    '.nkm-bubble b{color:#E5BA73;font-weight:700;}',
    '.nkm-x{position:absolute;top:6px;right:6px;width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:rgba(247,244,240,.6);font-size:16px;line-height:1;cursor:pointer;}',
    '.nkm-x:hover{color:#F7F4F0;background:rgba(255,255,255,.08);}',
    '.nkm-b-act{display:inline-block;margin:8px 10px 0 0;padding:0;border:0;background:none;color:#E5BA73;font:inherit;font-size:12px;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;}',
    '.nkm-pop{width:min(300px,calc(100vw - 32px));padding:16px 16px 14px;animation:nkmPop .28s cubic-bezier(.2,.8,.2,1);}',
    '.nkm-pop-h{margin:0 0 6px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#E5BA73;}',
    '.nkm-pop-t{margin:0 0 12px;font-size:13px;line-height:1.55;color:rgba(247,244,240,.88);}',
    '.nkm-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;}',
    '.nkm-chip{padding:6px 11px;border-radius:100px;border:1px solid rgba(200,155,84,.45);color:#F7F4F0;font-size:11.5px;font-weight:600;text-decoration:none;transition:background .2s ease;}',
    '.nkm-chip:hover{background:rgba(200,155,84,.18);}',
    '.nkm-go{display:flex;align-items:center;justify-content:center;width:100%;padding:11px 14px;border:0;border-radius:100px;background:#C89B54;color:#241c0f;font:inherit;font-size:12px;font-weight:700;letter-spacing:.03em;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease;}',
    '.nkm-go:hover{transform:translateY(-1px);box-shadow:0 10px 22px -10px rgba(200,155,84,.75);}',
    '.nkm-foot{display:flex;justify-content:space-between;gap:10px;margin-top:10px;}',
    '.nkm-foot button{padding:0;border:0;background:none;color:rgba(247,244,240,.55);font:inherit;font-size:11px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;}',
    '.nkm-foot button:hover{color:#F7F4F0;}',
    '.nkm-widget button:focus-visible,.nkm-widget a:focus-visible{outline:2px solid #E5BA73;outline-offset:2px;}',
    '@keyframes nkmFloatW{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
    '@keyframes nkmBreathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.014,1.03)}}',
    '@keyframes nkmWigL{0%,100%{transform:rotate(0)}25%{transform:rotate(-11deg)}55%{transform:rotate(6deg)}80%{transform:rotate(-3deg)}}',
    '@keyframes nkmWigR{0%,100%{transform:rotate(0)}25%{transform:rotate(11deg)}55%{transform:rotate(-6deg)}80%{transform:rotate(3deg)}}',
    '@keyframes nkmJoy{0%{transform:translateY(0) scale(1,1)}14%{transform:translateY(0) scale(1.1,.88)}40%{transform:translateY(-26px) scale(.95,1.08)}62%{transform:translateY(0) scale(1.07,.92)}78%{transform:translateY(-9px) scale(1)}100%{transform:translateY(0) scale(1)}}',
    '@keyframes nkmTwinkle{0%,100%{transform:scale(.4);opacity:.25}50%{transform:scale(1.15);opacity:1}}',
    '@keyframes nkmPing{0%{box-shadow:0 0 0 0 rgba(229,186,115,.55)}80%,100%{box-shadow:0 0 0 10px rgba(229,186,115,0)}}',
    '@keyframes nkmPop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.nkm-float,.nkm-live .nkm-body,.nkm-widget.is-joy,.nkm-live.is-wiggle .nkm-ear,.nkm-dot,.nkm-bubble,.nkm-pop,.nkm-widget.is-joy .nkm-spk,.nkm-widget.is-lab .nkm-spk{animation:none !important;}.nkm-widget.is-joy .nkm-spk,.nkm-widget.is-lab .nkm-spk{opacity:1;transform:none;}}'
  ].join('\n');

  var widget = { el: null, live: null, bubble: null, pop: null, fab: null, dot: null };
  var bubbleTimer = 0, joyTimer = 0, labTimer = 0, idleTimer = 0, lastBubbleAt = 0, lastJoyAt = 0, lastActivity = 0;
  var MUTE_KEY = 'nkm_mute_until', NUDGE_KEY = 'nkm_nudges';

  function muted() { return Number(LS.get(MUTE_KEY) || 0) > Date.now(); }
  function openAssistant() {
    closePop(); hideBubble();
    try { window.dispatchEvent(new CustomEvent('nikora:assistant-open', { detail: { from: 'mascot' } })); } catch (e) {}
    if (typeof window.openAiAssistant === 'function') window.openAiAssistant();
    else if (window.NikoraAssistant && typeof window.NikoraAssistant.open === 'function') window.NikoraAssistant.open();
    else window.location.href = 'contact.html';
  }
  function hideBubble() { clearTimeout(bubbleTimer); if (widget.bubble) widget.bubble.hidden = true; }
  /** Speech bubble. o: { ms, ask (adds an "Ask the Concierge" action), href + hrefLabel, force (ignore the "hide tips" setting) }. */
  function say(text, o) {
    o = o || {};
    if (!widget.el || (muted() && !o.force) || (widget.pop && !widget.pop.hidden)) return;
    var plain = String(text), m = /^(Mascot Note:|Tip:)\s*(.*)$/.exec(plain);
    var html = m ? '<b>' + esc(m[1]) + '</b> ' + esc(m[2]) : esc(plain);
    if (o.ask) html += '<br><button type="button" class="nkm-b-act" data-nkm="ask">Ask the Concierge</button>';
    if (o.href) html += '<br><a class="nkm-b-act" href="' + esc(safeHref(o.href)) + '">' + esc(o.hrefLabel || 'Take me there') + '</a>';
    if (o.quiet !== true && (o.ask || o.href)) html += '<button type="button" class="nkm-b-act" data-nkm="mute">Hide tips</button>';
    widget.bubble.innerHTML = html + '<button type="button" class="nkm-x" data-nkm="close" aria-label="Dismiss">\u00d7</button>';
    widget.bubble.hidden = false; lastBubbleAt = Date.now();
    clearTimeout(bubbleTimer);
    bubbleTimer = window.setTimeout(hideBubble, o.ms || (o.ask || o.href ? 9000 : 6500));
  }
  function refreshDot() { if (widget.dot) widget.dot.hidden = !getProfile() || !!Number(SS.get('nkm_dot_seen') || 0); }

  /* ---------- reactions ---------- */
  function setClass(c, on) { if (widget.el) widget.el.classList.toggle(c, on); }
  function react(kind, o) {
    if (!widget.el) return;
    if (kind === 'joy') {
      if (Date.now() - lastJoyAt < 1500) return; lastJoyAt = Date.now();
      setClass('is-lab', false); setClass('is-joy', false); void widget.el.offsetWidth; setClass('is-joy', true);
      clearTimeout(joyTimer); joyTimer = window.setTimeout(function () { setClass('is-joy', false); }, 1100);
      if (!(o && o.silent) && Date.now() - lastBubbleAt > 6000) say(['Great pick!', 'Added to your routine.', 'Lovely choice!'][Math.floor(Math.random() * 3)], { ms: 2200 });
    } else if (kind === 'lab') {
      if (widget.el.classList.contains('is-joy')) return;
      setClass('is-lab', true); clearTimeout(labTimer);
      labTimer = window.setTimeout(function () { setClass('is-lab', false); }, (o && o.ms) || 2400);
    }
  }
  function cartCount() { try { return (JSON.parse(LS.get('nikora_cart') || '[]') || []).reduce(function (n, i) { return n + (Number(i && (i.qty != null ? i.qty : i.quantity)) || 1); }, 0); } catch (e) { return 0; } }
  var LAB_SEL = '[data-nk-ingredient],[data-nk-lab],.ingredient,.ingredient-chip,.key-active,#panel-science li,#panel-science strong,.mech-btn';

  /* ---------- idle life: blink + ear wiggle (paused while the tab is hidden or when reduced motion is on) ---------- */
  function lifeLoop() {
    if (reduceMotion() || !widget.live) return;
    function blink() {
      if (doc.hidden) return;
      widget.live.classList.add('is-blink');
      window.setTimeout(function () { widget.live.classList.remove('is-blink'); if (Math.random() < 0.28) window.setTimeout(function () { widget.live.classList.add('is-blink'); window.setTimeout(function () { widget.live.classList.remove('is-blink'); }, 110); }, 150); }, 120);
    }
    function wiggle() { if (doc.hidden) return; widget.live.classList.add('is-wiggle'); window.setTimeout(function () { widget.live.classList.remove('is-wiggle'); }, 900); }
    (function loopB() { window.setTimeout(function () { blink(); loopB(); }, 2800 + Math.random() * 3200); })();
    (function loopW() { window.setTimeout(function () { wiggle(); loopW(); }, 7000 + Math.random() * 6000); })();
  }

  /* ---------- idle nudge (>15 s without interaction): one helpful bubble, at most 3 per visit, never at checkout ---------- */
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(function () {
      if (doc.hidden || muted() || (widget.pop && !widget.pop.hidden)) return;
      var n = Number(SS.get(NUDGE_KEY) || 0);
      if (n >= CFG.maxNudges || Date.now() - lastBubbleAt < 45000) return;
      SS.set(NUDGE_KEY, String(n + 1));
      var note = personalNote() || pageTip();
      if (widget.live && !reduceMotion()) { widget.live.classList.add('is-wiggle'); window.setTimeout(function () { widget.live.classList.remove('is-wiggle'); }, 900); }
      say(note.text, { ask: note.ask, href: note.href, hrefLabel: note.hrefLabel });
    }, CFG.idleMs);
  }
  function onActivity() { var t = Date.now(); if (t - lastActivity < 400) return; lastActivity = t; armIdle(); }

  /* ---------- quick guidance popup ---------- */
  function popHtml() {
    var p = getProfile(), note = personalNote(), chips = [];
    chips.push('<a class="nkm-chip" href="catalog.html?filter=bestsellers">Bestsellers</a>');
    if (p && p.concerns.indexOf('Hydration') >= 0) chips.push('<a class="nkm-chip" href="catalog.html?concern=Hydration">Hydration picks</a>');
    chips.push('<a class="nkm-chip" href="track-order.html">Track an order</a>');
    var intro = note ? esc(note.text.replace(/^Mascot Note:\s*/, '')) : 'Hi, I am the NIKORA Rabbit. Tell the Beauty Concierge your skin type and goals and I will remember them on every page.';
    return '<button type="button" class="nkm-x" data-nkm="closepop" aria-label="Close">\u00d7</button>' +
      '<p class="nkm-pop-h">' + (note ? 'Mascot Note' : 'NIKORA Rabbit') + (p ? ' \u00b7 ' + esc(profileLabel(p)) : '') + '</p>' +
      '<p class="nkm-pop-t">' + intro + '</p><div class="nkm-chips">' + chips.join('') + '</div>' +
      '<button type="button" class="nkm-go" data-nkm="ask">Chat with the Concierge</button>' +
      '<div class="nkm-foot">' + (p ? '<button type="button" data-nkm="forget">Clear my skin profile</button>' : '<span></span>') +
      '<button type="button" data-nkm="' + (muted() ? 'unmute' : 'mute') + '">' + (muted() ? 'Show tips' : 'Hide tips') + '</button></div>';
  }
  function openPop() {
    hideBubble(); widget.pop.innerHTML = popHtml(); widget.pop.hidden = false;
    widget.fab.setAttribute('aria-expanded', 'true'); SS.set('nkm_dot_seen', '1'); refreshDot();
    var go = widget.pop.querySelector('.nkm-go'); if (go) go.focus();
  }
  function closePop(skipFocus) {
    if (!widget.pop || widget.pop.hidden) return;
    widget.pop.hidden = true; widget.fab.setAttribute('aria-expanded', 'false'); if (!skipFocus) widget.fab.focus();
  }

  function lift() {
    var bar = doc.getElementById('mobile-cta-bar'), v = 0;
    if (bar) { var cs = window.getComputedStyle(bar); if (cs.display !== 'none' && !/matrix\([^)]*,\s*[1-9]\d*\)$/.test(cs.transform) && bar.getBoundingClientRect().top < window.innerHeight) v = bar.offsetHeight + 8; }
    if (widget.el) widget.el.style.setProperty('--nkm-lift', v + 'px');
  }

  function initCompanion() {
    if (!CFG.widget || doc.getElementById('nkm-widget')) return;
    var path = location.pathname.toLowerCase();
    for (var i = 0; i < CFG.hideOn.length; i++) if (path.indexOf(CFG.hideOn[i]) >= 0) return;     /* no popups while paying */
    var st = doc.createElement('style'); st.id = 'nk-mascot-live-css'; st.textContent = COMPANION_CSS; (doc.head || doc.documentElement).appendChild(st);
    var el = doc.createElement('div');
    el.className = 'nkm-widget'; el.id = 'nkm-widget'; el.setAttribute('data-side', CFG.side === 'right' ? 'right' : 'left');
    el.innerHTML = '<div class="nkm-bubble" role="status" aria-live="polite" hidden></div><div class="nkm-pop" role="dialog" aria-label="NIKORA Rabbit guide" hidden></div>' +
      '<button type="button" class="nkm-fab" aria-label="Open the NIKORA Rabbit guide" aria-expanded="false"><span class="nkm-float">' + liveSvg() + '</span><span class="nkm-dot" hidden></span></button>';
    doc.body.appendChild(el);
    widget.el = el; widget.bubble = el.querySelector('.nkm-bubble'); widget.pop = el.querySelector('.nkm-pop');
    widget.fab = el.querySelector('.nkm-fab'); widget.dot = el.querySelector('.nkm-dot'); widget.live = el.querySelector('.nkm-live');

    widget.fab.addEventListener('click', function () { if (widget.pop.hidden) openPop(); else closePop(); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-nkm]'); if (!b) return;
      var a = b.getAttribute('data-nkm');
      if (a === 'ask') openAssistant();
      else if (a === 'close') hideBubble();
      else if (a === 'closepop') closePop();
      else if (a === 'mute') { LS.set(MUTE_KEY, String(Date.now() + 7 * 864e5)); hideBubble(); if (!widget.pop.hidden) widget.pop.innerHTML = popHtml(); }
      else if (a === 'unmute') { LS.del(MUTE_KEY); if (!widget.pop.hidden) widget.pop.innerHTML = popHtml(); }
      else if (a === 'forget') { forget(); widget.pop.innerHTML = popHtml(); }
    });
    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!widget.pop.hidden) closePop(); else hideBubble(); } });
    doc.addEventListener('click', function (e) { if (widget.pop && !widget.pop.hidden && !el.contains(e.target)) closePop(true); }, true);
    window.addEventListener('nikora:assistant-open', function () { closePop(true); hideBubble(); });

    /* joyful bounce when something was really added to the cart (the bag count went up after the click) */
    doc.addEventListener('click', function () { var before = cartCount(); window.setTimeout(function () { if (cartCount() > before) react('joy'); }, 350); }, true);
    /* "Lab Specialist" while the pointer is on a key ingredient */
    doc.addEventListener('pointerover', function (e) {
      var t = e.target.closest && e.target.closest(LAB_SEL); if (!t) return;
      react('lab', { ms: 2600 });
      var msg = t.getAttribute && t.getAttribute('data-nk-lab'); if (msg && Date.now() - lastBubbleAt > 4000) say(msg, { ms: 4200, quiet: true });
    });
    ['pointermove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(function (ev) { window.addEventListener(ev, onActivity, { passive: true }); });
    doc.addEventListener('visibilitychange', function () { if (!doc.hidden) armIdle(); });
    window.setInterval(lift, 800); lift(); refreshDot(); lifeLoop(); armIdle();
  }

  injectCss();
  var api = { version: '1.0', svg: svg, tip: tip, help: help, empty: empty, enhance: enhance, poses: Object.keys(POSES),
    learn: learn, setProfile: setProfile, getProfile: getProfile, forget: forget, say: say, react: react, open: openAssistant };
  window.NKMascot = api;

  function start() {
    enhance(doc.body);
    initCompanion();
    if (window.MutationObserver) {
      var queue = [], raf = 0;
      new MutationObserver(function (list) {
        list.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) queue.push(n); }); });
        if (queue.length && !raf) raf = window.requestAnimationFrame(function () { raf = 0; var q = queue; queue = []; q.forEach(enhance); });
      }).observe(doc.body, { childList: true, subtree: true });
    }
    doc.addEventListener('click', function (e) {                                  /* the cart CTA closes the drawer before navigating */
      var a = e.target.closest && e.target.closest('[data-nkm-close-cart]');
      if (a && typeof window.closeCart === 'function') { try { window.closeCart(); } catch (err) {} }
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
