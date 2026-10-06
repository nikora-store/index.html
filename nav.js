/*!
 * NIKORA shared navigation  -  nav.js
 * ---------------------------------------------------------------------------
 * ONE file that renders the header, the mobile drawer and the footer for ALL
 * pages, and loads the floating Beauty Concierge (ai-assistant.js) everywhere.
 *
 * USAGE (one line, first thing in <body>):
 *     <script src="nav.js"></script>
 *   or put <div id="nikora-nav"></div> where the header goes and load nav.js anywhere.
 *
 * To add / rename / move a page, edit CONFIG below. Nothing else needs touching.
 * Active page is detected from the URL automatically.
 *
 * FOOTER: replaces the page's own <footer> (so every page is identical). If a
 * page has no <footer>, one is appended to the end of <body>.
 *
 * Works with the page's existing  openCart(), setTheme(), #cart-count  (all optional):
 *   - cart button   -> id="open-cart-btn"  (calls window.openCart())
 *   - cart badge    -> id="cart-count"     (page's cart code keeps it up to date)
 *   - theme buttons -> call window.setTheme(mode) if the page has it, otherwise
 *                      set <html data-theme> + localStorage 'theme' themselves
 *   - styles use the page's CSS variables (--text, --gold, --line ...) with
 *     built-in light/dark fallbacks, so it also looks right on pages that lack them.
 *
 * Public API:
 *   window.NikoraNav = { openMenu, closeMenu, config }
 *   window.openAiAssistant()   opens the Beauty Concierge chat (loads it first if needed)
 */
