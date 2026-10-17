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
    logoWordmark: true,                               // show the "NIKora" wordmark next to the bunny (false = bunny only)
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
  '.nkn-logo{--nkn-logo-h:46px;display:inline-flex;align-items:center;gap:calc(var(--nkn-logo-h) * .24);flex:none;line-height:1;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
  '.nkn-logo-svg{display:block;flex:none;height:var(--nkn-logo-h);width:calc(var(--nkn-logo-h) * 0.7357);aspect-ratio:503.25 / 684;overflow:visible;shape-rendering:geometricPrecision;',
  '  fill:var(--nkn-logo-primary);color:var(--nkn-logo-accent);transition:fill .35s ease,color .35s ease;}',
  '.nkn-wordmark{font-family:"Playfair Display",Georgia,"Times New Roman",serif;font-weight:600;font-size:calc(var(--nkn-logo-h) * .56);letter-spacing:.04em;line-height:1;white-space:nowrap;color:var(--nkn-logo-primary);transition:color .35s ease;}',
  '.nkn-wordmark em{font-style:normal;color:var(--nkn-logo-accent);}',
  '.nkn-d-head .nkn-logo{--nkn-logo-h:44px;}',
  '.nkn-footer .nkn-logo{--nkn-logo-h:64px;}',

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
  '@media (max-width:600px){ .nkn-header .nkn-logo{--nkn-logo-h:40px;} .nkn-footer .nkn-logo{--nkn-logo-h:56px;} }',
  '@media (max-width:360px){ .nkn-header .nkn-pill{display:none;} .nkn-header .nkn-logo{--nkn-logo-h:36px;} }',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkn-drawer,.nkn-overlay,.nkn-link::after,.nkn-f-link,.nkn-logo-svg,.nkn-wordmark{transition-duration:.001s !important;transition-delay:0s !important;}',
  '  .nkn-drawer.active .nkn-d-sec{animation:none;}',
  '}'
  ].join('\n');

  /* ======================================================================
   * 4. MARKUP
   * ====================================================================== */
  /* The NIKORA bunny mascot is drawn once as an SVG <symbol> (vector trace of the official artwork) and reused for the header, drawer and footer.
     The gold outline uses currentColor (--nkn-logo-accent); the face (eyes, nose, mouth) uses `fill` (--nkn-logo-primary: obsidian in light mode, white in dark),
     so everything follows the theme toggle with no image swap, jump or flash. */
  var LOGO_SPRITE = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false">' +
    '<symbol id="nkn-logo-sym" viewBox="0 0 503.25 684">' +
    '<path fill="currentColor" fill-rule="evenodd" d="M76.8 10.1C71.7 10.4 66.8 10.8 61.8 12.6C56.8 14.4 51.5 17.2 46.8 21C42 24.8 37 30.4 33.4 35.3C29.8 40.1 27.1 45.2 25 50.2C22.8 55.2 21.5 60.3 20.5 65.3C19.5 70.3 19.3 75.3 19 80.3C18.7 85.3 18.6 90.2 18.7 95.2C18.8 100.2 19.2 105.3 19.8 110.3C20.3 115.3 21.2 120.3 22.1 125.3C23 130.3 24 135.3 25.2 140.3C26.4 145.3 27.9 150.3 29.3 155.3C30.8 160.3 32.3 165.2 34 170.2C35.7 175.2 37.5 180.3 39.6 185.3C41.6 190.3 43.9 195.3 46.3 200.3C48.6 205.3 51.1 210.3 53.7 215.3C56.3 220.3 59 225.3 61.9 230.3C64.7 235.3 67.7 240.3 70.7 245.3C73.8 250.3 77 255.3 80.3 260.3C83.7 265.3 89.2 270.5 90.6 275.3C92.1 280 91.7 284.5 89 289C86.3 293.5 78.9 297.8 74.3 302.3C69.6 306.9 65.2 311.7 61.1 316.5C57 321.4 53 326.5 49.4 331.5C45.8 336.5 42.6 341.5 39.6 346.5C36.6 351.5 33.9 356.5 31.4 361.5C29 366.5 26.7 371.5 24.7 376.5C22.7 381.5 20.9 386.5 19.3 391.5C17.8 396.5 16.4 401.5 15.3 406.5C14.1 411.5 13.1 416.5 12.4 421.5C11.6 426.5 11 431.5 10.6 436.5C10.2 441.5 10 446.5 10 451.5C10 456.5 10.1 461.5 10.4 466.5C10.7 471.5 11.2 476.5 12 481.5C12.7 486.5 13.6 491.5 14.8 496.5C15.9 501.5 17.1 506.5 18.6 511.5C20.1 516.5 21.8 521.5 23.8 526.5C25.7 531.5 27.9 536.5 30.3 541.5C32.7 546.5 35.3 551.5 38.2 556.5C41.1 561.5 44.2 566.5 47.7 571.5C51.2 576.5 54.9 581.5 59.1 586.5C63.3 591.5 68 596.7 72.8 601.5C77.5 606.3 82.5 610.9 87.5 615.2C92.5 619.4 97.5 623.3 102.5 626.9C107.5 630.5 112.5 633.7 117.5 636.8C122.5 639.8 127.5 642.6 132.5 645.2C137.5 647.8 142.5 650.2 147.5 652.4C152.5 654.6 157.5 656.5 162.5 658.4C167.5 660.2 172.5 661.8 177.5 663.3C182.5 664.8 187.5 666.1 192.5 667.2C197.5 668.4 202.5 669.3 207.5 670.2C212.5 671 217.5 671.8 222.5 672.4C227.5 672.9 232.5 673.3 237.5 673.5C242.5 673.8 247.5 674 252.5 674C257.5 674 262.5 673.8 267.5 673.5C272.5 673.2 277.5 672.7 282.5 672.1C287.5 671.5 292.5 670.8 297.5 669.9C302.5 669 307.5 668 312.5 666.8C317.5 665.6 322.5 664.3 327.5 662.8C332.5 661.3 337.5 659.6 342.5 657.7C347.5 655.8 352.5 653.8 357.5 651.6C362.5 649.3 367.5 647 372.5 644.3C377.5 641.7 382.5 638.8 387.5 635.6C392.5 632.5 397.5 629.2 402.5 625.5C407.5 621.8 412.5 617.9 417.5 613.6C422.5 609.2 427.8 604.3 432.5 599.5C437.1 594.7 441.5 589.7 445.5 584.8C449.6 579.8 453.3 574.8 456.7 569.8C460.1 564.8 463.1 559.8 466 554.8C468.8 549.8 471.4 544.8 473.8 539.8C476.1 534.8 478.2 529.8 480.1 524.8C482 519.8 483.6 514.8 485 509.8C486.5 504.8 487.7 499.8 488.8 494.8C489.9 489.8 490.8 484.8 491.4 479.8C492.1 474.7 492.6 469.5 492.9 464.5C493.2 459.5 493.3 454.5 493.3 449.5C493.2 444.5 492.9 439.5 492.5 434.5C492 429.5 491.3 424.5 490.5 419.5C489.6 414.5 488.7 409.5 487.4 404.5C486.2 399.5 484.8 394.5 483.2 389.5C481.5 384.5 479.7 379.5 477.6 374.5C475.6 369.5 473.3 364.5 470.8 359.5C468.2 354.5 465.5 349.5 462.4 344.5C459.3 339.5 456 334.5 452.3 329.5C448.7 324.5 444.7 319.5 440.3 314.5C436 309.5 431.1 304.4 426.2 299.8C421.4 295.1 412.7 291.2 411.3 286.6C409.8 282 414.9 276.9 417.7 272C420.4 267.1 424.5 262 427.8 257C431.1 252 434.3 247 437.3 242C440.3 237 443.2 232 446 227C448.7 222 451.4 217 453.9 212C456.5 207 459 202 461.3 197C463.6 192 465.8 187 467.8 182C469.7 177 471.4 172 473.1 167C474.7 162 476.2 157 477.6 152C479.1 147 480.3 142 481.5 137C482.6 132 483.7 127 484.6 122C485.4 117 486 112 486.5 107C487 102 487.5 97 487.5 92C487.5 87 487.2 82 486.8 77C486.3 72 486 67 484.8 62C483.6 57 482 52 479.5 47C477.1 42 474.1 36.8 470.1 32C466.2 27.2 460.9 21.8 456 18.5C451.1 15.1 446 13.1 441 11.7C436 10.3 431 10.1 426 10C421 9.9 416 10.2 411 10.9C406 11.7 401 12.8 396 14.6C391 16.3 386 18.5 381 21.4C376 24.4 370.9 28.2 366 32.5C361.1 36.8 356 42.3 351.7 47.2C347.5 52.1 344 57 340.6 62C337.1 67 333.9 72 331 77C328.1 82 325.4 87 323.2 92C320.9 97 319.1 102 317.4 107C315.6 112 314.2 117 312.8 122C311.3 127 310.1 132 308.8 137C307.6 142 306.5 147 305.4 152C304.3 157 303.2 162 302.4 167C301.5 172 300.8 177 300.1 182C299.4 187 298.9 192 298.4 197C297.9 202 297.5 207 297.1 212C296.8 217 297.8 223.3 296.5 227C295.2 230.7 293 233.3 289.3 234.2C285.5 235.1 279.2 232.9 274.2 232.5C269.2 232 264.3 231.7 259.3 231.5C254.3 231.4 249.3 231.4 244.3 231.5C239.3 231.7 234.2 232 229.2 232.5C224.2 232.9 217.6 235.5 214.3 234.1C210.9 232.7 210.2 228.2 209.3 224C208.3 219.8 208.9 214 208.5 209C208.2 204 207.8 199 207.3 194C206.8 189 206.2 184 205.5 179C204.8 174 204 169 203.1 164C202.1 159 201.1 154 199.9 149C198.8 144 197.6 139 196.4 134C195.1 129 193.9 124 192.4 119C190.9 114 189.4 109 187.6 104C185.7 99 183.8 94 181.4 89C179 84 176.2 79 173.2 74C170.2 69 166.9 64 163.4 59C159.8 54 156.1 49.1 151.7 44.3C147.3 39.4 141.9 34 137 29.9C132.1 25.8 127 22.5 122 19.8C117 17.1 112 15.2 107 13.6C102 12.1 97 11.2 92 10.6C87 10 81.8 9.8 76.8 10.1ZM245.3 254.9C250.3 254.8 255.3 254.8 260.3 255C265.3 255.2 270.3 255.5 275.3 256C280.3 256.5 285.3 257.1 290.3 258C295.3 258.8 300.3 259.8 305.3 261C310.3 262.2 315.3 263.5 320.3 265.1C325.3 266.6 330.3 268.3 335.3 270.3C340.3 272.2 345.2 274.3 350.2 276.7C355.3 279 360.5 281.7 365.5 284.6C370.5 287.4 375.5 290.5 380.5 293.9C385.5 297.3 390.5 301 395.5 305.1C400.5 309.2 405.7 313.9 410.4 318.6C415.2 323.3 419.7 328.3 423.8 333.3C427.9 338.2 431.7 343.3 435.1 348.3C438.5 353.3 441.5 358.2 444.3 363.3C447.1 368.3 449.7 373.5 451.9 378.5C454.2 383.5 456.1 388.5 457.8 393.5C459.5 398.5 461 403.5 462.2 408.5C463.5 413.5 464.5 418.5 465.4 423.5C466.2 428.5 466.7 433.5 467.1 438.5C467.5 443.5 467.8 448.5 467.8 453.5C467.7 458.5 467.5 463.5 467 468.5C466.5 473.5 465.9 478.7 465 483.8C464.1 488.8 463.1 493.8 461.7 498.8C460.4 503.8 458.9 508.8 457.1 513.8C455.3 518.8 453.3 523.8 451.1 528.8C448.8 533.8 446.3 538.8 443.4 543.8C440.6 548.8 437.5 553.8 434 558.8C430.5 563.8 426.8 568.7 422.5 573.8C418.2 578.8 413.1 584.3 408.3 589C403.4 593.7 398.3 598.1 393.3 602.1C388.3 606.1 383.3 609.7 378.3 613C373.3 616.3 368.3 619.3 363.3 622.1C358.3 624.9 353.3 627.4 348.3 629.7C343.3 632 338.3 634 333.3 635.9C328.3 637.7 323.3 639.4 318.3 640.9C313.2 642.4 308 643.8 303 644.9C298 646 293 646.9 288 647.7C283 648.5 278 649.1 273 649.6C268 650.1 263 650.4 258 650.5C253 650.6 248 650.7 243 650.5C238 650.3 233 649.9 228 649.4C223 648.9 218 648.3 213 647.4C208 646.6 202.8 645.5 197.8 644.3C192.7 643.1 187.8 641.8 182.8 640.2C177.8 638.7 172.8 637 167.8 635C162.8 633.1 157.8 631 152.8 628.6C147.8 626.3 142.8 623.7 137.8 620.8C132.8 618 127.8 615 122.8 611.5C117.8 608.1 112.8 604.5 107.8 600.3C102.7 596.1 97.3 591.3 92.5 586.5C87.7 581.7 83.1 576.7 79 571.8C74.9 566.8 71.2 561.8 67.8 556.8C64.4 551.8 61.4 546.8 58.6 541.8C55.9 536.8 53.4 531.8 51.2 526.8C49 521.8 47.1 516.8 45.3 511.8C43.6 506.8 42.2 501.8 40.9 496.8C39.7 491.7 38.6 486.5 37.8 481.5C37 476.5 36.4 471.5 36 466.5C35.6 461.5 35.5 456.5 35.5 451.5C35.5 446.5 35.8 441.5 36.2 436.5C36.7 431.5 37.3 426.5 38.2 421.5C39.1 416.5 40.2 411.5 41.5 406.5C42.8 401.5 44.3 396.5 46.1 391.5C47.9 386.5 50 381.3 52.3 376.2C54.6 371.2 57.1 366.3 60 361.3C62.9 356.3 65.9 351.2 69.4 346.2C72.9 341.2 76.8 336.2 81 331.3C85.2 326.3 90 321.4 94.8 316.7C99.5 312.1 104.8 307.5 109.8 303.5C114.8 299.4 119.7 295.9 124.8 292.5C129.8 289.1 135 286.1 140 283.3C145 280.5 150 278 155 275.7C160 273.4 165 271.4 170 269.5C175 267.6 180 266 185 264.5C190 263 195 261.7 200 260.5C205 259.4 210 258.4 215 257.6C220 256.9 225 256.3 230 255.8C235 255.3 240.2 255 245.3 254.9ZM417.3 37.9C422.4 37.7 427.4 37.9 432.5 39.9C437.6 41.8 443.7 45.6 447.7 49.7C451.7 53.9 454.5 59.7 456.5 64.8C458.6 69.8 459.4 75.1 460.1 80.3C460.7 85.4 460.7 90.4 460.5 95.5C460.3 100.6 459.5 105.9 458.7 111C457.9 116.1 456.8 121.1 455.6 126.3C454.4 131.4 453 136.6 451.5 141.8C450 146.9 448.4 151.9 446.7 157C445 162.1 443.1 167.4 441.1 172.5C439.1 177.6 437 182.6 434.7 187.8C432.4 192.9 430 198.1 427.5 203.3C424.9 208.4 422.4 213.4 419.6 218.5C416.8 223.6 413.8 228.9 410.7 234C407.6 239.1 404.5 244.1 401.1 249.3C397.6 254.4 394.4 262.5 390.2 264.8C386.1 267 381 264.6 376 263C371 261.4 365.6 257.6 360.5 255.2C355.4 252.8 350.4 250.7 345.3 248.7C340.1 246.7 333.5 246.1 329.8 243.3C326 240.6 324.1 236.7 323 232.3C321.9 227.8 322.9 221.9 323 216.8C323.1 211.6 323.4 206.6 323.8 201.5C324.3 196.4 324.9 191.1 325.6 186C326.3 180.9 327.1 175.9 328 170.8C328.9 165.6 329.9 160.4 331 155.3C332.1 150.1 333.3 145.1 334.7 140C336.2 134.9 337.9 129.6 339.6 124.5C341.3 119.4 342.9 114.4 344.9 109.3C346.9 104.1 349.1 98.9 351.7 93.8C354.2 88.6 356.9 83.6 360.4 78.5C363.9 73.4 368.2 67.8 372.5 63C376.9 58.2 381.4 53.6 386.3 49.9C391.1 46.2 396.6 43 401.8 41C406.9 39 412.1 38.1 417.3 37.9ZM84.3 37.9C89.4 37.5 94.4 38.2 99.5 39.6C104.6 40.9 109.8 42.8 114.8 46.1C119.7 49.3 124.9 54.2 129.5 58.8C134 63.4 138.4 68.5 142.2 73.5C145.9 78.5 149.1 83.9 151.9 89C154.7 94.1 157 99.2 159.1 104.3C161.3 109.3 163 114.4 164.7 119.5C166.5 124.6 168.3 129.9 169.8 135C171.3 140.1 172.6 145.1 173.8 150.2C175 155.4 176.1 160.6 177.1 165.8C178 170.9 178.9 175.9 179.7 181C180.4 186.1 181 191.1 181.6 196.2C182.1 201.4 182.6 206.6 182.9 211.8C183.1 216.9 183.4 222.1 183 227C182.6 231.9 183.5 238.1 180.5 241.2C177.5 244.4 170.3 244.2 165.3 246C160.2 247.8 155.1 249.7 150 251.9C144.9 254.1 139.6 256.5 134.5 259.1C129.4 261.7 123.7 268.3 119.3 267.4C114.8 266.5 111.4 258.4 107.8 253.5C104.2 248.6 101 243.3 97.9 238.3C94.7 233.2 91.8 228.1 88.9 223C86 217.9 83.3 212.6 80.7 207.5C78.1 202.4 75.6 197.4 73.3 192.2C71 187.1 68.7 181.9 66.6 176.8C64.5 171.6 62.7 166.6 60.9 161.5C59.1 156.4 57.4 151.4 55.8 146.3C54.3 141.1 52.8 135.9 51.5 130.8C50.2 125.6 49 120.6 48.1 115.5C47.1 110.4 46.2 105.1 45.8 100C45.4 94.9 45.2 89.8 45.5 84.8C45.9 79.7 46.4 74.6 48 69.5C49.5 64.4 51.4 58.6 54.9 54C58.3 49.4 63.9 44.4 68.8 41.8C73.6 39.1 79.1 38.3 84.3 37.9Z"/>' +
    '<path d="M250.5 448.4C245.5 448.5 240.4 448.9 235.5 450.4C230.6 451.8 222.1 453.6 220.9 457.3C219.6 460.9 224.3 468.3 228 472.1C231.7 475.8 240 476.5 243 480C246 483.5 246.3 488.3 246.3 493C246.2 497.7 245.6 503.8 242.5 507.9C239.4 512 232.5 515.4 227.5 517.3C222.5 519.3 217.5 519.9 212.5 519.5C207.5 519.1 202.3 517.3 197.5 514.8C192.7 512.3 186.3 504.2 183.5 504.7C180.7 505.1 178.6 513.5 180.5 517.5C182.5 521.5 190.3 526.1 195.3 528.7C200.2 531.3 205.3 532.4 210.3 533C215.3 533.6 220.3 533.5 225.3 532.3C230.3 531.2 235.4 528.4 240.3 526.1C245.1 523.8 249.7 518.3 254.6 518.7C259.4 519.1 264.5 526.3 269.5 528.7C274.5 531.1 279.5 532.5 284.5 533.1C289.5 533.7 294.5 533.4 299.5 532.2C304.5 531.1 309.9 529.5 314.5 526.2C319.1 523 326.8 516.1 327.2 512.8C327.6 509.4 320.9 505.4 316.9 506.2C312.8 506.9 307.6 515 302.8 517.3C297.9 519.5 292.8 519.9 287.8 519.5C282.8 519.1 277.5 517.8 272.8 515.1C268 512.4 261.7 507.7 259.5 503.3C257.3 498.8 258.1 492.4 259.5 488.3C260.9 484.1 264.3 481.8 268 478.4C271.7 475.1 279.8 472 282 468C284.1 464 283.5 457.5 280.8 454.4C278 451.4 270.8 450.7 265.8 449.7C260.7 448.7 255.5 448.3 250.5 448.4ZM354.3 382.4C349.1 383.2 342.6 386.7 338.8 390.8C335 394.8 332.5 401.3 331.5 406.5C330.6 411.7 330.9 417.2 333.1 422.3C335.3 427.3 340.2 433.8 344.8 436.8C349.3 439.8 355.3 441 360.5 440.2C365.7 439.4 372.4 435.8 376.2 431.7C380 427.7 382.5 421.2 383.4 416C384.3 410.8 384 405.3 381.8 400.3C379.5 395.2 374.6 388.7 370 385.7C365.4 382.7 359.4 381.6 354.3 382.4ZM146.8 381.9C141.5 382.4 135 385.4 131 389.3C127.1 393.1 124.1 399.8 122.9 405C121.7 410.2 121.9 415.6 123.9 420.8C125.9 425.9 130.3 432.5 134.8 435.7C139.2 438.9 145.3 440.5 150.5 440C155.7 439.5 162.2 436.5 166.2 432.7C170.2 428.9 173.1 422.2 174.3 417C175.5 411.8 175.4 406.4 173.4 401.3C171.5 396.1 166.9 389.4 162.5 386.2C158.1 383 152 381.4 146.8 381.9Z"/>' +
    '</symbol></svg>';
  function logoHtml(extra) {
    return '<a class="nkn-logo"' + (extra || '') + ' href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">' +
      '<svg class="nkn-logo-svg" viewBox="0 0 503.25 684" width="503.25" height="684" aria-hidden="true" focusable="false"><use href="#nkn-logo-sym" width="100%" height="100%"></use></svg>' +
      (CONFIG.logoWordmark ? '<span class="nkn-wordmark" aria-hidden="true">NIK<em>ora</em></span>' : '') + '</a>';
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
