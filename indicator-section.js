/* ==== NIKORA header indicator (liquid bell-curve notch): ONLY the parts that changed in nav.js ====
 * 1) CSS: replace the old indicator rules (from the "Elastic DOME indicator" comment through .nkn-ind.is-fx) with block 1.
 * 2) JS: replace section "7b" (everything from its comment down to just before "8. PUBLIC API") with block 2.
 * 3) The markup is unchanged: <span class="nkn-ind-track"><span class="nkn-ind"></span></span> stays the last child of <nav class="nkn-primary">;
 *    the SVG curve is injected into .nkn-ind by nav.js.
 */

/* ---------- 1) CSS ---------- */
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

/* ---------- 2) JS ---------- */
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