(function () {
  'use strict';
  if (window.NikoraNav) return;                       // never inject twice
  var SELF_SRC = (document.currentScript && document.currentScript.src) || '';   // lets ai-assistant.js load from the same folder

  /* ======================================================================
   * 1. CONFIG  -  single source of truth for every page
   * ====================================================================== */
  var CONFIG = {
    logoHref: 'index.html',
    breakpoint: 1180,                                 // px: below this the burger + drawer replace the bar
    tagline: 'Smart care. Instant glow. Beauty tech designed around the routine you actually have time for.',
    hours: 'Concierge support: Mon\u2013Sun, 8am\u201310pm EST',
    shipNote: 'Free Express Shipping on orders over $50',

    /* Desktop header bar */
    header: [
      { label: 'Home',        href: 'index.html' },
      { label: 'Shop',        href: 'catalog.html' },
      { label: 'Science',     href: 'science.html' },
      { label: 'Reviews',     href: 'reviews.html' },
      { label: 'Track Order', href: 'track-order.html' },
      { label: 'FAQ',         href: 'faq.html' },
      { label: 'Contact',     href: 'contact.html' }
    ],

    /* Footer columns (the mobile drawer reuses the same groups, so they never drift apart).
       A link is { label, href }  or  { label, action: 'ai' } for the Beauty Concierge. */
    columns: [
      { title: 'Explore NIKORA', icon: 'bag', links: [
        { label: 'Home',             href: 'index.html' },
        { label: 'Collection',       href: 'catalog.html' },
        { label: 'The Science',      href: 'science.html' },
        { label: 'Customer Reviews', href: 'reviews.html' }
      ] },
      { title: 'Customer Care', icon: 'box', links: [
        { label: 'Track Order',       href: 'track-order.html' },
        { label: 'Returns Portal',    href: 'returns.html' },
        { label: '100-Day Guarantee', href: 'guarantee.html' },
        { label: 'FAQ Center',        href: 'faq.html' },
        { label: 'Contact Support',   href: 'contact.html' }
      ] },
      { title: 'Legal & Concierge', icon: 'shield', links: [
        { label: 'Privacy Policy & Terms', href: 'privacy.html' },
        { label: 'AI Beauty Concierge',    action: 'ai', icon: 'sparkle' },
        { label: 'Support Email',          href: 'mailto:nikora.support@gmail.com' }
      ] }
    ],

    /* pages that live "inside" another page's section (highlights the parent in the bar) */
    parents: { 'product.html': 'catalog.html' }
  };

  /* ======================================================================
   * 2. helpers
   * ====================================================================== */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fileOf(href) {                              // 'x/Catalog.html?a=1#b' -> 'catalog.html'
    var f = String(href || '').split('#')[0].split('?')[0].split('/').pop().toLowerCase();
    if (!f) f = 'index.html';
    if (f.indexOf('.') < 0) f += '.html';              // clean URLs: /catalog -> catalog.html
    return f;
  }
  var CURRENT = fileOf(location.pathname);
  var SECTION = CONFIG.parents[CURRENT] || '';         // e.g. product.html -> catalog.html
  function state(href) {
    if (!href || /^(mailto:|tel:|https?:)/i.test(href)) return '';
    var f = fileOf(href);
    return f === CURRENT ? 'page' : (SECTION && f === SECTION ? 'section' : '');
  }
  function activeAttrs(st) { return st === 'page' ? ' aria-current="page"' : ''; }
  function activeClass(st) { return st ? ' is-current' : ''; }

  /* ---- icons (pure SVG, no emoji) ---- */
  function svg(inner, cls) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  var ICON = {
    bag:     '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>',
    box:     '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.5L12 12l8.7-4.5M12 22V12"/>',
    shield:  '<path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/>',
    sparkle: '<path d="M12 3c.6 5 3 7.4 8 8-5 .6-7.4 3-8 8-.6-5-3-7.4-8-8 5-.6 7.4-3 8-8z"/><path d="M19 3v4M17 5h4"/>',
    arrow:   '<path d="M9 6l6 6-6 6"/>',
    close:   '<path d="M6 6l12 12M18 6L6 18"/>',
    burger:  '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:    '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    cart:    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>'
  };
  function ico(name, cls) { return svg(ICON[name] || ICON.arrow, cls); }

  /* ======================================================================
   * 3. CSS  (namespaced .nkn-*  -> cannot clash with page styles)
   * ====================================================================== */
  var BP = CONFIG.breakpoint;
  var CSS = [
  '.nkn-header,.nkn-overlay,.nkn-drawer,.nkn-footer{',
  '  --nkn-text:var(--text,#1A1615); --nkn-soft:var(--text-soft,rgba(26,22,21,.62)); --nkn-faint:var(--text-faint,rgba(26,22,21,.45));',
  '  --nkn-gold:var(--gold,#C59B56); --nkn-gold-rgb:var(--gold-rgb,197,155,86); --nkn-line:var(--line,rgba(26,22,21,.1));',
  '  --nkn-bar:var(--header-bg,rgba(250,247,242,.78)); --nkn-card:var(--card-bg,rgba(255,255,255,.65));',
  '  --nkn-border:var(--card-border,rgba(230,220,210,.6)); --nkn-panel:var(--surface-raised,rgba(255,255,255,.88));',
  '  --nkn-tint:var(--surface-tint,rgba(26,22,21,.04)); --nkn-rose:var(--rose,#D81E5B);',
  '}',
  ':root[data-theme="dark"] .nkn-header,:root[data-theme="dark"] .nkn-overlay,:root[data-theme="dark"] .nkn-drawer,:root[data-theme="dark"] .nkn-footer{',
  '  --nkn-text:var(--text,#F7F4F0); --nkn-soft:var(--text-soft,rgba(247,244,240,.64)); --nkn-faint:var(--text-faint,rgba(247,244,240,.4));',
  '  --nkn-gold:var(--gold,#E5BA73); --nkn-gold-rgb:var(--gold-rgb,229,186,115); --nkn-line:var(--line,rgba(255,255,255,.09));',
  '  --nkn-bar:var(--header-bg,rgba(13,11,18,.72)); --nkn-card:var(--card-bg,rgba(25,20,32,.55));',
  '  --nkn-border:var(--card-border,rgba(255,255,255,.08)); --nkn-panel:var(--surface-raised,rgba(30,25,38,.9));',
  '  --nkn-tint:var(--surface-tint,rgba(255,255,255,.05)); --nkn-rose:var(--rose,#FF527B);',
  '}',

  /* ---- header bar (glass) ---- */
  '.nkn-header{position:sticky;top:0;z-index:400;height:73px;box-sizing:border-box;color:var(--nkn-text);',
  '  background:var(--nkn-bar);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);',
  '  border-bottom:1px solid var(--nkn-line);font-family:inherit;}',
  '.nkn-header *,.nkn-drawer *,.nkn-footer *{box-sizing:border-box;}',
  '.nkn-row{display:flex;align-items:center;justify-content:space-between;gap:24px;height:100%;padding:0 clamp(20px,4vw,48px);}',
  '.nkn-logo{font-family:"Playfair Display",Georgia,serif;font-size:24px;letter-spacing:.06em;font-weight:600;color:var(--nkn-text);text-decoration:none;white-space:nowrap;}',
  '.nkn-logo em{font-style:italic;color:var(--nkn-gold);}',

  /* ---- desktop links ---- */
  '.nkn-primary{display:flex;align-items:center;gap:clamp(16px,1.9vw,28px);}',
  '.nkn-link{position:relative;display:inline-flex;align-items:center;padding:6px 0;background:none;border:0;cursor:pointer;',
  '  font:inherit;font-size:13.5px;font-weight:500;letter-spacing:.02em;color:var(--nkn-soft);text-decoration:none;white-space:nowrap;transition:color .2s ease;}',
  '.nkn-link::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:1px;background:var(--nkn-gold);transform:scaleX(0);transform-origin:left;transition:transform .28s ease;}',
  '.nkn-link:hover,.nkn-link:focus-visible,.nkn-link.is-current{color:var(--nkn-text);}',
  '.nkn-link:hover::after,.nkn-link.is-current::after{transform:scaleX(1);}',
  '.nkn-link:focus-visible,.nkn-d-link:focus-visible,.nkn-btn:focus-visible,.nkn-logo:focus-visible,.nkn-f-link:focus-visible{outline:2px solid var(--nkn-gold);outline-offset:3px;border-radius:6px;}',

  /* ---- right-hand actions ---- */
  '.nkn-actions{display:flex;align-items:center;gap:12px;}',
  '.nkn-pill{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:100px;background:var(--nkn-card);border:1px solid var(--nkn-line);}',
  '.nkn-pill button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:none;cursor:pointer;color:var(--nkn-soft);transition:background .2s ease,color .2s ease;}',
  '.nkn-pill button svg{width:15px;height:15px;}',
  '.nkn-pill button.active{background:var(--nkn-gold);color:#241c0f;}',
  '.nkn-btn{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;cursor:pointer;color:var(--nkn-text);',
  '  background:var(--nkn-card);border:1px solid var(--nkn-line);transition:border-color .2s ease,transform .2s ease;}',
  '.nkn-btn:hover{border-color:var(--nkn-gold);transform:translateY(-1px);}',
  '.nkn-btn svg{width:18px;height:18px;}',
  '.nkn-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;border-radius:100px;background:var(--nkn-rose);color:#fff;',
  '  font-size:10.5px;font-weight:700;line-height:18px;text-align:center;transition:transform .2s ease;}',
  '.nkn-badge.bump{transform:scale(1.3);}',
  '.nkn-burger{display:none;}',

  /* ---- mobile / tablet drawer (slides in from the left, glass) ---- */
  '.nkn-overlay{position:fixed;inset:0;z-index:1980;background:rgba(10,8,12,.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);',
  '  opacity:0;visibility:hidden;pointer-events:none;transition:opacity .3s ease,visibility 0s linear .3s;}',
  '.nkn-overlay.active{opacity:1;visibility:visible;pointer-events:auto;transition-delay:0s;}',
  '.nkn-drawer{position:fixed;top:0;left:0;bottom:0;z-index:1990;width:min(340px,88vw);display:flex;flex-direction:column;color:var(--nkn-text);',
  '  background:var(--nkn-panel);-webkit-backdrop-filter:blur(24px) saturate(170%);backdrop-filter:blur(24px) saturate(170%);',
  '  border-right:1px solid var(--nkn-border);box-shadow:24px 0 70px -24px rgba(0,0,0,.45);font-family:inherit;',
  '  transform:translateX(-102%);visibility:hidden;transition:transform .4s cubic-bezier(.2,.8,.2,1),visibility 0s linear .4s;}',
  '.nkn-drawer.active{transform:translateX(0);visibility:visible;transition-delay:0s;}',
  '.nkn-d-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:20px 20px 18px;border-bottom:1px solid var(--nkn-line);}',
  '.nkn-d-close{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;cursor:pointer;color:var(--nkn-text);background:var(--nkn-card);border:1px solid var(--nkn-line);transition:transform .25s ease,border-color .2s ease;}',
  '.nkn-d-close:hover{border-color:var(--nkn-gold);transform:rotate(90deg);}',
  '.nkn-d-close svg{width:16px;height:16px;}',
  '.nkn-d-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 12px 16px;}',
  '.nkn-d-sec{padding:14px 0 4px;}',
  '.nkn-d-title{display:flex;align-items:center;gap:8px;padding:0 10px 8px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--nkn-faint);}',
  '.nkn-d-title svg{width:14px;height:14px;color:var(--nkn-gold);}',
  '.nkn-d-link{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:12px 12px 12px 14px;border-radius:12px;text-decoration:none;',
  '  background:none;border:0;cursor:pointer;text-align:left;font:inherit;font-size:15px;font-weight:500;color:var(--nkn-soft);transition:background .18s ease,color .18s ease;}',
  '.nkn-d-link svg{width:15px;height:15px;opacity:.45;flex:none;transition:transform .18s ease,opacity .18s ease;}',
  '.nkn-d-link:hover,.nkn-d-link:focus-visible{background:var(--nkn-tint);color:var(--nkn-text);}',
  '.nkn-d-link:hover svg{transform:translateX(3px);opacity:.9;}',
  '.nkn-d-link.is-current{background:rgba(var(--nkn-gold-rgb),.14);color:var(--nkn-text);font-weight:600;}',
  '.nkn-d-link.is-current::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--nkn-gold);}',
  '.nkn-d-link.is-current svg,.nkn-d-ai svg{color:var(--nkn-gold);opacity:1;}',
  '.nkn-d-foot{flex:none;display:flex;align-items:center;justify-content:space-between;padding:16px 20px calc(18px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--nkn-line);',
  '  font-size:13px;font-weight:600;color:var(--nkn-soft);}',
  '.nkn-drawer.active .nkn-d-sec{animation:nknIn .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 60ms + 120ms);}',
  '@keyframes nknIn{from{opacity:0;transform:translateX(-14px);}to{opacity:1;transform:none;}}',

  /* ---- footer (replaces the page footer) ---- */
  '.nkn-footer{display:block;width:100%;max-width:none;margin:20px 0 0;padding:60px 0 28px;color:var(--nkn-text);font-family:inherit;',
  '  border-top:1px solid var(--nkn-line);background:linear-gradient(180deg,rgba(var(--nkn-gold-rgb),.05),transparent 65%);}',
  '.nkn-f-wrap{max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px);}',
  '.nkn-f-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:40px;margin-bottom:44px;}',
  '.nkn-f-brand p{margin:14px 0 0;max-width:320px;font-size:13.5px;line-height:1.65;color:var(--nkn-soft);}',
  '.nkn-f-brand .nkn-f-hours{font-size:12px;color:var(--nkn-faint);margin-top:12px;}',
  '.nkn-f-col h5{margin:0 0 14px;font-family:inherit;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--nkn-faint);}',
  '.nkn-f-link{display:flex;align-items:center;gap:8px;width:max-content;max-width:100%;padding:6px 0;background:none;border:0;cursor:pointer;text-align:left;text-decoration:none;',
  '  font:inherit;font-size:13.5px;color:var(--nkn-soft);transition:color .2s ease,transform .2s ease;}',
  '.nkn-f-link svg{width:14px;height:14px;flex:none;color:var(--nkn-gold);}',
  '.nkn-f-link:hover,.nkn-f-link:focus-visible,.nkn-f-link.is-current{color:var(--nkn-gold);transform:translateX(2px);}',
  '.nkn-f-bottom{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-top:26px;border-top:1px solid var(--nkn-line);font-size:12px;color:var(--nkn-faint);}',
  '@media (max-width:900px){.nkn-f-grid{grid-template-columns:1fr 1fr;gap:32px;}.nkn-f-brand{grid-column:1 / -1;}}',
  '@media (max-width:480px){.nkn-f-grid{grid-template-columns:1fr;gap:26px;}.nkn-footer{padding-top:44px;}}',

  /* ---- responsive: below the breakpoint the bar collapses into the burger ---- */
  '@media (max-width:' + (BP - 0.02) + 'px){',
  '  .nkn-primary{display:none;}',
  '  .nkn-burger{display:grid;}',
  '  .nkn-row{gap:14px;}',
  '}',
  '@media (max-width:360px){ .nkn-header .nkn-pill{display:none;} }',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkn-drawer,.nkn-overlay,.nkn-link::after,.nkn-f-link{transition-duration:.001s !important;transition-delay:0s !important;}',
  '  .nkn-drawer.active .nkn-d-sec{animation:none;}',
  '}'
  ].join('\n');

  /* ======================================================================
   * 4. MARKUP
   * ====================================================================== */
  function logoHtml(extra) {
    return '<a class="nkn-logo"' + (extra || '') + ' href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">NIK<em>ora</em></a>';
  }
  function themePill(idSuffix) {
    return '<div class="nkn-pill" role="group" aria-label="Theme switcher">' +
      '<button type="button" id="theme-light-btn' + idSuffix + '" data-nkn-theme="light" aria-label="Light theme">' + ico('sun') + '</button>' +
      '<button type="button" id="theme-dark-btn' + idSuffix + '" data-nkn-theme="dark" aria-label="Dark theme">' + ico('moon') + '</button>' +
    '</div>';
  }

  function buildHeader() {
    var links = CONFIG.header.map(function (p) {
      var st = state(p.href);
      return '<a class="nkn-link' + activeClass(st) + '" href="' + esc(p.href) + '"' + activeAttrs(st) + '>' + esc(p.label) + '</a>';
    }).join('');

    return '<header class="nkn-header" id="nkn-header">' +
      '<div class="nkn-row">' +
        logoHtml(' id="nkn-logo"') +
        '<nav class="nkn-primary" aria-label="Primary">' + links + '</nav>' +
        '<div class="nkn-actions">' +
          themePill('') +
          '<button type="button" class="nkn-btn" id="open-cart-btn" aria-label="Open cart">' + ico('cart') + '<span class="nkn-badge" id="cart-count">0</span></button>' +
          '<button type="button" class="nkn-btn nkn-burger" id="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu-drawer">' + ico('burger') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function buildDrawer() {
    var secs = CONFIG.columns.map(function (sec, i) {
      var links = sec.links.map(function (l) {
        if (l.action === 'ai') {
          return '<button type="button" class="nkn-d-link nkn-d-ai" data-nkn-ai><span>' + esc(l.label) + '</span>' + ico(l.icon || 'sparkle') + '</button>';
        }
        var st = state(l.href);
        return '<a class="nkn-d-link' + activeClass(st) + '" href="' + esc(l.href) + '"' + activeAttrs(st) + '><span>' + esc(l.label) + '</span>' + ico('arrow') + '</a>';
      }).join('');
      return '<section class="nkn-d-sec" style="--i:' + i + '" aria-label="' + esc(sec.title) + '">' +
        '<div class="nkn-d-title">' + ico(sec.icon) + esc(sec.title) + '</div>' + links + '</section>';
    }).join('');

    return '<div class="nkn-overlay" id="mobile-menu-overlay"></div>' +
      '<aside class="nkn-drawer" id="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Site navigation" aria-hidden="true">' +
        '<div class="nkn-d-head">' + logoHtml() +
          '<button type="button" class="nkn-d-close" id="close-mobile-menu" aria-label="Close menu">' + ico('close') + '</button>' +
        '</div>' +
        '<nav class="nkn-d-body" aria-label="Site pages">' + secs + '</nav>' +
        '<div class="nkn-d-foot"><span>Theme</span>' + themePill('-mobile') + '</div>' +
      '</aside>';
  }

  function buildFooterHtml() {
    var cols = CONFIG.columns.map(function (sec, i) {
      var hid = 'nkn-f-h' + i;
      var links = sec.links.map(function (l) {
        if (l.action === 'ai') {
          return '<button type="button" class="nkn-f-link" data-nkn-ai>' + ico(l.icon || 'sparkle') + esc(l.label) + '</button>';
        }
        var st = state(l.href);
        return '<a class="nkn-f-link' + activeClass(st) + '" href="' + esc(l.href) + '"' + activeAttrs(st) + '>' + esc(l.label) + '</a>';
      }).join('');
      return '<nav class="nkn-f-col" aria-labelledby="' + hid + '"><h5 id="' + hid + '">' + esc(sec.title) + '</h5>' + links + '</nav>';
    }).join('');

    return '<div class="nkn-f-wrap">' +
      '<div class="nkn-f-grid">' +
        '<div class="nkn-f-brand">' + logoHtml() + '<p>' + esc(CONFIG.tagline) + '</p><p class="nkn-f-hours">' + esc(CONFIG.hours) + '</p></div>' +
        cols +
      '</div>' +
      '<div class="nkn-f-bottom"><span>&copy; ' + new Date().getFullYear() + ' NIKORA. All rights reserved.</span><span>' + esc(CONFIG.shipNote) + '</span></div>' +
    '</div>';
  }

  /* ======================================================================
   * 5. MOUNT  (header synchronous where the <script> tag sits -> no flash of missing header;
   *            footer once the page has been parsed)
   * ====================================================================== */
  function injectStyle() {
    if (document.getElementById('nkn-style')) return;
    var st = document.createElement('style');
    st.id = 'nkn-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  var HTML = buildHeader() + buildDrawer();
  var mounted = false;
  function mount() {
    if (mounted) return; mounted = true;
    injectStyle();
    var holder = document.getElementById('nikora-nav');
    var script = document.currentScript;
    if (holder) { holder.outerHTML = HTML; }
    else if (script && script.parentNode && script.parentNode !== document.head) { script.insertAdjacentHTML('beforebegin', HTML); }
    else { document.body.insertAdjacentHTML('afterbegin', HTML); }
    wire();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFooter); else mountFooter();
    loadAssistant();
  }

  function mountFooter() {
    if (document.querySelector('footer.nkn-footer')) return;
    var feet = document.querySelectorAll('footer');
    var old = document.querySelector('footer.site') || (feet.length ? feet[feet.length - 1] : null);
    var el = document.createElement('footer');
    el.className = 'nkn-footer';
    el.innerHTML = buildFooterHtml();
    if (old && old.parentNode) {
      if (old.id) el.id = old.id;                              /* keep any in-page anchor (e.g. #track) working */
      old.parentNode.replaceChild(el, old);
    } else {
      document.body.appendChild(el);
    }
  }

  /* ======================================================================
   * 6. BEAUTY CONCIERGE LOADER  (ai-assistant.js, same folder as nav.js)
   * ====================================================================== */
  function loadAssistant() {
    if (window.NikoraAssistant) return;
    if (document.getElementById('nkai-loader') || document.querySelector('script[src*="ai-assistant"]')) return;
    var base = SELF_SRC ? SELF_SRC.replace(/[^\\/?#]*([?#].*)?$/, '') : '';
    var el = document.createElement('script');
    el.id = 'nkai-loader'; el.async = true; el.src = base + 'ai-assistant.js';
    (document.head || document.documentElement).appendChild(el);
  }
  /* Opens the chat; if the widget is still loading (or not requested yet) it waits for it. */
  window.openAiAssistant = function () {
    if (window.NikoraAssistant) { window.NikoraAssistant.open(); return; }
    loadAssistant();
    var tries = 0, timer = setInterval(function () {
      if (window.NikoraAssistant) { clearInterval(timer); window.NikoraAssistant.open(); }
      else if (++tries > 60) clearInterval(timer);            /* give up after ~6s (e.g. file missing) */
    }, 100);
  };

  /* ======================================================================
   * 7. BEHAVIOUR
   * ====================================================================== */
  function $(id) { return document.getElementById(id); }
  var drawer, overlay, burger, closeBtn, lastFocus = null;

  /* ---- mobile drawer ---- */
  function drawerOpen() { return drawer.classList.contains('active'); }
  function openMenu() {
    if (drawerOpen()) return;                       /* idempotent: safe to call twice */
    lastFocus = document.activeElement;
    drawer.classList.add('active'); overlay.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false'); burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { if (drawerOpen()) closeBtn.focus(); }, 60);
  }
  function closeMenu(skipFocus) {
    if (!drawerOpen()) return;
    drawer.classList.remove('active'); overlay.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true'); burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (skipFocus !== true && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (err) {} }
  }
  function trapFocus(e) {                           /* keep Tab inside the open drawer */
    if (e.key !== 'Tab' || !drawerOpen()) return;
    var f = drawer.querySelectorAll('a[href],button:not([disabled])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ---- theme ---- */
  function themeNow() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function syncTheme() {
    var m = themeNow();
    Array.prototype.forEach.call(document.querySelectorAll('[data-nkn-theme]'), function (b) {
      var on = b.getAttribute('data-nkn-theme') === m;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function applyTheme(mode) {
    if (typeof window.setTheme === 'function') { window.setTheme(mode); }      /* page's own handler (also stores it) */
    else {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem('theme', mode); } catch (e) {}
    }
    syncTheme();
  }

  /* ---- cart badge fallback (the page's cart code normally owns it) ---- */
  function badgeFromStorage() {
    var el = $('cart-count'); if (!el || el.getAttribute('data-nkn-set')) return;
    try {
      var c = JSON.parse(localStorage.getItem('nikora_cart') || '[]');
      el.textContent = Array.isArray(c) ? c.reduce(function (n, i) { return n + (Number(i && i.qty) || 0); }, 0) : 0;
    } catch (e) {}
  }

  function wire() {
    drawer = $('mobile-menu-drawer'); overlay = $('mobile-menu-overlay'); burger = $('mobile-menu-btn'); closeBtn = $('close-mobile-menu');

    burger.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', function () { closeMenu(); });
    overlay.addEventListener('click', function () { closeMenu(); });
    drawer.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      if (t.closest('[data-nkn-ai]')) return;                                 /* handled by the global AI handler below */
      if (t.closest('a[href]')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawerOpen()) closeMenu();
      trapFocus(e);
    });
    var wide = window.matchMedia ? window.matchMedia('(min-width:' + BP + 'px)') : null;
    if (wide) {
      var onWide = function (e) { if (e.matches) closeMenu(true); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    }

    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var th = t.closest('[data-nkn-theme]'); if (th) { applyTheme(th.getAttribute('data-nkn-theme')); return; }
      if (t.closest('#open-cart-btn')) { if (typeof window.openCart === 'function') window.openCart(); return; }
      if (t.closest('[data-nkn-ai]')) { closeMenu(true); window.openAiAssistant(); return; }
      var logo = t.closest('#nkn-logo');                                       /* on the home page the logo scrolls to the top */
      if (logo && CURRENT === 'index.html' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    });

    if (!document.documentElement.hasAttribute('data-theme')) {                /* pages without their own theme bootstrap */
      var saved = ''; try { saved = localStorage.getItem('theme') || ''; } catch (e) {}
      if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
    }
    syncTheme();
    if (window.MutationObserver) new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    badgeFromStorage();
    window.addEventListener('storage', badgeFromStorage);
  }

  /* ======================================================================
   * 8. PUBLIC API
   * ====================================================================== */
  window.NikoraNav = { openMenu: openMenu, closeMenu: closeMenu, config: CONFIG };
  /* legacy global names used by older page code (pages' own definitions may delegate to these) */
  if (typeof window.openMobileMenu !== 'function')  window.openMobileMenu = openMenu;
  if (typeof window.closeMobileMenu !== 'function') window.closeMobileMenu = closeMenu;

  if (document.body || document.currentScript) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }
})();
