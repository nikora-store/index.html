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
    logoWordmark: true,                               // show the "NIKORA" wordmark next to the bunny (false = bunny only)
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
  '  --nkn-logo-primary:#0B0B0E; --nkn-logo-accent:#C89B54; --nkn-logo-weight:8;',
  '  --nkn-gold:var(--gold,#C59B56); --nkn-gold-rgb:var(--gold-rgb,197,155,86); --nkn-line:var(--line,rgba(26,22,21,.1));',
  '  --nkn-bar:var(--header-bg,rgba(250,247,242,.78)); --nkn-card:var(--card-bg,rgba(255,255,255,.65));',
  '  --nkn-border:var(--card-border,rgba(230,220,210,.6)); --nkn-panel:var(--surface-raised,rgba(255,255,255,.88));',
  '  --nkn-tint:var(--surface-tint,rgba(26,22,21,.04)); --nkn-rose:var(--rose,#D81E5B);',
  '  --nkn-float-bg:rgba(250,247,242,.72); --nkn-float-bg-scrolled:rgba(250,247,242,.88); --nkn-float-edge:rgba(26,22,21,.09);',
  '  --nkn-float-shadow:0 14px 34px -22px rgba(26,22,21,.34); --nkn-float-shadow-scrolled:0 18px 40px -20px rgba(26,22,21,.46);',
  '}',
  ':root[data-theme="dark"] .nkn-header,:root[data-theme="dark"] .nkn-overlay,:root[data-theme="dark"] .nkn-drawer,:root[data-theme="dark"] .nkn-footer{',
  '  --nkn-text:var(--text,#F7F4F0); --nkn-soft:var(--text-soft,rgba(247,244,240,.64)); --nkn-faint:var(--text-faint,rgba(247,244,240,.4));',
  '  --nkn-logo-primary:#FFFFFF; --nkn-logo-accent:#C89B54; --nkn-logo-weight:8;',
  '  --nkn-gold:var(--gold,#E5BA73); --nkn-gold-rgb:var(--gold-rgb,229,186,115); --nkn-line:var(--line,rgba(255,255,255,.09));',
  '  --nkn-bar:var(--header-bg,rgba(13,11,18,.72)); --nkn-card:var(--card-bg,rgba(25,20,32,.55));',
  '  --nkn-border:var(--card-border,rgba(255,255,255,.08)); --nkn-panel:var(--surface-raised,rgba(30,25,38,.9));',
  '  --nkn-tint:var(--surface-tint,rgba(255,255,255,.05)); --nkn-rose:var(--rose,#FF527B);',
  '  --nkn-float-bg:rgba(11,11,14,.66); --nkn-float-bg-scrolled:rgba(11,11,14,.86); --nkn-float-edge:rgba(255,255,255,.09);',
  '  --nkn-float-shadow:0 20px 44px -24px rgba(0,0,0,.85); --nkn-float-shadow-scrolled:0 24px 48px -20px rgba(0,0,0,.9);',
  '}',

  /* ---- header bar (glass) ---- */
  /* Floating curved header: docks to the top edge, floats clear of the side edges, soft 20px bottom corners, frosted glass,
     faint neutral hairline edge (no gold bar anywhere on the header: gold is reserved for the logo, the theme pill and the nav indicator). Every colour is a theme variable (see --nkn-float-* above). */
  '.nkn-header{--nkn-header-r:20px;position:sticky;top:0;z-index:400;height:73px;box-sizing:border-box;color:var(--nkn-text);',
  '  margin:0 clamp(8px,2.2vw,28px);border:1px solid var(--nkn-float-edge);border-top:0;',
  '  border-radius:0 0 var(--nkn-header-r) var(--nkn-header-r);',
  '  background:var(--nkn-float-bg);-webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%);',
  '  box-shadow:var(--nkn-float-shadow);transition:background-color .3s ease,box-shadow .3s ease,border-color .3s ease;font-family:inherit;}',
  '.nkn-header.is-scrolled{background:var(--nkn-float-bg-scrolled);box-shadow:var(--nkn-float-shadow-scrolled);}',
  '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.nkn-header{background:var(--nkn-float-bg-scrolled);}}',
  '.nkn-header *,.nkn-drawer *,.nkn-footer *{box-sizing:border-box;}',
  '.nkn-row{display:flex;align-items:center;justify-content:space-between;gap:24px;height:100%;padding:0 clamp(20px,4vw,48px);}',
  /* NIKORA logo: bunny mascot as one inline SVG (stroke = gold outline, fill = face), recoloured by CSS variables, so it follows the theme toggle with no swap, jump or flash.
     --nkn-logo-weight sets the outline thickness in SVG units (viewBox is ~101 x 133, so 8 = bold and plush at header size). */
  '.nkn-logo{--nkn-logo-h:46px;display:inline-flex;align-items:center;gap:calc(var(--nkn-logo-h) * .26);flex:none;line-height:1;text-decoration:none;-webkit-tap-highlight-color:transparent;}',
  '.nkn-logo-svg{display:block;flex:none;height:var(--nkn-logo-h);width:calc(var(--nkn-logo-h) * .7609);aspect-ratio:101.2 / 133;overflow:visible;shape-rendering:geometricPrecision;',
  '  fill:var(--nkn-logo-primary);color:var(--nkn-logo-accent);transition:fill .35s ease,color .35s ease;}',
  '.nkn-wordmark{display:inline-flex;align-items:baseline;position:relative;top:-.06em;font-family:"Playfair Display","Cormorant Garamond",Georgia,"Times New Roman",serif;font-size:calc(var(--nkn-logo-h) * .5);line-height:1;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;}',
  '.nkn-wordmark .nkn-nik{font-weight:600;font-style:normal;color:var(--nkn-logo-primary);transition:color .35s ease;}',
  '.nkn-wordmark .nkn-ora{font-weight:500;font-style:italic;color:var(--nkn-logo-accent);margin-left:-.04em;transition:color .35s ease;}',
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
  '.nkn-link:hover,.nkn-link:focus-visible,.nkn-link.is-current{color:var(--nkn-text);}',
  /* Liquid BELL-CURVE indicator: an inline SVG hill (no border-radius, no box) whose base flares outward and fades into the header's bottom edge, so it
     looks melted into the navbar. nav.js injects the <svg> into .nkn-ind and sets the element's transform + width (px, from the link's offsetLeft / offsetWidth).
     .nkn-ind-track = a strip along the header's bottom edge (nav.js sets bottom/left/right) that clips the curve to the links wrapper plus a margin for the flared tails
     and the glow. The SVG stretches with the element's width (preserveAspectRatio="none"), which is what makes the travelling ripple look liquid.
     Colour: brand gold #C89B54 gradient (fixed, translucent highlights) so both themes work. */
  '.nkn-primary{--nkn-bell-h:8px;position:relative;}',
  '.nkn-ind-track{position:absolute;left:0;right:0;bottom:0;height:22px;overflow:hidden;pointer-events:none;}',
  '.nkn-ind{position:absolute;left:0;top:0;width:0;height:100%;opacity:0;transform-origin:50% 100%;will-change:transform,width;transition:opacity .25s ease;}',
  '.nkn-ind::before{content:"";position:absolute;left:-10px;right:-10px;bottom:0;height:100%;background:radial-gradient(ellipse 50% 100% at 50% 100%,rgba(200,155,84,.45),rgba(200,155,84,0));}',
  '.nkn-ind svg{position:absolute;left:0;bottom:0;display:block;width:100%;height:var(--nkn-bell-h);overflow:visible;filter:drop-shadow(0 0 5px rgba(200,155,84,.6));}',
  '.nkn-ind.is-on{opacity:1;}',
  '.nkn-ind.is-fx{transition:opacity .25s ease,transform .55s cubic-bezier(.68,-.55,.26,1.55),width .55s cubic-bezier(.68,-.55,.26,1.55);}',   /* only used when the Web Animations API is missing: plain spring, no stretch */
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

  /* ---- footer: frosted glass with an asymmetric multi-layer wave top edge + two ambient glow orbs ----
     Structure (see waveHtml()): .nkn-f-deco (decor, aria-hidden) = 2 glow orbs, glass strip clipped to the wave, glass body, SVG wave layers; .nkn-f-wrap = the content on top.
     Gold is the fixed brand #C89B54 (--nkn-f-gold); everything else comes from the variables below, so both themes need no hardcoded white. */
  '.nkn-footer{--nkn-f-gold:200,155,84;--nkn-f-glow2:214,140,118;--nkn-wave-h:clamp(48px,8vw,112px);',
  '  --nkn-foot-bg:rgba(11,11,14,.045);--nkn-wave-a:.22;--nkn-wave-b:.14;--nkn-edge-a:.5;--nkn-edge-b:.26;--nkn-edge-c:.14;--nkn-glow-a:.2;--nkn-glow-b:.13;',
  '  position:relative;isolation:isolate;display:block;width:100%;max-width:none;margin:12px 0 0;padding:calc(var(--nkn-wave-h) + 34px) 0 28px;color:var(--nkn-text);font-family:inherit;}',
  ':root[data-theme="dark"] .nkn-footer{--nkn-foot-bg:rgba(11,11,14,.62);--nkn-wave-a:.2;--nkn-wave-b:.12;--nkn-edge-a:.42;--nkn-edge-b:.22;--nkn-edge-c:.12;--nkn-glow-a:.17;--nkn-glow-b:.11;}',
  '.nkn-f-deco{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}',
  '.nkn-f-glow{position:absolute;z-index:0;aspect-ratio:1;border-radius:50%;will-change:transform,opacity;backface-visibility:hidden;',
  '  animation:ambientGlowPulse var(--nkn-gd,15s) ease-in-out var(--nkn-gdl,0s) infinite;animation-play-state:paused;}',
  '.nkn-f-glow-a{--nkn-gd:15s;--nkn-gx:9%;--nkn-gy:7%;left:-6%;top:0;width:clamp(260px,36vw,560px);background:radial-gradient(closest-side,rgba(var(--nkn-f-gold),var(--nkn-glow-a)),transparent);}',
  '.nkn-f-glow-b{--nkn-gd:21s;--nkn-gdl:-8s;--nkn-gx:-10%;--nkn-gy:-8%;right:-5%;bottom:0;width:clamp(220px,30vw,460px);background:radial-gradient(closest-side,rgba(var(--nkn-f-glow2),var(--nkn-glow-b)),transparent);}',
  '.nkn-f-glass-wave,.nkn-f-glass{position:absolute;left:0;right:0;z-index:1;background:var(--nkn-foot-bg);-webkit-backdrop-filter:blur(12px) saturate(140%);backdrop-filter:blur(12px) saturate(140%);}',
  '.nkn-f-glass-wave{top:0;height:var(--nkn-wave-h);-webkit-clip-path:url(#nkn-wave-clip);clip-path:url(#nkn-wave-clip);}',
  '.nkn-f-glass{top:var(--nkn-wave-h);bottom:0;}',
  '.nkn-f-wave{position:absolute;left:0;top:0;z-index:2;display:block;width:100%;height:var(--nkn-wave-h);overflow:hidden;}',
  /* Motion. Only whole elements are animated, and only with transform / opacity, so the browser can run it on the compositor (GPU):
     each back wave is its own <svg> (a 5.6% overhang on both sides lets it drift sideways without ever showing an end), the two glow orbs are plain divs.
     The front crest and the glass strip stay still: the glass is clipped to that curve and must keep registering with it. Animations only run while the
     footer is on screen (.is-live, set by an IntersectionObserver in nav.js) and are switched off for prefers-reduced-motion. */
  '.nkn-f-layer{left:-5.5556%;width:111.1111%;overflow:visible;transform-origin:50% 100%;will-change:transform;backface-visibility:hidden;',
  '  animation:footerWaveFloat var(--nkn-wd,14s) ease-in-out var(--nkn-wdl,0s) infinite alternate;animation-play-state:paused;}',
  '.nkn-f-layer-a{--nkn-wd:18s;--nkn-wdl:-7s;--nkn-wx:2.2%;--nkn-wy0:.9;--nkn-wy1:1.04;}',
  '.nkn-f-layer-b{--nkn-wd:12s;--nkn-wdl:-3s;--nkn-wx:1.5%;--nkn-wy0:.93;--nkn-wy1:1.05;}',
  '.nkn-footer.is-live .nkn-f-layer,.nkn-footer.is-live .nkn-f-glow{animation-play-state:running;}',
  '@keyframes footerWaveFloat{0%{transform:translate3d(calc(var(--nkn-wx) * -1),0,0) scaleY(var(--nkn-wy0));}100%{transform:translate3d(var(--nkn-wx),0,0) scaleY(var(--nkn-wy1));}}',
  '@keyframes ambientGlowPulse{0%,100%{opacity:.55;transform:translate3d(0,0,0) scale(.92);}50%{opacity:1;transform:translate3d(var(--nkn-gx),var(--nkn-gy),0) scale(1.08);}}',
  '@media (prefers-reduced-motion:reduce){.nkn-f-layer,.nkn-f-glow{animation:none !important;}}',
  '.nkn-f-wave .nkn-we{fill:none;vector-effect:non-scaling-stroke;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}',
  '.nkn-f-wave .nkn-we-a{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-c));}',
  '.nkn-f-wave .nkn-we-b{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-b));}',
  '.nkn-f-wave .nkn-we-f{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-a));}',
  '.nkn-f-wrap{position:relative;z-index:3;max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px);}',
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
  '@media (max-width:480px){.nkn-f-grid{grid-template-columns:1fr;gap:26px;}.nkn-footer{padding-top:calc(var(--nkn-wave-h) + 22px);}}',

  /* ---- responsive: below the breakpoint the bar collapses into the burger ---- */
  '@media (max-width:' + (BP - 0.02) + 'px){',
  '  .nkn-primary{display:none;}',
  '  .nkn-burger{display:grid;}',
  '  .nkn-row{gap:14px;}',
  '}',
  '@media (max-width:600px){ .nkn-header{--nkn-header-r:16px;margin:0 8px;} .nkn-header .nkn-logo{--nkn-logo-h:40px;} .nkn-footer .nkn-logo{--nkn-logo-h:56px;} }',
  '@media (max-width:360px){ .nkn-header .nkn-pill{display:none;} .nkn-header .nkn-logo{--nkn-logo-h:36px;} }',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkn-header,.nkn-drawer,.nkn-overlay,.nkn-ind,.nkn-f-link,.nkn-logo-svg,.nkn-wordmark{transition-duration:.001s !important;transition-delay:0s !important;}',
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
    '<symbol id="nkn-logo-sym" viewBox="-2 -2 101.2 133">' +
    /* gold outline: two ears + head, stroke-only, thickness from --nkn-logo-weight */
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="stroke-width:var(--nkn-logo-weight,8)">' +
      '<path d="M23 56C14 44 8 29 7.5 15C7.3 7 12 3.7 17.5 3.7C24 4 30 12 34 24C37 33 38.5 42 38.2 50.5"/>' +
      '<path d="M74.2 56C83.2 44 89.2 29 89.7 15C89.9 7 85.2 3.7 79.7 3.7C73.2 4 67.2 12 63.2 24C60.2 33 58.7 42 59 50.5"/>' +
      '<ellipse cx="48.6" cy="86.5" rx="43.2" ry="37"/>' +
    '</g>' +
    /* face: obsidian in light mode, white in dark mode (--nkn-logo-primary) */
    '<ellipse cx="31.8" cy="76.7" rx="5" ry="5.6"/>' +
    '<ellipse cx="66" cy="76.7" rx="5" ry="5.6"/>' +
    '<path d="M42.6 84.6C42.6 83.7 45.5 83.2 48.6 83.2C51.7 83.2 54.6 83.7 54.6 84.6C54.2 87.2 51.5 89.2 48.6 90.2C45.7 89.2 43 87.2 42.6 84.6Z"/>' +
    '<path d="M48.6 89.5V96.5M48.6 96.5C46 99.4 42.6 100.4 39.6 99.5C37.6 98.9 36.2 97.4 35.9 95.6M48.6 96.5C51.2 99.4 54.6 100.4 57.6 99.5C59.6 98.9 61 97.4 61.3 95.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="stroke:var(--nkn-logo-primary)"/>' +
    '</symbol></svg>';
  function logoHtml(extra) {
    return '<a class="nkn-logo"' + (extra || '') + ' href="' + esc(CONFIG.logoHref) + '" aria-label="NIKORA home">' +
      '<svg class="nkn-logo-svg" viewBox="-2 -2 101.2 133" width="101.2" height="133" aria-hidden="true" focusable="false"><use href="#nkn-logo-sym" width="100%" height="100%"></use></svg>' +
      (CONFIG.logoWordmark ? '<span class="nkn-wordmark" aria-hidden="true"><span class="nkn-nik">NIK</span><span class="nkn-ora">ORA</span></span>' : '') + '</a>';
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
        '<nav class="nkn-primary" aria-label="Primary">' + links + '<span class=\"nkn-ind-track\" aria-hidden=\"true\"><span class=\"nkn-ind\"></span></span></nav>' +
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

  /* Footer wave: three stacked, hand-drawn crests in one 1440 x 120 box. Asymmetric on purpose: high on the left (behind the brand block),
     a long soft dip under the middle link columns, a gentler lift on the right. The front crest is also used (normalised to 0..1) as the clip-path of the
     frosted-glass strip, so the glass follows the exact same curve; the two back crests are translucent gold tints that fade out downward. */
  var WAVE = {
    front: 'M0,40 C90,10 200,2 330,20 C470,40 560,80 740,86 C900,92 1020,70 1130,58 C1260,44 1350,40 1440,56',
    mid:   'M0,32 C100,8 215,2 345,16 C490,32 585,74 760,80 C925,86 1030,62 1145,50 C1270,38 1355,34 1440,48',
    back:  'M0,24 C110,2 230,-2 360,14 C510,34 600,70 780,76 C940,82 1040,56 1160,46 C1280,36 1360,32 1440,42'
  };
  function waveNorm(edge) { var i = 0; return edge.replace(/-?\d+(\.\d+)?/g, function (n) { return (+n / (i++ % 2 ? 120 : 1440)).toFixed(4); }); }
  /* Extends a crest 80 units beyond both ends along its own end tangents (no kink), so a layer can drift sideways without showing its ends. */
  function waveExt(edge) {
    var n = edge.match(/-?\d+(?:\.\d+)?/g).map(Number), L = n.length;
    var yl = n[1] - (n[3] - n[1]) / (n[2] - n[0]) * 80, yr = n[L - 1] + (n[L - 1] - n[L - 3]) / (n[L - 2] - n[L - 4]) * 80;
    return 'M-80,' + yl.toFixed(1) + ' L' + edge.slice(1) + ' L1520,' + yr.toFixed(1);
  }
  function waveGrad(id, v) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" style="stop-color:rgb(var(--nkn-f-gold));stop-opacity:var(' + v + ')"/>' +
      '<stop offset="1" style="stop-color:rgb(var(--nkn-f-gold));stop-opacity:0"/></linearGradient>';
  }
  function waveHtml() {
    var down = ' V120 H-80 Z', back = waveExt(WAVE.back), mid = waveExt(WAVE.mid);
    function layer(cls, grad, v, d, edgeCls) {      /* one animated layer = one <svg>, so transform/opacity animate on the GPU */
      return '<svg class="nkn-f-wave nkn-f-layer ' + cls + '" viewBox="-80 0 1600 120" preserveAspectRatio="none" focusable="false">' +
        '<defs>' + waveGrad(grad, v) + '</defs><path d="' + d + down + '" fill="url(#' + grad + ')"/><path class="nkn-we ' + edgeCls + '" d="' + d + '"/></svg>';
    }
    return '<div class="nkn-f-deco" aria-hidden="true">' +
      '<span class="nkn-f-glow nkn-f-glow-a"></span><span class="nkn-f-glow nkn-f-glow-b"></span>' +
      '<div class="nkn-f-glass-wave"></div><div class="nkn-f-glass"></div>' +
      layer('nkn-f-layer-a', 'nkn-wg-a', '--nkn-wave-a', back, 'nkn-we-a') +
      layer('nkn-f-layer-b', 'nkn-wg-b', '--nkn-wave-b', mid, 'nkn-we-b') +
      '<svg class="nkn-f-wave nkn-f-front" viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false">' +
        '<defs><clipPath id="nkn-wave-clip" clipPathUnits="objectBoundingBox"><path d="' + waveNorm(WAVE.front) + ' V1 H0 Z"/></clipPath></defs>' +
        '<path class="nkn-we nkn-we-f" d="' + WAVE.front + '"/></svg>' +
    '</div>';
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

    return waveHtml() + '<div class="nkn-f-wrap">' +
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
    /* brand fonts for the NIKORA wordmark (Playfair Display, Cormorant Garamond as fallback); system serif is used until they load */
    if (!document.getElementById('nkn-fonts')) {
      var fl = document.createElement('link');
      fl.id = 'nkn-fonts'; fl.rel = 'stylesheet';
      fl.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;1,500&family=Cormorant+Garamond:ital,wght@0,600;1,500&display=swap';
      (document.head || document.documentElement).appendChild(fl);
    }
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
    loadAnimations();
    bindPromo();
    startSite();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFooter); else mountFooter();
    loadAssistant();
  }

  function watchFooterMotion(el) {                      /* animations run only while the footer is (nearly) on screen: saves battery and GPU on phones */
    if (el._nkWatch) return; el._nkWatch = true;
    if (!('IntersectionObserver' in window)) { el.classList.add('is-live'); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { el.classList.toggle('is-live', e.isIntersecting); });
    }, { rootMargin: '120px 0px' }).observe(el);
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
    watchFooterMotion(el);
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
  /* scroll reveal, radial theme transition, smooth <details> / FAQ: one stand-alone file, loaded from the same folder as nav.js */
  function loadAnimations() {
    if (window.NKAnimations || document.getElementById('nk-anim-loader') || document.querySelector('script[src*="animations.js"]')) return;
    var base = SELF_SRC ? SELF_SRC.replace(/[^\\/?#]*([?#].*)?$/, '') : '';
    var el = document.createElement('script');
    el.id = 'nk-anim-loader'; el.async = true; el.src = base + 'animations.js';
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
  function applyTheme(mode, origin) {
    function commit() {
      if (typeof window.setTheme === 'function') { window.setTheme(mode); }    /* page's own handler (also stores it) */
      else {
        document.documentElement.setAttribute('data-theme', mode);
        try { localStorage.setItem('theme', mode); } catch (e) {}
      }
      syncTheme();
    }
    /* radial "expanding sphere" transition lives in animations.js; without it the theme simply swaps */
    var A = window.NKAnimations;
    if (origin && mode !== themeNow() && A && typeof A.themeTransition === 'function') A.themeTransition(commit, origin, mode);
    else commit();
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
      var th = t.closest('[data-nkn-theme]'); if (th) { applyTheme(th.getAttribute('data-nkn-theme'), th); return; }
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

    var hdr = document.getElementById('nkn-header'), ticking = false;           /* floating header: stronger glass once the page scrolls */
    function paintScroll() { ticking = false; if (hdr) hdr.classList.toggle('is-scrolled', (window.pageYOffset || document.documentElement.scrollTop || 0) > 8); }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(paintScroll); } }, { passive: true });
    paintScroll();

    var pNav = document.querySelector('#nkn-header .nkn-primary'), pInd = pNav && pNav.querySelector('.nkn-ind');
    if (pNav && pInd) indicatorApi = initIndicator(pNav, pInd);
  }

  /* ======================================================================
   * 7b. LIQUID BELL-CURVE INDICATOR
   * An SVG hill melted into the header's bottom edge, centred under the current page's link; it previews the hovered / focused link.
   * Position comes from the link itself (offsetLeft + offsetWidth / 2 inside .nkn-primary), so it is exact for any label, font or breakpoint, and it only
   * travels along the links wrapper (Home .. Contact).
   * Moving: the hill stretches into a low, wide liquid ripple that leans the way it travels (scaleY ~.3, much wider, slight skewX), then contracts back into the
   * soft bell on the target link with cubic-bezier(.68,-.55,.26,1.55).
   * ====================================================================== */
  var SPRING = 'cubic-bezier(.68,-.55,.26,1.55)';
  var BELL_W = 60;                                       /* resting width of the bell incl. its flared base, px */
  var BELL_PAD = 34;                                     /* the clipping strip reaches this far past the wrapper so the flared tails and glow are not cut at Home / Contact */
  var BELL_PATH = 'M0,16 C17,16 25,14.4 32,8.8 C38.5,3.6 43,0 50,0 C57,0 61.5,3.6 68,8.8 C75,14.4 83,16 100,16 Z';   /* bell: horizontal tangent at both base ends, crest at the centre */
  var BELL_SVG = '<svg viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs>' +
    '<linearGradient id="nkn-bell-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4DCA8"/><stop offset=".45" stop-color="#C89B54"/><stop offset="1" stop-color="#C89B54" stop-opacity=".9"/></linearGradient>' +
    '<linearGradient id="nkn-bell-h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".2" stop-color="#fff" stop-opacity=".85"/><stop offset=".5" stop-color="#fff"/><stop offset=".8" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<mask id="nkn-bell-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="16"><rect width="100" height="16" fill="url(#nkn-bell-h)"/></mask></defs>' +
    '<path d="' + BELL_PATH + '" fill="url(#nkn-bell-v)" mask="url(#nkn-bell-m)"/></svg>';   /* the mask fades the flared tails to nothing, so the base melts into the edge */
  var indicatorApi = null;

  function initIndicator(nav, ind) {
    var track = ind.parentNode, hdr = document.getElementById('nkn-header');
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var canAnimate = typeof ind.animate === 'function';
    var anim = null, placed = false, hovered = null, raf = 0;
    ind.insertAdjacentHTML('afterbegin', BELL_SVG);
    track.style.left = track.style.right = (-BELL_PAD) + 'px';
    ind.style.left = BELL_PAD + 'px';                    /* so translateX(x) is measured from the wrapper's left edge */

    function tf(x, sy, sk) { return 'translateX(' + x + 'px) scaleY(' + sy + ') skewX(' + (sk || 0) + 'deg)'; }
    function currentLink() { return nav.querySelector('.nkn-link[aria-current="page"]') || nav.querySelector('.nkn-link.is-current'); }
    function domeFor(link) {                             /* the bell's crest is centred exactly on the link's centre */
      return { x: link.offsetLeft + link.offsetWidth / 2 - BELL_W / 2, w: BELL_W };
    }
    function layout() {                                  /* put the strip on the header's bottom edge, whatever the header / nav heights are */
      if (hdr) track.style.bottom = (-(hdr.getBoundingClientRect().bottom - nav.getBoundingClientRect().bottom)) + 'px';
    }
    function where() {                                   /* the dome as it is drawn right now (also mid-animation) */
      try {
        var cs = getComputedStyle(ind), m = cs.transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(cs.transform);
        return { x: m.m41, w: parseFloat(cs.width) || 0 };
      } catch (e) {
        var r = ind.getBoundingClientRect(), n = nav.getBoundingClientRect();
        return { x: r.left - n.left - BELL_PAD, w: r.width };
      }
    }
    function stop() { if (anim) { anim.cancel(); anim = null; } }
    function put(t) { ind.style.transform = tf(t.x, 1, 0); ind.style.width = t.w + 'px'; }
    function hide() { stop(); placed = false; ind.classList.remove('is-on', 'is-fx'); }

    function moveTo(link, animate) {
      if (!link || !nav.offsetWidth) { hide(); return; }          /* no active link, or the bar is collapsed into the burger */
      layout();
      var t = domeFor(link);
      if (!placed || !animate || reduce.matches) {
        stop(); put(t); placed = true; ind.classList.add('is-on');
        if (!canAnimate) window.requestAnimationFrame(function () { ind.classList.add('is-fx'); });
        return;
      }
      var f = where();
      if (Math.abs(f.x - t.x) < .5 && Math.abs(f.w - t.w) < .5) return;
      if (!canAnimate) { put(t); return; }                          /* CSS spring fallback (.is-fx) */
      stop();
      put(t);                                                       /* final state is already in place, so the animation needs no fill */
      /* Mid-flight shape: a low liquid ripple. Wider than the bell by 90% of the distance (max 120px), centred 45% of the way to the target,
         kept within the links wrapper (+ the tail margin), squashed to 30% height and leaning (skewX) in the direction of travel. */
      var span = nav.offsetWidth, dist = Math.abs(t.x - f.x), dir = t.x >= f.x ? 1 : -1;
      var sw = Math.min(span + BELL_PAD, Math.max(f.w, t.w) + Math.min(dist * 0.9, 120));
      var mc = (f.x + f.w / 2) + ((t.x + t.w / 2) - (f.x + f.w / 2)) * 0.45;
      var left = Math.max(-BELL_PAD, Math.min(span + BELL_PAD - sw, mc - sw / 2));
      var dur = Math.round(Math.min(760, 440 + dist * 1.1));
      anim = ind.animate([
        { transform: tf(f.x, 1, 0),            width: f.w + 'px', easing: 'cubic-bezier(.4,0,.2,1)' },     /* flatten + stretch into a ripple */
        { transform: tf(left, .3, dir * 10),   width: sw + 'px',  easing: SPRING, offset: .38 },           /* contract back into the bell */
        { transform: tf(t.x, 1, 0),            width: t.w + 'px' }
      ], { duration: dur });
      var mine = anim;
      mine.onfinish = mine.oncancel = function () { if (anim === mine) anim = null; };
    }

    function target() { return hovered || currentLink(); }
    function sync(animate) { moveTo(target(), animate); }

    nav.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('.nkn-link'); if (a && nav.contains(a)) { hovered = a; sync(true); } });
    nav.addEventListener('mouseleave', function () { hovered = null; sync(true); });
    nav.addEventListener('focusin',  function (e) { var a = e.target.closest && e.target.closest('.nkn-link'); if (a) { hovered = a; sync(true); } });
    nav.addEventListener('focusout', function (e) { if (!e.relatedTarget || !nav.contains(e.relatedTarget)) { hovered = null; sync(true); } });

    function later() { if (!raf) raf = window.requestAnimationFrame(function () { raf = 0; sync(false); }); }
    if (window.ResizeObserver) { var ro = new ResizeObserver(later); ro.observe(nav); if (hdr) ro.observe(hdr); }   /* breakpoints, font loading, label / header height changes */
    window.addEventListener('resize', later);
    window.addEventListener('load', later);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);

    /* route change without a page load (back/forward, hash links, or NikoraNav.setRoute()): re-evaluate which link is current */
    function reflectRoute() {
      CURRENT = fileOf(location.pathname);
      Array.prototype.forEach.call(nav.querySelectorAll('.nkn-link'), function (a) {
        var st = state(a.getAttribute('href'));
        a.classList.toggle('is-current', !!st);
        if (st === 'page') a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      sync(true);
    }
    window.addEventListener('popstate', reflectRoute);
    window.addEventListener('hashchange', reflectRoute);

    sync(false);                                                  /* first paint: placed directly, no flight from the left edge */
    return { sync: sync, reflectRoute: reflectRoute };
  }

  /* ======================================================================
   * 8. PUBLIC API
   * ====================================================================== */
  window.NikoraNav = { openMenu: openMenu, closeMenu: closeMenu, config: CONFIG, refreshSiteContent: fetchSite,
    refreshIndicator: function () { if (indicatorApi) indicatorApi.sync(true); },
    setRoute: function () { if (indicatorApi) indicatorApi.reflectRoute(); } };
  /* legacy global names used by older page code (pages' own definitions may delegate to these) */
  if (typeof window.openMobileMenu !== 'function')  window.openMobileMenu = openMenu;
  if (typeof window.closeMobileMenu !== 'function') window.closeMobileMenu = closeMenu;

  if (document.body || document.currentScript) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }
})();
