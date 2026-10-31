/**
 * NIKORA animations.js  -  one stand-alone module for every page (no dependencies).
 *
 *   1. SCROLL REVEAL      .reveal elements get the class `in` as they scroll into view (the pages' own CSS does the fade + slide);
 *                         cards that have no .reveal class (Firebase product grids, review cards, ...) fade + slide up with the Web Animations API.
 *   2. RADIAL THEME       NKAnimations.themeTransition(commit, originEl, mode): the new theme grows as a circle out of the Sun / Moon button
 *                         (View Transitions API + clip-path; a colour veil is the fallback). nav.js calls it from its theme buttons.
 *   3. SMOOTH COLLAPSE    <details> (height + fade, 280 ms), panels toggled with the `hidden` attribute (aria-controls + aria-expanded buttons,
 *                         e.g. the science mechanism cards), and fast FAQ / accordion CSS (.faq-item, .accordion-item).
 *   4. ICON CENTERING     the SVG inside .gb-ico / .step-ico / .cover-ico gets its viewBox shifted so its drawing is centred in the tile.
 *
 * Loading: nav.js loads this file from its own folder on every page. You can also add <script src="animations.js" defer></script> to a page's <head>
 * to start the effects a little earlier; it never runs twice.
 * Opt out per element: data-nk-noreveal (reveal), data-nk-native (<details> / hidden panels). Opt in any element to the card reveal: data-nk-reveal.
 * Everything is skipped for prefers-reduced-motion, and every feature switches itself off when its browser API is missing.
 */
