/*!
 * NIKORA shared navigation  -  nav.js
 * ---------------------------------------------------------------------------
 * ONE file that renders the header, the "More" dropdown and the mobile drawer
 * for ALL 11 pages, so every page stays identical.
 *
 * USAGE (one line, placed where the header should appear, first thing in <body>):
 *     <script src="nav.js"></script>
 *   or put <div id="nikora-nav"></div> where the header goes and load nav.js anywhere.
 *
 * To add / rename / move a page, edit CONFIG below. Nothing else needs touching.
 * Active page is detected from the URL automatically.
 *
 * Works with the page's existing  openCart(), setTheme(), #cart-count  (all optional):
 *   - cart button   -> id="open-cart-btn"  (calls window.openCart())
 *   - cart badge    -> id="cart-count"     (page's cart code keeps it up to date)
 *   - theme buttons -> call window.setTheme(mode) if the page has it, otherwise
 *                      set <html data-theme> + localStorage 'theme' themselves
 *   - styles use the page's CSS variables (--text, --gold, --line ...) with
 *     built-in light/dark fallbacks, so it also looks right on pages that lack them.
 * Public API: window.NikoraNav = { openMenu, closeMenu, openMore, closeMore, config }
 */
(function () {
  'use strict';
  if (window.NikoraNav) return;                       // never inject twice

  /* ======================================================================
   * 1. CONFIG  -  single source of truth for all 11 pages
   * ====================================================================== */
  var CONFIG = {
    logoHref: 'index.html',
    breakpoint: 1024,                                 // px: below this the burger + drawer replace the bar
    /* Desktop bar: the key direct links */
    primary: [
      { label: 'Home',        href: 'index.html' },
      { label: 'Catalog',     href: 'catalog.html' },
      { label: 'Science',     href: 'science.html' },
      { label: 'Guarantee',   href: 'guarantee.html' },
      { label: 'Track Order', href: 'track-order.html' }
    ],
    /* Desktop "More" dropdown: everything else */
    moreLabel: 'More',
    more: [
      { label: 'Verified Reviews',  desc: 'What real customers say',    href: 'reviews.html', icon: 'star' },
      { label: 'FAQ & Help',        desc: 'Answers to common questions', href: 'faq.html',     icon: 'help' },
      { label: 'Contact Support',   desc: 'Talk to our team',            href: 'contact.html', icon: 'mail' },
      { label: 'Automated Returns', desc: 'Start a return in minutes',   href: 'returns.html', icon: 'return' },
      { label: 'Admin Studio',      desc: 'Manage products & orders',    href: 'admin.html',   icon: 'settings' }
    ],
    /* Mobile / tablet drawer: ALL pages, grouped */
    drawer: [
      { title: 'Shop', icon: 'bag', links: [
        { label: 'Home',            href: 'index.html' },
        { label: 'Catalog',         href: 'catalog.html' },
        { label: 'Product Details', href: 'product.html' }
      ] },
      { title: 'About & Science', icon: 'flask', links: [
        { label: 'Science & Tech',              href: 'science.html' },
        { label: '100-Day Guarantee',           href: 'guarantee.html' },
        { label: 'Verified Customer Reviews',   href: 'reviews.html' }
      ] },
      { title: 'Customer Care & Help', icon: 'box', links: [
        { label: 'Track Your Order',   href: 'track-order.html' },
        { label: 'FAQ & Help Center',  href: 'faq.html' },
        { label: 'Contact Support',    href: 'contact.html' },
        { label: 'Automated Returns',  href: 'returns.html' }
      ] },
      { title: 'Management', icon: 'settings', links: [
        { label: 'Admin Studio', href: 'admin.html' }
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
    star:     '<path d="M12 2l2.9 6.6L22 9.3l-5 5 1.2 7.1L12 18l-6.2 3.4L7 14.3l-5-5 7.1-.7z"/>',
    help:     '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.7-2.5 2.2-2.5 3.9M12 17.2v.1"/>',
    mail:     '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    'return': '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    bag:      '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>',
    flask:    '<path d="M9 3h6"/><path d="M10 3v6.2L4.6 18.4A2 2 0 006.3 21.5h11.4a2 2 0 001.7-3.1L14 9.2V3"/><path d="M7.5 14h9"/>',
    box:      '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.5L12 12l8.7-4.5M12 22V12"/>',
    chevron:  '<path d="M6 9l6 6 6-6"/>',
    arrow:    '<path d="M9 6l6 6-6 6"/>',
    close:    '<path d="M6 6l12 12M18 6L6 18"/>',
    burger:   '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sun:      '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:     '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    cart:     '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>'
  };
  function ico(name, cls) { return svg(ICON[name], cls); }

  /* ======================================================================
   * 3. CSS  (namespaced .nkn-*  -> cannot clash with page styles)
   * ====================================================================== */
  var BP = CONFIG.breakpoint;
  var CSS = [
  '.nkn-header,.nkn-overlay,.nkn-drawer{',
  '  --nkn-text:var(--text,#1A1615); --nkn-soft:var(--text-soft,rgba(26,22,21,.62)); --nkn-faint:var(--text-faint,rgba(26,22,21,.4));',
  '  --nkn-gold:var(--gold,#C59B56); --nkn-gold-rgb:var(--gold-rgb,197,155,86); --nkn-line:var(--line,rgba(26,22,21,.1));',
  '  --nkn-bar:var(--header-bg,rgba(250,247,242,.78)); --nkn-card:var(--card-bg,rgba(255,255,255,.65));',
  '  --nkn-border:var(--card-border,rgba(230,220,210,.6)); --nkn-panel:var(--surface-raised,rgba(255,255,255,.88));',
  '  --nkn-tint:var(--surface-tint,rgba(26,22,21,.04)); --nkn-rose:var(--rose,#D81E5B);',
  '}',
  ':root[data-theme="dark"] .nkn-header,:root[data-theme="dark"] .nkn-overlay,:root[data-theme="dark"] .nkn-drawer{',
  '  --nkn-text:var(--text,#F7F4F0); --nkn-soft:var(--text-soft,rgba(247,244,240,.64)); --nkn-faint:var(--text-faint,rgba(247,244,240,.38));',
  '  --nkn-gold:var(--gold,#E5BA73); --nkn-gold-rgb:var(--gold-rgb,229,186,115); --nkn-line:var(--line,rgba(255,255,255,.09));',
  '  --nkn-bar:var(--header-bg,rgba(13,11,18,.72)); --nkn-card:var(--card-bg,rgba(25,20,32,.55));',
  '  --nkn-border:var(--card-border,rgba(255,255,255,.08)); --nkn-panel:var(--surface-raised,rgba(30,25,38,.9));',
  '  --nkn-tint:var(--surface-tint,rgba(255,255,255,.05)); --nkn-rose:var(--rose,#FF527B);',
  '}',

  /* ---- header bar (glass) ---- */
  '.nkn-header{position:sticky;top:0;z-index:400;height:73px;box-sizing:border-box;color:var(--nkn-text);',
  '  background:var(--nkn-bar);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);',
  '  border-bottom:1px solid var(--nkn-line);font-family:inherit;}',
  '.nkn-header *,.nkn-drawer *{box-sizing:border-box;}',
  '.nkn-row{display:flex;align-items:center;justify-content:space-between;gap:24px;height:100%;padding:0 clamp(20px,4vw,48px);}',
  '.nkn-logo{font-family:"Playfair Display",Georgia,serif;font-size:24px;letter-spacing:.06em;font-weight:600;color:var(--nkn-text);text-decoration:none;white-space:nowrap;}',
  '.nkn-logo em{font-style:italic;color:var(--nkn-gold);}',

  /* ---- desktop links ---- */
  '.nkn-primary{display:flex;align-items:center;gap:clamp(18px,2.2vw,30px);}',
  '.nkn-link{position:relative;display:inline-flex;align-items:center;gap:6px;padding:6px 0;background:none;border:0;cursor:pointer;',
  '  font:inherit;font-size:13.5px;font-weight:500;letter-spacing:.02em;color:var(--nkn-soft);text-decoration:none;white-space:nowrap;transition:color .2s ease;}',
  '.nkn-link::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:1px;background:var(--nkn-gold);transform:scaleX(0);transform-origin:left;transition:transform .28s ease;}',
  '.nkn-link:hover,.nkn-link:focus-visible,.nkn-link.is-current,.nkn-more.is-open>.nkn-link{color:var(--nkn-text);}',
  '.nkn-link:hover::after,.nkn-link.is-current::after,.nkn-more.is-open>.nkn-link::after{transform:scaleX(1);}',
  '.nkn-link:focus-visible,.nkn-menu-item:focus-visible,.nkn-d-link:focus-visible,.nkn-btn:focus-visible,.nkn-logo:focus-visible{outline:2px solid var(--nkn-gold);outline-offset:3px;border-radius:6px;}',
  '.nkn-chev{width:13px;height:13px;transition:transform .28s cubic-bezier(.2,.8,.2,1);}',
  '.nkn-more{position:relative;}',
  '.nkn-more.is-open .nkn-chev{transform:rotate(180deg);}',

  /* ---- "More" dropdown (glass, animated) ---- */
  '.nkn-menu{position:absolute;top:calc(100% + 16px);left:50%;width:320px;margin-left:-160px;padding:8px;border-radius:20px;z-index:5;',
  '  background:var(--nkn-panel);-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%);',
  '  border:1px solid var(--nkn-border);box-shadow:0 24px 60px -18px rgba(20,12,8,.35),0 2px 0 rgba(255,255,255,.04) inset;',
  '  opacity:0;visibility:hidden;pointer-events:none;transform:translateY(10px) scale(.97);transform-origin:50% 0;',
  '  transition:opacity .22s ease,transform .26s cubic-bezier(.2,.8,.2,1),visibility 0s linear .26s;}',
  '.nkn-menu::before{content:"";position:absolute;left:0;right:0;top:-18px;height:18px;}',            /* hover bridge */
  '.nkn-more.is-open .nkn-menu{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s;}',
  '.nkn-menu-item{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;text-decoration:none;color:var(--nkn-text);transition:background .18s ease,transform .18s ease;}',
  '.nkn-menu-item:hover,.nkn-menu-item:focus-visible{background:rgba(var(--nkn-gold-rgb),.12);transform:translateX(2px);}',
  '.nkn-menu-ico{flex:none;width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:rgba(var(--nkn-gold-rgb),.14);color:var(--nkn-gold);}',
  '.nkn-menu-ico svg{width:18px;height:18px;}',
  '.nkn-menu-text{display:flex;flex-direction:column;min-width:0;line-height:1.25;}',
  '.nkn-menu-text b{font-size:13.5px;font-weight:600;}',
  '.nkn-menu-text small{font-size:11.5px;color:var(--nkn-soft);margin-top:2px;}',
  '.nkn-menu-item.is-current{background:rgba(var(--nkn-gold-rgb),.16);}',
  '.nkn-menu-item.is-current .nkn-menu-ico{background:var(--nkn-gold);color:#241c0f;}',

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
  '.nkn-d-link{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px 12px 14px;border-radius:12px;text-decoration:none;',
  '  font-size:15px;font-weight:500;color:var(--nkn-soft);transition:background .18s ease,color .18s ease,padding-left .18s ease;}',
  '.nkn-d-link svg{width:15px;height:15px;opacity:.45;flex:none;transition:transform .18s ease,opacity .18s ease;}',
  '.nkn-d-link:hover,.nkn-d-link:focus-visible{background:var(--nkn-tint);color:var(--nkn-text);}',
  '.nkn-d-link:hover svg{transform:translateX(3px);opacity:.9;}',
  '.nkn-d-link.is-current{background:rgba(var(--nkn-gold-rgb),.14);color:var(--nkn-text);font-weight:600;}',
  '.nkn-d-link.is-current::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:3px;background:var(--nkn-gold);}',
  '.nkn-d-link.is-current svg{color:var(--nkn-gold);opacity:1;}',
  '.nkn-d-foot{flex:none;display:flex;align-items:center;justify-content:space-between;padding:16px 20px calc(18px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--nkn-line);',
  '  font-size:13px;font-weight:600;color:var(--nkn-soft);}',
  '.nkn-drawer.active .nkn-d-sec{animation:nknIn .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i,0) * 60ms + 120ms);}',
  '@keyframes nknIn{from{opacity:0;transform:translateX(-14px);}to{opacity:1;transform:none;}}',

  /* ---- responsive: below the breakpoint the bar collapses into the burger ---- */
  '@media (max-width:' + (BP - 0.02) + 'px){',
  '  .nkn-primary{display:none;}',
  '  .nkn-burger{display:grid;}',
  '  .nkn-row{gap:14px;}',
  '}',
  '@media (max-width:360px){ .nkn-header .nkn-pill{display:none;} }',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkn-menu,.nkn-drawer,.nkn-overlay,.nkn-chev,.nkn-link::after{transition-duration:.001s !important;transition-delay:0s !important;}',
  '  .nkn-drawer.active .nkn-d-sec{animation:none;}',
  '}'
  ].join('\n');

  /* ======================================================================
   * 4. MARKUP
   * ====================================================================== */
  function themePill(idSuffix) {
    return '<div class="nkn-pill" role="group" aria-label="Theme switcher">' +
      '<button type="button" id="theme-light-btn' + idSuffix + '" data-nkn-theme="light" aria-label="Light theme">' + ico('sun') + '</button>' +
      '<button type="button" id="theme-dark-btn' + idSuffix + '" data-nkn-theme="dark" aria-label="Dark theme">' + ico('moon') + '</button>' +
    '</div>';
  }

  function buildHeader() {
    var primary = CONFIG.primary.map(function (p) {
      var st = state(p.href);
      return '<a class="nkn-link' + activeClass(st) + '" href="' + esc(p.href) + '"' + activeAttrs(st) + '>' + esc(p.label) + '</a>';
    }).join('');

    var moreActive = false;
    var moreItems = CONFIG.more.map(function (m) {
      var st = state(m.href); if (st) moreActive = true;
      return '<a class="nkn-menu-item' + activeClass(st) + '" role="menuitem" href="' + esc(m.href) + '"' + activeAttrs(st) + '>' +
        '<span class="nkn-menu-ico">' + ico(m.icon) + '</span>' +
        '<span class="nkn-menu-text"><b>' + esc(m.label) + '</b><small>' + esc(m.desc) + '</small></span></a>';
    }).join('');

    var more = '<div class="nkn-more" id="nkn-more">' +
      '<button type="button" class="nkn-link nkn-more-btn' + (moreActive ? ' is-current' : '') + '" id="nkn-more-btn" aria-haspopup="true" aria-expanded="false" aria-controls="nkn-more-menu">' +
        esc(CONFIG.moreLabel) + ico('chevron', 'nkn-chev') + '</button>' +
      '<div class="nkn-menu" id="nkn-more-menu" role="menu" aria-label="' + esc(CONFIG.moreLabel) + '">' + moreItems + '</div>' +
    '</div>';

    return '<header class="nkn-header" id="nkn-header">' +
      '<div class="nkn-row">' +
        '<a class="nkn-logo" id="nkn-logo" href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">NIK<em>ora</em></a>' +
        '<nav class="nkn-primary" aria-label="Primary">' + primary + more + '</nav>' +
        '<div class="nkn-actions">' +
          themePill('') +
          '<button type="button" class="nkn-btn" id="open-cart-btn" aria-label="Open cart">' + ico('cart') + '<span class="nkn-badge" id="cart-count">0</span></button>' +
          '<button type="button" class="nkn-btn nkn-burger" id="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu-drawer">' + ico('burger') + '</button>' +
        '</div>' +
      '</div>' +
    '</header>';
  }

  function buildDrawer() {
    var secs = CONFIG.drawer.map(function (sec, i) {
      var links = sec.links.map(function (l) {
        var st = state(l.href);
        return '<a class="nkn-d-link' + activeClass(st) + '" href="' + esc(l.href) + '"' + activeAttrs(st) + '><span>' + esc(l.label) + '</span>' + ico('arrow') + '</a>';
      }).join('');
      return '<section class="nkn-d-sec" style="--i:' + i + '" aria-label="' + esc(sec.title) + '">' +
        '<div class="nkn-d-title">' + ico(sec.icon) + esc(sec.title) + '</div>' + links + '</section>';
    }).join('');

    return '<div class="nkn-overlay" id="mobile-menu-overlay"></div>' +
      '<aside class="nkn-drawer" id="mobile-menu-drawer" role="dialog" aria-modal="true" aria-label="Site navigation" aria-hidden="true">' +
        '<div class="nkn-d-head">' +
          '<a class="nkn-logo" href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">NIK<em>ora</em></a>' +
          '<button type="button" class="nkn-d-close" id="close-mobile-menu" aria-label="Close menu">' + ico('close') + '</button>' +
        '</div>' +
        '<nav class="nkn-d-body" aria-label="Site pages">' + secs + '</nav>' +
        '<div class="nkn-d-foot"><span>Theme</span>' + themePill('-mobile') + '</div>' +
      '</aside>';
  }

  /* ======================================================================
   * 5. MOUNT  (synchronous where the <script> tag sits -> no flash of missing header)
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
  }

  /* ======================================================================
   * 6. BEHAVIOUR
   * ====================================================================== */
  function $(id) { return document.getElementById(id); }
  var more, moreBtn, moreMenu, drawer, overlay, burger, closeBtn;
  var hoverMQ = window.matchMedia ? window.matchMedia('(hover:hover) and (pointer:fine)') : { matches: false };
  var closeTimer = 0, pinned = false, lastFocus = null;

  /* ---- "More" dropdown: hover (mouse), click/tap, keyboard ---- */
  function openMore() { clearTimeout(closeTimer); more.classList.add('is-open'); moreBtn.setAttribute('aria-expanded', 'true'); }
  function closeMore(returnFocus) {
    clearTimeout(closeTimer); pinned = false;
    more.classList.remove('is-open'); moreBtn.setAttribute('aria-expanded', 'false');
    if (returnFocus) moreBtn.focus();
  }
  function menuItems() { return Array.prototype.slice.call(moreMenu.querySelectorAll('.nkn-menu-item')); }

  function wireMore() {
    more.addEventListener('mouseenter', function () { if (hoverMQ.matches) openMore(); });
    more.addEventListener('mouseleave', function () {
      if (!hoverMQ.matches || pinned) return;
      clearTimeout(closeTimer); closeTimer = setTimeout(function () { closeMore(false); }, 180);   /* small grace delay */
    });
    moreBtn.addEventListener('click', function () {
      var open = more.classList.contains('is-open');
      if (open && !pinned && hoverMQ.matches) { pinned = true; return; }      /* opened by hover: a click pins it open */
      if (open) closeMore(false); else { openMore(); pinned = true; }
    });
    moreBtn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); openMore(); pinned = true; var it = menuItems()[0]; if (it) it.focus(); }
    });
    moreMenu.addEventListener('keydown', function (e) {
      var items = menuItems(), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMore(true); }
    });
    more.addEventListener('focusout', function (e) {                         /* tabbing away closes it */
      if (!more.contains(e.relatedTarget)) closeMore(false);
    });
    document.addEventListener('click', function (e) { if (!more.contains(e.target)) closeMore(false); });
  }

  /* ---- mobile drawer ---- */
  function drawerOpen() { return drawer.classList.contains('active'); }
  function openMenu() {
    if (drawerOpen()) return;                       /* idempotent: safe to call twice */
    lastFocus = document.activeElement;
    closeMore(false);
    drawer.classList.add('active'); overlay.classList.add('active');
    drawer.setAttribute('aria-hidden', 'false'); burger.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { if (drawerOpen()) closeBtn.focus(); }, 60);
  }
  function closeMenu() {
    if (!drawerOpen()) return;
    drawer.classList.remove('active'); overlay.classList.remove('active');
    drawer.setAttribute('aria-hidden', 'true'); burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (err) {} }
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
    more = $('nkn-more'); moreBtn = $('nkn-more-btn'); moreMenu = $('nkn-more-menu');
    drawer = $('mobile-menu-drawer'); overlay = $('mobile-menu-overlay'); burger = $('mobile-menu-btn'); closeBtn = $('close-mobile-menu');
    wireMore();

    burger.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    overlay.addEventListener('click', closeMenu);
    drawer.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) closeMenu(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if (drawerOpen()) closeMenu(); else if (more.classList.contains('is-open')) closeMore(true); }
      trapFocus(e);
    });
    var wide = window.matchMedia ? window.matchMedia('(min-width:' + BP + 'px)') : null;
    if (wide) {
      var onWide = function (e) { if (e.matches) closeMenu(); };
      if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
    }

    document.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var th = t.closest('[data-nkn-theme]'); if (th) { applyTheme(th.getAttribute('data-nkn-theme')); return; }
      if (t.closest('#open-cart-btn')) { if (typeof window.openCart === 'function') window.openCart(); return; }
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
   * 7. PUBLIC API
   * ====================================================================== */
  window.NikoraNav = { openMenu: openMenu, closeMenu: closeMenu, openMore: function () { openMore(); pinned = true; }, closeMore: closeMore, config: CONFIG };
  /* legacy global names used by older page code (pages' own definitions may delegate to these) */
  if (typeof window.openMobileMenu !== 'function')  window.openMobileMenu = openMenu;
  if (typeof window.closeMobileMenu !== 'function') window.closeMobileMenu = closeMenu;

  if (document.body || document.currentScript) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }
})();