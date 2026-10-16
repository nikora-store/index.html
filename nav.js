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
 * SITE CONTENT: the announcement bar (above the header) and the promo banner (under it) are
 * managed from the admin site and read from Firebase /site_content (announcement_enabled,
 * announcement_text, promo_banner_enabled, promo_banner_image_url, promo_banner_link).
 * Nothing is shown until the admin turns them on. Needs public read on /site_content.
 *
 * SITE CONTENT STORE: nav.js keeps one live copy of /site_content for the page (server-sent stream, no SDK needed)
 * and exposes it as  window.NikoraSite  { get(), onChange(fn), refresh(), util }. Pages subscribe with
 * NikoraSite.onChange(function (content) { ... }) and fall back to their built-in text when a field is empty.
 * The shared footer (copyright, support email / phone, hours, social links) is rendered from it here.
 *
 * Public API:
 *   window.NikoraNav = { openMenu, closeMenu, config, refreshSiteContent }
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
    shipNote: 'Free Express Shipping on every order',

    /* Health & cosmetic-device disclaimer shown in the footer on every page (payment gateways and regulators expect it) */
    disclaimer: 'NIKORA devices are cosmetic tools intended for personal home skincare and are not medical devices. They are not intended to diagnose, treat, cure, or prevent any medical condition or disease.',

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
        { label: 'Customer Reviews', href: 'reviews.html' },
        { label: 'About NIKORA',     href: 'about.html' }
      ] },
      { title: 'Customer Care', icon: 'box', links: [
        { label: 'Track Order',      href: 'track-order.html' },
        { label: 'Returns & Refunds', href: 'returns.html' },
        { label: '30-Day Guarantee', href: 'guarantee.html' },
        { label: 'FAQ Center',       href: 'faq.html' },
        { label: 'Contact Support',  href: 'contact.html' }
      ] },
      { title: 'Legal & Concierge', icon: 'shield', links: [
        { label: 'Privacy Policy',          href: 'privacy.html' },
        { label: 'Terms of Service',        href: 'terms.html' },
        { label: 'Shipping Policy',         href: 'shipping.html' },
        { label: 'Refund & Return Policy',  href: 'returns.html#return-policy' },
        { label: 'AI Beauty Concierge',     action: 'ai', icon: 'sparkle' },
        { label: 'Support Email',           href: 'mailto:nikora.support@gmail.com' }
      ] }
    ],

    /* Legal / support row shown in the footer's bottom bar */
    legal: [
      { label: 'Privacy Policy',         href: 'privacy.html' },
      { label: 'Terms of Service',       href: 'terms.html' },
      { label: 'Shipping Policy',        href: 'shipping.html' },
      { label: 'Refund & Return Policy', href: 'returns.html#return-policy' },
      { label: '30-Day Guarantee',       href: 'guarantee.html' },
      { label: 'Contact Support',        href: 'contact.html' }
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
  '  --nkn-logo-primary:var(--logo-primary,#0B0B0E); --nkn-logo-accent:var(--logo-accent,#C89B54);',
  '  --nkn-gold:var(--gold,#C59B56); --nkn-gold-rgb:var(--gold-rgb,197,155,86); --nkn-line:var(--line,rgba(26,22,21,.1));',
  '  --nkn-bar:var(--header-bg,rgba(250,247,242,.78)); --nkn-card:var(--card-bg,rgba(255,255,255,.65));',
  '  --nkn-border:var(--card-border,rgba(230,220,210,.6)); --nkn-panel:var(--surface-raised,rgba(255,255,255,.88));',
  '  --nkn-tint:var(--surface-tint,rgba(26,22,21,.04)); --nkn-rose:var(--rose,#D81E5B);',
  '}',
  ':root[data-theme="dark"] .nkn-header,:root[data-theme="dark"] .nkn-overlay,:root[data-theme="dark"] .nkn-drawer,:root[data-theme="dark"] .nkn-footer{',
  '  --nkn-text:var(--text,#F7F4F0); --nkn-soft:var(--text-soft,rgba(247,244,240,.64)); --nkn-faint:var(--text-faint,rgba(247,244,240,.4));',
  '  --nkn-logo-primary:var(--logo-primary,#FFFFFF); --nkn-logo-accent:var(--logo-accent,#C89B54);',
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
  /* NIKORA logo: one inline SVG, recoloured by CSS variables, so it follows the theme toggle with no swap, jump or flash */
  '.nkn-logo{--nkn-logo-h:52px;display:inline-flex;align-items:center;flex:none;line-height:0;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
  '.nkn-logo-svg{display:block;height:var(--nkn-logo-h);width:calc(var(--nkn-logo-h) * 1.4473);aspect-ratio:703.75 / 486.25;overflow:visible;shape-rendering:geometricPrecision;',
  '  fill:var(--nkn-logo-primary);color:var(--nkn-logo-accent);transition:fill .35s ease,color .35s ease;}',
  '.nkn-d-head .nkn-logo{--nkn-logo-h:50px;}',
  '.nkn-footer .nkn-logo{--nkn-logo-h:78px;}',

  /* ---- health / cosmetic-device disclaimer ---- */
  '.nkn-f-disclaimer{margin:30px 0 26px;max-width:940px;font-size:12px;line-height:1.75;color:var(--nkn-faint);}',
  '.nkn-f-disclaimer strong{color:var(--nkn-soft);font-weight:600;}',

  /* ---- footer contact lines + social icons (content comes from Firebase /site_content) ---- */
  '.nkn-f-brand .nkn-f-contact{margin-top:14px;font-size:13px;line-height:1.7;color:var(--nkn-soft);}',
  '.nkn-f-contact a{color:inherit;text-decoration:none;border-bottom:1px solid transparent;transition:color .2s,border-color .2s;}',
  '.nkn-f-contact a:hover,.nkn-f-contact a:focus-visible{color:var(--nkn-gold);border-bottom-color:currentColor;}',
  '.nkn-f-social{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;}',
  '.nkn-f-social a{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--nkn-line);border-radius:50%;color:var(--nkn-soft);transition:color .2s,border-color .2s,transform .2s;}',
  '.nkn-f-social a:hover,.nkn-f-social a:focus-visible{color:var(--nkn-gold);border-color:var(--nkn-gold);transform:translateY(-2px);}',
  '.nkn-f-social svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}',

  /* ---- announcement bar + promo banner (content comes from Firebase /site_content) ---- */
  '.nkn-announce{position:relative;z-index:401;background:#0B0B0E;color:#F3EEE6;border-bottom:1px solid rgba(200,155,84,.45);font-family:inherit;}',
  '.nkn-announce[hidden],.nkn-promo[hidden]{display:none;}',
  '.nkn-announce-text{margin:0;padding:9px clamp(16px,4vw,48px);text-align:center;font-size:12.5px;font-weight:500;letter-spacing:.04em;line-height:1.45;}',
  '.nkn-promo{position:relative;z-index:1;background:#0B0B0E;font-family:inherit;}',
  '.nkn-promo a,.nkn-promo img{display:block;width:100%;}',
  '.nkn-promo img{height:auto;max-height:clamp(72px,16vw,190px);object-fit:cover;}',
  '.nkn-promo-x{position:absolute;top:8px;right:10px;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(11,11,14,.6);color:#fff;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}',
  '.nkn-promo-x svg{width:14px;height:14px;}',
  '.nkn-promo-x:focus-visible{outline:2px solid #C89B54;outline-offset:2px;}',

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
  '.nkn-f-legal{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;}',
  '.nkn-f-legal a{color:var(--nkn-soft);text-decoration:none;white-space:nowrap;border-bottom:1px solid transparent;transition:color .2s ease,border-color .2s ease;}',
  '.nkn-f-legal a:hover,.nkn-f-legal a:focus-visible,.nkn-f-legal a.is-current{color:var(--nkn-gold);border-bottom-color:currentColor;}',
  '.nkn-f-legal a:focus-visible{outline:2px solid var(--nkn-gold);outline-offset:3px;border-radius:4px;}',
  '@media (max-width:900px){.nkn-f-grid{grid-template-columns:1fr 1fr;gap:32px;}.nkn-f-brand{grid-column:1 / -1;}}',
  '@media (max-width:480px){.nkn-f-grid{grid-template-columns:1fr;gap:26px;}.nkn-footer{padding-top:44px;}}',

  /* ---- responsive: below the breakpoint the bar collapses into the burger ---- */
  '@media (max-width:' + (BP - 0.02) + 'px){',
  '  .nkn-primary{display:none;}',
  '  .nkn-burger{display:grid;}',
  '  .nkn-row{gap:14px;}',
  '}',
  '@media (max-width:600px){ .nkn-header .nkn-logo{--nkn-logo-h:44px;} .nkn-footer .nkn-logo{--nkn-logo-h:68px;} }',
  '@media (max-width:360px){ .nkn-header .nkn-pill{display:none;} .nkn-header .nkn-logo{--nkn-logo-h:40px;} }',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkn-drawer,.nkn-overlay,.nkn-link::after,.nkn-f-link,.nkn-logo-svg{transition-duration:.001s !important;transition-delay:0s !important;}',
  '  .nkn-drawer.active .nkn-d-sec{animation:none;}',
  '}'
  ].join('\n');

  /* ======================================================================
   * 4. MARKUP
   * ====================================================================== */
  /* The logo is drawn once as an SVG <symbol> (traced from the official artwork) and reused for the header, drawer and footer.
     Primary shapes + "NIK" inherit `fill` (obsidian in light mode, white in dark); the gold shapes + "ora" use currentColor. */
  var LOGO_SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">' +
    '<symbol id="nkn-logo-sym" viewBox="0 0 703.75 486.25">' +
    '<path fill="currentColor" fill-rule="evenodd" d="M399 355.45C398.5 352.27 402.37 347.5 403.38 344.5C404.02 342.57 405.47 340.92 406.12 339C408.2 332.9 411.88 327.56 413.88 321.5C414.14 320.71 414.86 320.04 415.12 319.25C417.52 312.07 421.98 305.67 424.38 298.5C424.7 297.54 425.55 296.72 425.88 295.75C426.82 292.98 428.45 290.52 429.38 287.75C429.76 286.61 430.74 285.64 431.13 284.5C434.22 275.54 439.69 267.49 442.63 258.5C442.8 257.97 443.44 257.53 443.63 257C444.38 254.97 445.46 253.05 446.13 251C446.62 249.51 447.87 248.23 448.38 246.75C449.54 243.33 451.53 240.2 452.63 236.75C452.94 235.8 453.8 234.95 454.13 234C455.42 230.28 457.65 226.98 458.88 223.25C459.14 222.46 459.85 221.79 460.13 221C461.6 216.87 464.03 213.14 465.38 209C465.87 207.51 467.13 206.24 467.63 204.75L469.13 200.75C469.2 200.55 469.56 200.45 469.63 200.25C470.6 197.36 471.91 194.63 472.88 191.75C473.53 189.84 474.99 188.16 475.62 186.25L476.88 182C477.39 180.44 476.85 178.57 477.38 177C478.76 172.86 478.01 166.11 479.38 162C479.81 160.68 479.19 159.07 479.62 157.75C480.06 156.44 479.68 154.84 480.12 153.5C481.06 150.7 481.25 144.1 481.65 140.75C481.88 138.85 482.93 136.93 483.32 135C484.21 130.62 485.19 126.25 485.56 121.75C486.07 115.53 485.71 109.24 486.12 103C486.55 96.52 487.94 89.98 489.63 83.75C494.95 64.11 508.34 42.24 525 29.79C527.63 27.82 530.06 25.53 532.97 24C533.99 23.46 534.71 22.43 535.75 21.9C540.11 19.69 544.28 16.87 548.97 15.25C552.97 13.87 556.6 11.84 560.75 10.81C565.87 9.53 570.98 7.7 576.25 7.11C586.91 5.9 597.61 5.99 608.25 7.37C620.08 8.91 632.01 13.46 642.5 19.12C645.89 20.94 648.98 23.27 652.27 25.25C661.36 30.71 671.22 41.17 677.4 49.75C688.36 64.98 695.72 83.41 697.13 102.25C697.9 112.64 697.03 123.09 697.25 133.5C697.98 169.54 697.64 205.68 697.53 241.75L697.53 311C697.55 316.07 698.07 321.47 697.34 326.5C695.67 338.09 688.05 349.22 676.75 353.35C666.81 356.99 655.42 355.62 645 355.59C626.57 355.55 608.17 355.77 589.75 355.82C530.59 355.96 471.41 356.02 412.25 355.81C407.85 355.8 403.34 355.45 399 355.45ZM393 339.59L389.5 339.57C389.03 339.15 384.81 328.58 384.38 327.25C383.68 325.11 382.33 323.13 381.63 321C378.83 312.56 374.69 304.69 371.88 296.25C370.4 291.83 368.09 287.71 366.63 283.25C366.15 281.78 365.11 280.46 364.63 279C362.63 272.94 359.73 267.27 357.63 261.25C357.18 259.97 356.3 258.78 355.88 257.5C354.83 254.36 353.43 251.38 352.38 248.25C352.03 247.22 351.22 246.28 350.88 245.25C349.38 240.76 347.37 236.49 345.88 232C345.42 230.61 344.34 229.38 343.88 228L341.88 222.5C341.34 220.95 340.16 219.57 339.63 218C336.74 209.36 332.51 201.15 329.62 192.5C328.91 190.37 327.58 188.38 326.88 186.25C323.93 177.41 319.57 169.09 316.62 160.25C315.25 156.14 311.51 150.82 312.25 146.17L312.99 146.25C313.48 146.42 316.33 153.66 316.89 154.75C320.89 162.46 326.38 169.48 332.5 175.67C349.24 192.62 373.03 202.25 396.75 202.08C419.19 201.92 444.49 192.09 459.75 175.23C465.71 168.64 471.33 162.12 475.55 154.25C476.78 151.95 477.57 148.39 479.36 146.5C479.54 146.31 480.02 146.41 480.25 146.4C480.55 148.01 480.31 149.59 479.87 151C479.75 151.38 479.24 151.63 479.11 152C478.83 152.81 479.08 153.3 478.11 153.5C478.11 156.84 473.75 163.13 472.62 166.5C470.18 173.85 465.57 180.4 463.12 187.75C462.5 189.64 461.26 191.34 460.62 193.25C460.05 194.98 458.7 196.52 458.12 198.25C455.38 206.48 450.12 214.03 447.37 222.25C446.68 224.31 445.31 226.16 444.61 228.25C444.26 229.32 442.56 231.19 442.12 232.5C441.77 233.57 440.97 234.46 440.62 235.5C439.08 240.06 436.37 244.17 434.87 248.75C434.55 249.72 433.7 250.53 433.37 251.5C432.03 255.45 429.68 259.02 428.37 263C428.05 263.96 427.2 264.78 426.87 265.75C425.05 271.19 421.66 276.05 419.87 281.5C419.67 282.11 419.08 282.64 418.87 283.25C417.58 286.94 415.32 290.29 414.11 294C413.69 295.32 412.56 296.44 412.12 297.75C409.25 306.3 403.9 313.92 401.12 322.5C400.5 324.41 399.02 326.09 398.37 328C397.93 329.3 393.57 339.06 393 339.59ZM412.25 479.26C395 481.24 387.5 468.57 389.69 452.75C392.28 433.95 402.86 410.66 424 407.78C440.41 405.55 448.18 417.97 446.57 433C444.59 451.57 433.37 476.83 412.25 479.26ZM468.25 416.19C461.64 414.72 459.76 431.23 457.48 433C456.57 433.7 454.86 433.65 453.75 433.49C449.92 432.94 453.79 426.22 454.37 424C456.29 416.7 460.72 409.8 468.5 408.08C473.16 407.05 478.69 407.44 480.55 412.5C481.76 415.76 480.46 418.83 480.75 422C484.17 416.15 488.34 410.5 495 408.21C502.54 405.62 510.4 410.24 508.8 418.75C507.74 424.44 501.71 428.78 496 427.2C494.87 426.89 493.48 426.23 492.75 425.25C490.86 422.72 491.83 420.49 491.75 417.72C482.6 426.33 473.27 452.99 469.9 465.25C468.97 468.63 468.29 473.72 466.87 476.75C466.71 477.09 466.36 477.46 466 477.59C464.87 477.99 454.58 478.02 453.5 477.61C453.13 477.47 452.59 476.88 452.48 476.5C452.01 474.84 455.39 464.8 456.07 462.5C459.16 451.96 461.95 441.32 464.92 430.75C465.87 427.36 468.94 419.31 468.25 416.19ZM533.5 466.17C526.63 476.59 512.26 486.63 502.75 473.09C501.62 471.48 501.06 469.17 500.69 467.25C497.66 451.71 509.13 428.22 520 417.35C525.21 412.14 534.13 405.56 542 407.9C544.37 408.61 545.51 410.58 547.25 411.83C547.4 411.18 547.55 409.99 548.25 409.66C549.72 408.96 551.89 409.26 553.5 409.07C555.89 408.79 558.16 407.96 560.5 407.63C561.62 407.48 562.88 408.22 562.8 409.5C562.61 412.57 559.67 420.83 558.67 424.25C555.8 434.13 553.41 444.19 550.29 454C549.11 457.74 545.71 467.23 546.31 470.75C552.13 472.74 554.95 457.52 556.75 454.27C557.48 452.94 561.7 453.05 562.32 454.5C563.02 456.13 560.79 460.74 560.19 462.5C558.72 466.81 557.06 471.9 553.5 475.03C548.03 479.83 537.48 482.28 533.88 474C532.72 471.34 533.58 468.82 533.5 466.17ZM411.1 473C415.56 471.93 419.28 467.34 421.41 463.5C427.24 453 430.37 441.98 431.82 430C432.45 424.74 433.83 412 425 414.12C420.29 415.25 416.46 420.14 414.33 424.25C409.19 434.18 405.08 445.12 404.38 456.5C404.06 461.62 401.9 475.22 411.1 473ZM518.9 471.5C522.55 470.29 525.92 465.87 527.92 462.75C532.63 455.38 537.17 447.9 539.83 439.5L542.52 430.5C543.74 426.68 545.74 415.19 540 413.9C535.14 412.8 530.94 418.55 528.59 422C521.22 432.81 517.48 444.89 515.47 457.75C515.06 460.4 513.79 473.19 518.9 471.5Z"/>' +
    '<path fill-rule="evenodd" d="M400.25 355.45C301.5 355.3 202.75 355.45 104 355.45C80.25 355.45 56.5 355.33 32.75 355.45C28.08 355.48 15.04 356.03 11.25 354.57C9.68 353.97 8.5 352.87 7.57 351.5C5.48 348.44 6.81 345.12 7.75 341.99C9.85 334.99 12.68 328.17 15.02 321.25C18.08 312.23 21.39 303.28 24.41 294.25C26.25 288.73 28.53 283.33 30.21 277.75C32.31 270.74 35.55 264.06 37.47 257C39.64 249.01 43.51 241.45 45.8 233.5C47.91 226.16 51.63 218.79 53.52 211.5C54.29 208.5 55.66 205.7 56.58 202.75C57.08 201.16 57.48 199.22 58.26 197.75C59.57 195.26 62.1 187.6 62.82 184.75C64.18 179.3 67.2 174.21 68.51 168.75C69.87 163.1 72.76 157.84 74.3 152.25C75.29 148.63 76.67 144.98 78.06 141.5C80.5 135.36 82.24 128.9 84.64 122.75C90.91 106.63 95.48 89.89 101.75 73.75C103.74 68.62 106.73 64.01 108.94 59C109.4 57.95 110.27 57.01 110.82 56C114.63 48.94 120.41 43.08 125.75 37.19C128.87 33.76 132.66 30.88 136.28 28C157.22 11.34 189.24 2.61 215.75 7.38C225.24 9.09 234.77 11.29 243.5 15.46C247.23 17.24 250.81 19.32 254.5 21.15C258.06 22.92 261.28 25.68 264.5 28C280.9 39.86 296.12 61.18 301.25 80.67C302.28 84.58 303.73 88.46 304.27 92.5C304.8 96.49 305.6 100.46 305.81 104.5C306.09 109.99 305.65 115.54 306.26 121C306.82 125.93 307.88 130.69 308.96 135.5C309.88 139.61 312.29 143.3 313.52 147.25C315.75 154.46 319.29 160.99 321.62 168C322.05 169.28 322.95 170.47 323.38 171.75C324.85 176.16 326.9 180.34 328.38 184.75C328.8 186.03 329.7 187.22 330.12 188.5C331.53 192.73 333.37 196.78 334.86 201C335.17 201.85 335.84 202.64 336.12 203.5C337.57 207.92 339.61 212.11 341.12 216.5C341.65 218.05 342.91 219.44 343.37 221C344.15 223.67 345.49 226.12 346.37 228.75C346.57 229.37 347.17 229.88 347.36 230.5C348.69 234.59 350.39 238.46 351.87 242.5C353.54 247.07 355.79 251.37 357.37 256C357.66 256.85 358.34 257.64 358.62 258.5C359.7 261.82 361.26 264.93 362.37 268.25C362.86 269.71 363.89 271.03 364.37 272.5C368.31 284.44 374.37 295.81 378.37 307.75C378.64 308.54 379.37 309.21 379.61 310C380.5 312.83 381.96 315.46 382.87 318.25C384.01 321.75 385.56 325.06 386.86 328.5C387.41 329.93 388.4 331.29 388.86 332.75C389.39 334.42 389.81 336.85 391 338.21C391.32 338.11 391.73 338.2 391.88 337.75C392.83 334.99 394.56 332.54 395.4 329.75C395.97 327.85 397.45 326.13 398.15 324.25C399.45 320.7 401.55 317.37 402.63 313.75C403.35 311.34 405.8 308.13 406.64 305.25C407.1 303.67 408.32 302.28 408.89 300.75C410.88 295.36 414.53 289.72 416.14 284.5C416.39 283.72 417.1 283.03 417.39 282.25C418.86 278.32 421.47 274.03 422.64 270.25C423.29 268.19 424.76 266.36 425.39 264.25C425.68 263.28 426.54 262.46 426.89 261.5C427.7 259.21 428.94 257.06 429.63 254.75C429.92 253.78 430.8 252.95 431.15 252C432.21 249.11 433.94 246.45 434.88 243.5C435.14 242.7 435.85 242.04 436.14 241.25C437.35 237.93 439.28 234.85 440.38 231.5C440.83 230.11 442.74 227.89 443.13 226.75C444.54 222.62 447.04 218.9 448.38 214.75C448.86 213.28 449.9 212.01 450.39 210.5C450.94 208.76 452.28 207.22 452.88 205.5C453.52 203.67 454.77 202.06 455.38 200.25C457.36 194.29 460.89 188.94 462.88 183C463.5 181.11 464.74 179.41 465.38 177.5C466.33 174.64 468.42 172.12 469.38 169.25C470.5 165.89 472.5 162.87 473.62 159.5C473.89 158.71 474.61 158.04 474.88 157.25C475.2 156.28 475.8 155.45 476.12 154.5C476.37 153.79 476.32 152.76 476.57 152.25L477 151.35C477.2 151.35 477.17 151.7 477.25 151.88C477.52 150.56 478.45 149.5 478.88 148.25C478.98 147.97 478.71 147.93 478.71 147.75C478.71 147.47 480.7 143.15 480.96 142.5C482.6 138.49 483.86 133.9 484.5 129.61C484.68 131.51 483.72 140.22 483.12 142C482.92 142.6 483.33 143.4 483.12 144C481.98 147.43 482.77 151.57 481.62 155C481.04 156.76 481.71 159.49 481.12 161.25C480.56 162.95 480.8 166.47 480.38 167.75C479.81 169.45 480.05 172.97 479.62 174.25C479.06 175.95 479.29 179.27 478.88 180.5C478.09 182.86 477.9 185.41 477.12 187.75C476.48 189.66 475.04 191.35 474.37 193.25C473.35 196.12 471.97 198.84 471.11 201.75C471.05 201.95 470.68 202.06 470.61 202.25C469.66 204.88 468.2 207.34 467.36 210C467.3 210.2 466.93 210.3 466.86 210.5C466.32 212 465.43 213.28 464.86 214.75C463.19 219.04 460.73 223.1 459.37 227.5C459.07 228.46 458.19 229.29 457.86 230.25C456.99 232.84 455.42 235.13 454.61 237.75C454.29 238.81 453.22 239.94 452.87 241C452.15 243.13 451.04 245.1 450.37 247.25C449.79 249.1 448.27 250.68 447.61 252.5C445.76 257.59 442.65 262.27 441.11 267.5C441 267.89 440.49 268.13 440.36 268.5C439.82 270 438.92 271.28 438.35 272.75C436.61 277.19 433.95 281.41 432.61 286C431.82 288.71 429.34 291.77 428.36 294.5C426.87 298.68 424.46 302.51 423.12 306.75C422.48 308.76 420.98 310.45 420.36 312.5C419.79 314.41 418.38 316.05 417.86 318C417.65 318.79 416.88 319.47 416.61 320.25C415.83 322.56 414.59 324.67 413.86 327C413.75 327.38 413.25 327.63 413.12 328C412.48 329.81 411.42 331.42 410.86 333.25C410.7 333.77 410.05 334.23 409.86 334.75C409.15 336.7 408.23 338.5 407.62 340.5C407.26 341.71 406.28 342.78 405.88 344C405.38 345.49 404.12 346.76 403.62 348.25C403.1 349.83 401.24 354.23 400.25 355.45ZM202.25 480.35C200.16 480.42 193.12 480.85 191.5 480.37C190.88 480.19 187.83 476.01 187.3 475.25C184.12 470.72 180.22 466.62 176.83 462.25C169.2 452.44 161.09 443.02 153.42 433.25C148.13 426.52 142.88 419.6 137.25 413.14C136.46 417.01 137.13 425.15 137.13 429.5C137.13 440.28 136.07 455.26 138.13 465.5C138.47 467.15 139.32 468.58 140.18 470C142.1 473.21 148.92 474.26 152.25 475.04L152.46 479.75L115.04 479.75L115.04 475.25C119.12 473.54 124.7 474.71 127.59 470C131.06 464.35 129.88 451.9 129.88 445.25L129.88 418.75C129.88 413.6 130.34 407.96 126.83 403.75C123.62 399.88 119.18 399.21 114.75 397.66L114.75 392.78C122.67 392.23 130.81 392.75 138.75 392.75C140.2 392.75 146.6 392.26 147.5 392.84C148.8 393.69 159.33 407.43 161.16 409.75C167.94 418.33 175.19 426.56 181.83 435.25C186.02 440.74 190.34 446.46 195 451.55C195.67 448.04 195.11 443.86 195.11 440.25C195.11 432.17 195.28 424.07 195.07 416C194.96 411.58 194.84 405.83 191.75 402.34C188.84 399.04 183.8 398.64 179.85 397.5L180 392.75L217 392.75L217.14 397.5C212.91 398.44 210.72 398.2 206.75 400.45C201.1 403.64 202.35 420.8 202.35 426.5L202.35 462.5C202.35 467.38 203 475.95 202.25 480.35ZM270.5 479.87L222.31 479.75L222.31 475.25C226.17 473.98 231.9 475.84 234.61 471.75C236.42 469 235.58 459.11 235.58 455.5L235.58 417.5C235.58 413.76 236.42 405.01 234.61 402C232.43 398.37 225.97 398.26 222.35 397.5L222.5 392.75L270.5 392.76L270.59 397.5C267.53 398.19 260.19 397.82 258.45 401C256.31 404.94 257.36 412.46 257.36 417L257.36 453.75C257.36 457.86 256.45 467.38 258.14 470.75C260.07 474.59 266.83 474.76 270.5 475.09L270.5 479.87ZM381 479.84L346.5 479.78C337.53 465.74 327.08 452.62 316.5 439.73L313.37 439.75C312.75 447.14 313.31 454.82 313.31 462.25C313.31 465.11 312.64 469 314.5 471.42C316.74 474.33 321.46 474.51 324.75 475.07L324.88 479.75L278.61 479.75L278.75 475.07C282.33 474.72 288.33 475.39 290.5 471.75C292.38 468.6 291.48 459.2 291.48 455.25L291.48 417.5C291.48 413.75 292.32 405 290.57 402C288.42 398.31 282.19 398.32 278.64 397.5L278.75 392.75L326.25 392.75L326.37 397.5C322.82 398.27 317.98 397.7 315.04 400.25C312.56 402.41 313.31 406.86 313.31 409.75L313.31 434.5C313.96 434.66 315.3 434.93 316 434.58C317.41 433.89 323.08 427.98 324.62 426.5C330.79 420.56 336.58 414.49 342.14 408C343.58 406.33 347.21 401.81 346.34 399.5C345.71 397.82 339.12 397.76 337.54 397.5L337.5 392.93L375.25 392.76L375.34 397.5C370.55 398.6 365.77 398.94 361.25 401.13C354.35 404.46 346.96 412.87 341.5 418.37C338.84 421.04 334.85 424.19 332.84 427.25C339.49 436.67 347.85 444.87 354.56 454.25C358.89 460.31 367.25 470.61 374 473.55C376.22 474.52 378.63 474.72 381 475.12L381 479.84Z"/>' +
    '</symbol></svg>';
  function logoHtml(extra) {
    return '<a class="nkn-logo"' + (extra || '') + ' href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">' +
      '<svg class="nkn-logo-svg" viewBox="0 0 703.75 486.25" width="703.75" height="486.25" aria-hidden="true" focusable="false"><use href="#nkn-logo-sym" width="100%" height="100%"></use></svg></a>';
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

  function legalHtml() {
    return '<nav class="nkn-f-legal" aria-label="Legal and support">' + CONFIG.legal.map(function (l) {
      var st = state(l.href);
      return '<a' + (st ? ' class="is-current"' : '') + ' href="' + esc(fixMail(l.href)) + '"' + activeAttrs(st) + '>' + esc(l.label) + '</a>';
    }).join('') + '</nav>';
  }

  function buildFooterHtml() {
    var cols = CONFIG.columns.map(function (sec, i) {
      var hid = 'nkn-f-h' + i;
      var links = sec.links.map(function (l) {
        if (l.action === 'ai') {
          return '<button type="button" class="nkn-f-link" data-nkn-ai>' + ico(l.icon || 'sparkle') + esc(l.label) + '</button>';
        }
        var st = state(l.href);
        return '<a class="nkn-f-link' + activeClass(st) + '" href="' + esc(fixMail(l.href)) + '"' + activeAttrs(st) + '>' + esc(l.label) + '</a>';
      }).join('');
      return '<nav class="nkn-f-col" aria-labelledby="' + hid + '"><h5 id="' + hid + '">' + esc(sec.title) + '</h5>' + links + '</nav>';
    }).join('');

    return '<div class="nkn-f-wrap">' +
      '<div class="nkn-f-grid">' +
        '<div class="nkn-f-brand">' + logoHtml() + '<p>' + esc(CONFIG.tagline) + '</p><p class="nkn-f-hours">' + esc(hoursText()) + '</p><p class="nkn-f-hours">' + esc(CONFIG.shipNote) + '</p>' + footerContactHtml() + footerSocialHtml() + '</div>' +
        cols +
      '</div>' +
      '<p class="nkn-f-disclaimer"><strong>Disclaimer:</strong> ' + esc(CONFIG.disclaimer) + '</p>' +
      '<div class="nkn-f-bottom"><span>' + copyrightHtml() + '</span>' + legalHtml() + '</div>' +
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
  /* ----------------------------------------------------------------------
   * 5a. SITE CONTENT  -  announcement bar + promo banner from Firebase /site_content
   *     Painted instantly from the last cached copy, then refreshed from the database
   *     (live listener when the page has the Firebase SDK, plain REST read otherwise).
   * -------------------------------------------------------------------- */
  var SITE = { dbUrl: 'https://nikora-store-default-rtdb.firebaseio.com', cacheKey: 'nikora_site_content_v2', dismissKey: 'nkn_promo_dismissed', refreshMs: 60000 };
  var DEFAULT_EMAIL = 'nikora.support@gmail.com';
  var SITE_DATA = {}, siteSubs = [], siteLastKey = null, pollTimer = null, siteLast = 0;

  function safeLink(v) {                              // https URL, mailto:/tel:, #anchor, /path or page.html. Anything else (javascript:, //host, http:) is dropped
    if (typeof v !== 'string') return '';
    v = v.trim();
    if (!v || v.indexOf('//') === 0) return '';
    return /^(https:\/\/\S+|mailto:[^\s<>"']+|tel:[+\d][\d\s().-]*|#[\w-]*|\/[^\s]*|[\w\-\/]+\.html(\?[^\s#]*)?(#\S*)?)$/i.test(v) ? v : '';
  }
  function safeImg(v) { return (typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim())) ? v.trim() : ''; }
  function siteStr(k, max) { var v = SITE_DATA && SITE_DATA[k]; return (typeof v === 'string' && v.trim()) ? v.trim().slice(0, max || 300) : ''; }
  function validEmail(e) { return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(e || ''); }
  function siteEmail(first) {                         // 'footer' or 'contact' decides which saved address wins; the other is the fallback
    var a = siteStr('footer_support_email', 120), b = siteStr('contact_email', 120), e = first === 'contact' ? (b || a) : (a || b);
    return validEmail(e) ? e : DEFAULT_EMAIL;
  }
  function siteEmailCustom() { return siteEmail('footer') !== DEFAULT_EMAIL; }
  function sitePhone(first) {
    var a = siteStr('footer_support_phone', 40), b = siteStr('contact_phone', 40), v = first === 'contact' ? (b || a) : (a || b);
    return /^[+\d][\d\s().-]{4,}$/.test(v) ? v : '';
  }
  function toList(v) {                                // Firebase gives arrays back as arrays or as {0:..,1:..} objects
    if (Array.isArray(v)) return v.filter(function (x) { return x && typeof x === 'object'; });
    if (v && typeof v === 'object') return Object.keys(v).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return v[k]; }).filter(function (x) { return x && typeof x === 'object'; });
    return [];
  }
  function inlineHtml(t) {                            // plain text with [label](link) -> escaped HTML
    t = String(t); var out = '', last = 0, re = /\[([^\]]{1,120})\]\(([^)\s]{1,300})\)/g, m;
    while ((m = re.exec(t))) {
      out += esc(t.slice(last, m.index));
      var u = safeLink(m[2]);
      out += u ? '<a href="' + esc(u) + '"' + (/^https:/i.test(u) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(m[1]) + '</a>' : esc(m[1]);
      last = re.lastIndex;
    }
    return out + esc(t.slice(last));
  }
  function answerHtml(text) {                         // blank line = new paragraph, lines starting "- " = tick list
    var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    return String(text || '').split(/\n\s*\n/).map(function (b) {
      var lines = b.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return '';
      if (lines.every(function (l) { return /^[-\u2022]\s+/.test(l); })) return '<ul>' + lines.map(function (l) { return '<li>' + TICK + inlineHtml(l.replace(/^[-\u2022]\s+/, '')) + '</li>'; }).join('') + '</ul>';
      return '<p>' + lines.map(inlineHtml).join('<br>') + '</p>';
    }).join('');
  }
  function richText(el, text, tag, cls) {             // "Smart care. *Instant* glow." -> accent word + line breaks, built with DOM nodes (no HTML injection)
    el.textContent = '';
    String(text).split(/\r?\n/).forEach(function (line, li) {
      if (li) el.appendChild(document.createElement('br'));
      line.split(/(\*[^*]+\*)/).forEach(function (seg) {
        if (!seg) return;
        if (seg.length > 2 && seg.charAt(0) === '*' && seg.charAt(seg.length - 1) === '*') {
          var n = document.createElement(tag || 'em'); if (cls) n.className = cls; n.textContent = seg.slice(1, -1); el.appendChild(n);
        } else el.appendChild(document.createTextNode(seg));
      });
    });
  }
  function siteCacheGet() { try { return JSON.parse(localStorage.getItem(SITE.cacheKey) || 'null'); } catch (e) { return null; } }
  function siteCacheSet(v) { try { localStorage.setItem(SITE.cacheKey, JSON.stringify(v)); } catch (e) {} }
  function promoDismissed(img) { try { return sessionStorage.getItem(SITE.dismissKey) === img; } catch (e) { return false; } }
  SITE_DATA = (function () { var c = siteCacheGet(); return (c && typeof c === 'object') ? c : {}; })();

  function sitePick(c) {                              // raw /site_content -> what the bar and banner show ({ ann, img, link })
    c = c || {};
    var text = (typeof c.announcement_text === 'string') ? c.announcement_text.trim().slice(0, 160) : '';
    return {
      ann:  (c.announcement_enabled !== false && text) ? text : '',
      img:  (c.promo_banner_enabled !== false) ? safeImg(c.promo_banner_image_url) : '',
      link: safeLink(c.promo_banner_link)
    };
  }

  function announceHtml(sc) {
    return '<div class="nkn-announce" id="nkn-announce" role="region" aria-label="Announcement"' + (sc.ann ? '' : ' hidden') + '>' +
      '<p class="nkn-announce-text" id="nkn-announce-text">' + esc(sc.ann) + '</p></div>';
  }
  function promoMedia(sc) {
    var img = '<img src="' + esc(sc.img) + '" alt="Promotion" decoding="async">';
    if (!sc.link) return img;
    return '<a href="' + esc(sc.link) + '"' + (/^https:/i.test(sc.link) ? ' target="_blank" rel="noopener"' : '') + '>' + img + '</a>';
  }
  function promoHtml(sc) {
    var show = !!sc.img && !promoDismissed(sc.img);
    return '<section class="nkn-promo" id="nkn-promo" aria-label="Promotion"' + (show ? ' data-key="' + esc(sc.img + '|' + sc.link) + '"' : ' hidden') + '>' +
      '<div class="nkn-promo-media" id="nkn-promo-media">' + (show ? promoMedia(sc) : '') + '</div>' +
      '<button type="button" class="nkn-promo-x" id="nkn-promo-x" aria-label="Dismiss promotion">' + ico('close') + '</button></section>';
  }
  function bindPromo() {                              // a banner image that fails to load is hidden instead of showing a broken icon
    var p = $('nkn-promo'), im = p && p.querySelector('img');
    if (im) im.onerror = function () { p.hidden = true; };
  }
  function applySite(sc) {
    var a = $('nkn-announce'), at = $('nkn-announce-text'), p = $('nkn-promo'), pm = $('nkn-promo-media');
    if (a && at) { at.textContent = sc.ann; a.hidden = !sc.ann; }
    if (p && pm) {
      var show = !!sc.img && !promoDismissed(sc.img), key = sc.img + '|' + sc.link;
      if (show) {
        if (p.getAttribute('data-key') !== key || !pm.firstChild) { pm.innerHTML = promoMedia(sc); p.setAttribute('data-key', key); bindPromo(); }
        p.hidden = false;
      } else { pm.innerHTML = ''; p.removeAttribute('data-key'); p.hidden = true; }
    }
  }

  /* ---- footer content: copyright, support email / phone, hours, social links ---- */
  var SOCIALS = [
    ['instagram', 'Instagram', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r=".7"/>'],
    ['tiktok',    'TikTok',    '<path d="M14 3v11.5a3.5 3.5 0 11-3.5-3.5"/><path d="M14 3c.3 2.6 2 4.4 5 4.6"/>'],
    ['facebook',  'Facebook',  '<path d="M14 8h3V4h-3a4 4 0 00-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>'],
    ['youtube',   'YouTube',   '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5l5 2.5-5 2.5z"/>'],
    ['pinterest', 'Pinterest', '<circle cx="12" cy="12" r="9"/><path d="M10.6 20l1.7-7.2"/><path d="M9.3 10.4c.4-2 2.2-3 3.9-2.5 1.6.5 2.2 2.5 1.4 4.2-.8 1.6-2.3 2-3.3 1.2"/>']
  ];
  function fixMail(h) { return /^mailto:/i.test(h) ? 'mailto:' + siteEmail('footer') : h; }
  function hoursText() { return siteStr('contact_hours', 120) || CONFIG.hours; }
  function footerContactHtml() {
    var out = '', ph = sitePhone('footer');
    if (siteEmailCustom()) out += '<a href="mailto:' + esc(siteEmail('footer')) + '">' + esc(siteEmail('footer')) + '</a>';
    if (ph) out += (out ? '<br>' : '') + '<a href="tel:' + esc(ph.replace(/[^\d+]/g, '')) + '">' + esc(ph) + '</a>';
    return out ? '<p class="nkn-f-contact">' + out + '</p>' : '';
  }
  function footerSocialHtml() {
    var links = SOCIALS.map(function (sc) {
      var u = siteStr('footer_social_' + sc[0], 300);
      return /^https:\/\/\S+$/i.test(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer" aria-label="' + sc[1] + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + sc[2] + '</svg></a>' : '';
    }).join('');
    return links ? '<div class="nkn-f-social" aria-label="Follow NIKORA">' + links + '</div>' : '';
  }
  function copyrightHtml() { var t = siteStr('footer_copyright', 200); return t ? esc(t) : '&copy; ' + new Date().getFullYear() + ' NIKORA. All rights reserved.'; }
  function applyFooter() {
    var el = document.querySelector('footer.nkn-footer'); if (!el) return;
    var html = buildFooterHtml();
    if (el._nkHtml !== html) { el.innerHTML = html; el._nkHtml = html; }
  }
  function swapMailLinks() {                          // every mailto: link that points at the default support address follows the saved one
    var cur = siteEmail('footer'), list = document.querySelectorAll('a[href^="mailto:"]');
    for (var i = 0; i < list.length; i++) {
      var a = list[i], href = a.getAttribute('href'), em = href.slice(7).split('?')[0], rest = href.slice(7 + em.length);
      if (a.hasAttribute('data-nk-own')) continue;                  /* the page sets this one itself (contact page) */
      if (em.toLowerCase() !== DEFAULT_EMAIL && !a._nkPrev) continue;
      if (a._nkPrev === cur || (!a._nkPrev && cur === DEFAULT_EMAIL)) continue;
      var prev = a._nkPrev || DEFAULT_EMAIL;
      a.setAttribute('href', 'mailto:' + cur + rest);
      if (a.textContent.trim().toLowerCase() === prev.toLowerCase()) a.textContent = cur;
      a._nkPrev = cur;
    }
  }

  /* ---- the shared store: one live copy of /site_content for the whole page ---- */
  function notifySite() {
    var key; try { key = JSON.stringify(SITE_DATA); } catch (e) { key = String(Date.now()); }
    if (key === siteLastKey) return;
    siteLastKey = key;
    siteSubs.slice().forEach(function (fn) { try { fn(SITE_DATA); } catch (err) { if (window.console) console.error('NikoraSite listener failed', err); } });
  }
  function onSiteContent(c) {
    SITE_DATA = (c && typeof c === 'object') ? c : {};
    siteLast = Date.now();
    siteCacheSet(SITE_DATA);
    applySite(sitePick(SITE_DATA));
    applyFooter();
    swapMailLinks();
    notifySite();
  }
  function fetchSite() {                              // one-off read (used when streaming is unavailable)
    if (typeof fetch !== 'function') return;
    fetch(SITE.dbUrl + '/site_content.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (c) { onSiteContent(c || {}); })
      .catch(function (err) { if (window.console) console.warn('NIKORA nav: site content unavailable, keeping the cached or default content.', err); });
  }
  function startPolling() {
    if (pollTimer) return;
    fetchSite();
    pollTimer = setInterval(function () { if (document.visibilityState !== 'hidden') fetchSite(); }, SITE.refreshMs);
  }
  function setAt(root, path, val) {                   // apply a Firebase stream event (path like "/faq_items/2/q") to the local copy
    if (path === '/' || path === '') return (val && typeof val === 'object') ? val : {};
    var seg = path.split('/').filter(Boolean), cur = root, k;
    for (var i = 0; i < seg.length - 1; i++) { k = seg[i]; if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; }
    k = seg[seg.length - 1];
    if (val === null || val === undefined) delete cur[k]; else cur[k] = val;
    return root;
  }
  function openStream() {                             // live updates on every page, with or without the Firebase SDK
    if (typeof EventSource !== 'function') return startPolling();
    var es, data = {}, got = false;
    try { es = new EventSource(SITE.dbUrl + '/site_content.json'); } catch (e) { return startPolling(); }
    function fallback() { try { es.close(); } catch (e) {} startPolling(); }
    es.addEventListener('put', function (ev) {
      try { var m = JSON.parse(ev.data); data = setAt(data, m.path, m.data); got = true; onSiteContent(JSON.parse(JSON.stringify(data))); } catch (e) {}
    });
    es.addEventListener('patch', function (ev) {
      try { var m = JSON.parse(ev.data); Object.keys(m.data || {}).forEach(function (k) { data = setAt(data, (m.path === '/' ? '' : m.path) + '/' + k, m.data[k]); }); got = true; onSiteContent(JSON.parse(JSON.stringify(data))); } catch (e) {}
    });
    es.addEventListener('cancel', fallback);
    es.addEventListener('auth_revoked', fallback);
    es.onerror = function () { if (!got) fallback(); };   // never connected (blocked, offline, rules) -> plain reads instead
  }
  function startSite() { openStream(); }

  window.NikoraSite = {                               // pages subscribe here: NikoraSite.onChange(function (content) { ... })
    get: function () { return SITE_DATA; },
    onChange: function (fn) {
      if (typeof fn !== 'function') return function () {};
      siteSubs.push(fn);
      try { fn(SITE_DATA); } catch (err) { if (window.console) console.error('NikoraSite listener failed', err); }
      return function () { var i = siteSubs.indexOf(fn); if (i >= 0) siteSubs.splice(i, 1); };
    },
    refresh: fetchSite,
    util: { toList: toList, answerHtml: answerHtml, inlineHtml: inlineHtml, rich: richText, safeLink: safeLink, safeImg: safeImg, email: siteEmail, phone: sitePhone, esc: esc }
  };
  var SC0 = sitePick(siteCacheGet());                 // first paint from the last known state, so nothing jumps in later

  var HTML = LOGO_SPRITE + announceHtml(SC0) + buildHeader() + promoHtml(SC0) + buildDrawer();
  var mounted = false;
  /* Apply the saved theme before any markup is inserted, so the logo (and the page) are correct on the very first paint. */
  function bootstrapTheme() {
    if (document.documentElement.hasAttribute('data-theme')) return;
    var saved = ''; try { saved = localStorage.getItem('theme') || ''; } catch (e) {}
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  }
  /* adaptive favicon (favicon.svg sits next to nav.js) unless the page already declares one */
  function ensureFavicon() {
    if (!document.head || document.querySelector('link[rel~="icon"]')) return;
    var lk = document.createElement('link');
    lk.rel = 'icon'; lk.type = 'image/svg+xml';
    lk.href = (SELF_SRC ? SELF_SRC.replace(/[^\\/?#]*([?#].*)?$/, '') : '') + 'favicon.svg';
    document.head.appendChild(lk);
  }
  function mount() {
    if (mounted) return; mounted = true;
    bootstrapTheme();
    ensureFavicon();
    injectStyle();
    var holder = document.getElementById('nikora-nav');
    var script = document.currentScript;
    if (holder) { holder.outerHTML = HTML; }
    else if (script && script.parentNode && script.parentNode !== document.head) { script.insertAdjacentHTML('beforebegin', HTML); }
    else { document.body.insertAdjacentHTML('afterbegin', HTML); }
    wire();
    bindPromo();
    startSite();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFooter); else mountFooter();
    loadAssistant();
  }

  function mountFooter() {
    if (document.querySelector('footer.nkn-footer')) return;
    var feet = document.querySelectorAll('footer');
    var old = document.querySelector('footer.site') || (feet.length ? feet[feet.length - 1] : null);
    var el = document.createElement('footer');
    el.className = 'nkn-footer';
    el._nkHtml = buildFooterHtml();
    el.innerHTML = el._nkHtml;
    if (old && old.parentNode) {
      if (old.id) el.id = old.id;                              /* keep any in-page anchor (e.g. #track) working */
      old.parentNode.replaceChild(el, old);
    } else {
      document.body.appendChild(el);
    }
    swapMailLinks();
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
      if (t.closest('#nkn-promo-x')) {
        var pr = $('nkn-promo'), key = pr && pr.getAttribute('data-key');
        try { if (key) sessionStorage.setItem(SITE.dismissKey, key.split('|')[0]); } catch (er) {}
        if (pr) pr.hidden = true;
        return;
      }
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
  window.NikoraNav = { openMenu: openMenu, closeMenu: closeMenu, config: CONFIG, refreshSiteContent: fetchSite };
  /* legacy global names used by older page code (pages' own definitions may delegate to these) */
  if (typeof window.openMobileMenu !== 'function')  window.openMobileMenu = openMenu;
  if (typeof window.closeMobileMenu !== 'function') window.closeMobileMenu = closeMenu;

  if (document.body || document.currentScript) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }
})();