(function () {
  'use strict';
  if (window.NKAnimations) return;

  var doc = document, root = doc.documentElement;
  var EASE = 'cubic-bezier(.4,0,.2,1)', OUT = 'cubic-bezier(.2,.8,.2,1)';
  var mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var CAN_ANIMATE = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  function reduced() { return !!mq.matches; }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ====================================================================== 0. CSS */
  var CSS = [
    /* radial theme transition: show old + new page without the browser's default cross-fade; the new page is revealed through a clip-path circle */
    '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal;}',
    '::view-transition-old(root){z-index:1;}::view-transition-new(root){z-index:2;}',
    'html.nk-theme-switching *,html.nk-theme-switching *::before,html.nk-theme-switching *::after{transition:none !important;}',
    '.nk-theme-veil{position:fixed;inset:0;z-index:2147483000;pointer-events:none;}',
    /* the pages' own .reveal (0.7 s) becomes a quicker 0.45 s */
    'html.js-on .reveal{transition-duration:.45s !important;}',
    /* FAQ + accordion panels: 280 ms height (grid / max-height) plus a fade; `html` raises the specificity above the page CSS */
    'html .faq-a{opacity:0;transition:grid-template-rows .28s ' + EASE + ',opacity .28s ease;}',
    'html .faq-item.open .faq-a{opacity:1;}',
    'html .faq-a>div{min-height:0;}',
    'html .accordion-panel{opacity:0;transition:max-height .28s ' + EASE + ',opacity .28s ease;}',
    'html .accordion-item.open .accordion-panel{opacity:1;}',
    '@media (prefers-reduced-motion:reduce){html .faq-a,html .accordion-panel{transition:none;}}'
  ].join('\n');
  function injectCss() {
    if (doc.getElementById('nk-anim-css')) return;
    var st = doc.createElement('style'); st.id = 'nk-anim-css'; st.textContent = CSS;
    (doc.head || root).appendChild(st);
  }

  /* ====================================================================== 1. SCROLL REVEAL */
  var CARD_SEL = '[data-nk-reveal],.glass-card,.nk-card,.product-card,.review-card,.benefits-card,.routine-box,.section-head,.section-title';
  var SKIP_SEL = '.reveal,[data-nk-noreveal],.nkn-header,.nkn-drawer,.nkn-footer,#cart-drawer,#cart-overlay,[role="dialog"],[aria-modal="true"],.modal,#nk-lightbox,.cart-rec-card';

  function byPosition(a, b) { return (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left); }
  function isHit(en) { return en.isIntersecting; }

  function initReveal() {
    var hasIO = 'IntersectionObserver' in window;
    var seen = (typeof WeakSet === 'function') ? new WeakSet() : { has: function () { return false; }, add: function () {} };

    /* --- (a) elements that carry .reveal: the page CSS hides them under html.js-on until they get `in` --- */
    function showReveal(el, i) {
      if (el.classList.contains('in')) return;
      if (i) { el.style.transitionDelay = Math.min(i, 5) * 45 + 'ms'; window.setTimeout(function () { el.style.transitionDelay = ''; }, 900); }
      el.classList.add('in');
    }
    var revealIO = hasIO ? new IntersectionObserver(function (entries) {
      entries.filter(isHit).sort(byPosition).forEach(function (en, i) { revealIO.unobserve(en.target); showReveal(en.target, i); });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }) : null;

    /* --- (b) cards without .reveal: below-the-fold ones are hidden, then fade + slide up (opacity + the independent `translate` property,
           so a card's own transitions and its hover-tilt transform are never touched) --- */
    var cardIO = (hasIO && CAN_ANIMATE) ? new IntersectionObserver(function (entries) {
      entries.filter(isHit).sort(byPosition).forEach(function (en, i) {
        var el = en.target; cardIO.unobserve(el);
        el.style.removeProperty('opacity'); el.style.removeProperty('translate');
        if (reduced()) return;
        el.animate([{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }],
          { duration: 420, delay: Math.min(i, 5) * 45, easing: OUT, fill: 'backwards' });
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }) : null;

    function consider(el) {
      if (!el.matches || seen.has(el)) return;
      if (el.matches('.reveal')) {
        seen.add(el);
        if (!revealIO || reduced()) showReveal(el, 0); else revealIO.observe(el);
        return;
      }
      if (!cardIO || !el.matches(CARD_SEL)) return;
      seen.add(el);
      if (el.closest(SKIP_SEL) || (el.parentElement && el.parentElement.closest(CARD_SEL))) return;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.top <= window.innerHeight * 0.98) return;           /* hidden, or already on screen: never hide it */
      if (window.getComputedStyle(el).position === 'fixed') return;
      el.style.opacity = '0'; el.style.translate = '0 18px';
      cardIO.observe(el);
    }
    function scan(node) {
      if (!node || node.nodeType !== 1) return;
      consider(node);
      each(node.querySelectorAll('.reveal,' + CARD_SEL), consider);
    }
    scan(doc.body);

    /* cards added later (Firebase grids, tabs, re-renders) */
    if (window.MutationObserver) {
      var queue = [], raf = 0;
      new MutationObserver(function (list) {
        list.forEach(function (m) { each(m.addedNodes, function (n) { if (n.nodeType === 1) queue.push(n); }); });
        if (queue.length && !raf) raf = window.requestAnimationFrame(function () { raf = 0; var q = queue; queue = []; q.forEach(scan); });
      }).observe(doc.body, { childList: true, subtree: true });
    }
    return scan;
  }

  /* ====================================================================== 2. RADIAL THEME TRANSITION */
  var themeBusy = false;
  /**
   * commit()  applies the theme (the page's setTheme / data-theme swap); it is always called exactly once.
   * origin    the clicked Sun / Moon button (the circle grows from its centre); mode 'light' | 'dark' (veil colour for the fallback).
   */
  function themeTransition(commit, origin, mode) {
    if (reduced() || themeBusy || !CAN_ANIMATE || !origin || !origin.getBoundingClientRect) { commit(); return; }
    var r = origin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    var vw = window.innerWidth, vh = window.innerHeight;
    var R = Math.ceil(Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y)));
    var from = 'circle(0px at ' + x + 'px ' + y + 'px)', to = 'circle(' + R + 'px at ' + x + 'px ' + y + 'px)';
    var DUR = 520;
    themeBusy = true; root.classList.add('nk-theme-switching');            /* no CSS transitions while the colours swap, so the circle's edge never shows half-blended colours */
    function done() { themeBusy = false; root.classList.remove('nk-theme-switching'); }

    if (typeof doc.startViewTransition === 'function') {
      var vt;
      try { vt = doc.startViewTransition(commit); } catch (e) { done(); commit(); return; }
      vt.ready.then(function () {
        root.animate({ clipPath: [from, to] }, { duration: DUR, easing: EASE, pseudoElement: '::view-transition-new(root)' });
      }, function () {});
      vt.finished.then(done, done);
      return;
    }
    /* fallback: a veil in the new theme's background colour grows from the button, the theme is swapped under it, then it fades away */
    var veil = doc.createElement('div');
    veil.className = 'nk-theme-veil';
    veil.style.background = mode === 'dark' ? '#0B0B0E' : '#F8F4F0';
    veil.style.clipPath = from;
    doc.body.appendChild(veil);
    var grow = veil.animate({ clipPath: [from, to] }, { duration: DUR, easing: EASE, fill: 'forwards' });
    function remove() { if (veil.parentNode) veil.parentNode.removeChild(veil); }
    grow.onfinish = function () {
      commit();
      var out = veil.animate({ opacity: [1, 0] }, { duration: 180, easing: 'ease-out', fill: 'forwards' });
      out.onfinish = function () { remove(); done(); };
    };
    grow.oncancel = function () { remove(); commit(); done(); };
  }

  /* ====================================================================== 3. SMOOTH COLLAPSE */
  var SLIDE_KEYS = ['height', 'paddingTop', 'paddingBottom', 'marginTop', 'marginBottom', 'borderTopWidth', 'borderBottomWidth'];
  /** Animates a rendered block from collapsed to its natural size (opening) or back (closing). Calls done() when finished. 280 ms. */
  function slide(el, opening, done) {
    var cs = window.getComputedStyle(el), full = { opacity: 1 }, zero = { opacity: 0 };
    SLIDE_KEYS.forEach(function (k) { full[k] = cs[k]; zero[k] = '0px'; });
    var prev = el.style.overflow; el.style.overflow = 'hidden';
    var a = el.animate(opening ? [zero, full] : [full, zero], { duration: 280, easing: EASE });
    a.onfinish = a.oncancel = function () { el.style.overflow = prev; if (done) done(); };
    return a;
  }

  function initCollapse() {
    /* --- <details>: height + content fade. Summaries that are not displayed (checkout summary on desktop) stay native. --- */
    doc.addEventListener('click', function (e) {
      var sum = e.target.closest && e.target.closest('summary');
      if (!sum) return;
      var d = sum.parentNode;
      if (!d || d.tagName !== 'DETAILS' || d.hasAttribute('data-nk-native') || !CAN_ANIMATE || reduced() || !sum.offsetHeight) return;
      e.preventDefault();
      if (d._nkAnim) d._nkAnim.cancel();
      var opening = !d.open, cs = window.getComputedStyle(d), startH = d.offsetHeight, endH;
      d.style.overflow = 'hidden';
      if (opening) { d.open = true; endH = d.offsetHeight; }
      else { endH = sum.getBoundingClientRect().bottom - d.getBoundingClientRect().top + (parseFloat(cs.paddingBottom) || 0) + (parseFloat(cs.borderBottomWidth) || 0); }
      var a = d.animate({ height: [startH + 'px', endH + 'px'] }, { duration: 280, easing: EASE });
      var kids = Array.prototype.filter.call(d.children, function (c) { return c !== sum; })
        .map(function (c) { return c.animate({ opacity: opening ? [0, 1] : [1, 0] }, { duration: 280, easing: 'ease', fill: 'both' }); });
      d._nkAnim = a;
      a.onfinish = a.oncancel = function () {
        kids.forEach(function (k) { k.cancel(); });
        if (d._nkAnim !== a) return;
        d._nkAnim = null; if (!opening) d.open = false; d.style.overflow = '';
      };
    });

    /* --- panels shown / hidden with the `hidden` attribute and controlled by an aria-expanded button (science mechanism cards, ...).
           The page's own code keeps toggling `hidden`; this observer plays the slide around it. Popups (absolute / fixed) and header / drawer panels are left alone. --- */
    if (!window.MutationObserver || !CAN_ANIMATE) return;
    function isPanel(el) {
      if (!el.id || el.hasAttribute('data-nk-native') || el.closest('.nkn-header,.nkn-drawer,#cart-drawer')) return false;
      var pos = window.getComputedStyle(el).position;
      if (pos === 'absolute' || pos === 'fixed') return false;
      return !!doc.querySelector('[aria-controls="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"][aria-expanded]');
    }
    new MutationObserver(function (list) {
      list.forEach(function (m) {
        var el = m.target;
        if (el._nkBusy || reduced() || !isPanel(el)) return;
        if (!el.hidden) { slide(el, true); return; }                       /* opening: the page just removed `hidden` */
        el._nkBusy = true; el.hidden = false;                              /* closing: show it again for one animation, then hide it for real (all before the next paint) */
        slide(el, false, function () { el.hidden = true; window.setTimeout(function () { el._nkBusy = false; }, 0); });
      });
    }).observe(doc.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  }

  /* ====================================================================== 4. ICON CENTERING */
  /** Shifts each icon's viewBox so the bounding box of its drawing is centred in the tile (the drawing is not touched, only the viewBox origin). */
  function centerIcons(scope) {
    each((scope || doc).querySelectorAll('.gb-ico svg,.step-ico svg,.cover-ico svg,[data-nk-center] svg'), function (svg) {
      try {
        if (svg.getAttribute('data-nk-centered')) return;
        var vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        if (vb.length !== 4 || vb.some(isNaN)) return;
        var b = svg.getBBox();
        if (!b.width || !b.height) return;                                   /* not rendered yet (hidden tab): left as drawn */
        var nx = b.x + b.width / 2 - vb[2] / 2, ny = b.y + b.height / 2 - vb[3] / 2;
        svg.setAttribute('data-nk-centered', '1');
        if (Math.abs(nx - vb[0]) < 0.05 && Math.abs(ny - vb[1]) < 0.05) return;
        svg.setAttribute('viewBox', nx.toFixed(2) + ' ' + ny.toFixed(2) + ' ' + vb[2] + ' ' + vb[3]);
      } catch (e) { /* getBBox can throw on display:none SVGs */ }
    });
  }

  /* ====================================================================== boot + public API */
  injectCss();
  var api = { version: '1.0', themeTransition: themeTransition, slide: slide, centerIcons: centerIcons, reveal: function () {} };
  window.NKAnimations = api;
  function start() {
    try { api.reveal = initReveal(); } catch (e) { if (window.console) console.warn('[animations] reveal off:', e); }
    try { initCollapse(); } catch (e) { if (window.console) console.warn('[animations] collapse off:', e); }
    centerIcons();
    window.addEventListener('load', function () { centerIcons(); });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
})();
