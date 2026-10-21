/* ==== NIKORA header indicator (dome): ONLY the parts that changed in nav.js ====
 * 1) CSS: replace the old indicator rules (from the "Elastic pill indicator" comment through .nkn-ind.is-fx) with block 1.
 *    Also set the .nkn-link padding back to  padding:6px 0  (the pill needed 9px at the bottom, the dome does not).
 * 2) JS: replace section "7b" (everything from its comment down to just before "8. PUBLIC API") with block 2.
 * 3) The markup is unchanged: <span class="nkn-ind-track"><span class="nkn-ind"></span></span> stays the last child of <nav class="nkn-primary">.
 */

/* ---------- 1) CSS ---------- */
  /* Elastic DOME indicator: a flattened semi-circle rising from the header's bottom edge, centred under the active link.
     .nkn-ind-track = a strip along the header's bottom edge, exactly as wide as the links wrapper (Home .. Contact, +10px so the glow is not cut) that clips the dome;
     nav.js sets its bottom/left/right and the dome's transform + width (px, from the link's offsetLeft / offsetWidth), and runs the squish-and-stretch keyframes.
     Dome = semi-ellipse (flat bottom, round top), 7px tall, translucent gold #C89B54 with a soft glow above it. Colours are fixed brand gold with translucent highlights, so both themes work. */
  '.nkn-primary{--nkn-dome-h:7px;position:relative;}',
  '.nkn-ind-track{position:absolute;left:0;right:0;bottom:0;height:22px;overflow:hidden;pointer-events:none;}',
  '.nkn-ind{position:absolute;left:0;top:0;width:0;height:100%;opacity:0;transform-origin:50% 100%;will-change:transform,width;transition:opacity .25s ease;}',
  '.nkn-ind::before{content:"";position:absolute;left:-10px;right:-10px;bottom:0;height:100%;background:radial-gradient(ellipse 50% 100% at 50% 100%,rgba(200,155,84,.5),rgba(200,155,84,0));}',
  '.nkn-ind::after{content:"";position:absolute;left:0;right:0;bottom:0;height:var(--nkn-dome-h);border-radius:50% 50% 0 0 / 100% 100% 0 0;',
  '  background:linear-gradient(180deg,rgba(255,244,214,.7),rgba(255,244,214,0) 70%),rgba(200,155,84,.92);box-shadow:0 0 10px rgba(200,155,84,.55);}',
  '.nkn-ind.is-on{opacity:1;}',
  '.nkn-ind.is-fx{transition:opacity .25s ease,transform .55s cubic-bezier(.68,-.55,.26,1.55),width .55s cubic-bezier(.68,-.55,.26,1.55);}',   /* only used when the Web Animations API is missing: plain spring, no squish */

/* ---------- 2) JS ---------- */
  /* ======================================================================
   * 7b. ELASTIC DOME INDICATOR
   * A flattened dome sitting on the header's bottom edge, centred under the current page's link; it previews the hovered / focused link.
   * Position comes from the link itself (offsetLeft + offsetWidth / 2 inside .nkn-primary), so it is exact for any label, font or breakpoint, and it can
   * only travel along the links wrapper (Home .. Contact).
   * Moving: the dome flattens into a low, stretched wave that leans the way it is travelling (scaleY ~.32, wider, skewX), then springs back into the compact
   * dome on the target link with cubic-bezier(.68,-.55,.26,1.55).
   * ====================================================================== */
  var SPRING = 'cubic-bezier(.68,-.55,.26,1.55)';
  var DOME_W = 36;                                       /* resting width of the dome, px */
  var DOME_PAD = 10;                                     /* the clipping strip reaches 10px past the wrapper so the glow is not cut at Home / Contact */
  var indicatorApi = null;

  function initIndicator(nav, ind) {
    var track = ind.parentNode, hdr = document.getElementById('nkn-header');
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    var canAnimate = typeof ind.animate === 'function';
    var anim = null, placed = false, hovered = null, raf = 0;
    track.style.left = track.style.right = (-DOME_PAD) + 'px';
    ind.style.left = DOME_PAD + 'px';                    /* so translateX(x) is measured from the wrapper's left edge */

    function tf(x, sy, sk) { return 'translateX(' + x + 'px) scaleY(' + sy + ') skewX(' + (sk || 0) + 'deg)'; }
    function currentLink() { return nav.querySelector('.nkn-link[aria-current="page"]') || nav.querySelector('.nkn-link.is-current'); }
    function domeFor(link) {                             /* centred on the link's centre, kept inside the wrapper */
      var span = nav.offsetWidth, c = link.offsetLeft + link.offsetWidth / 2;
      return { x: Math.max(0, Math.min(span - DOME_W, c - DOME_W / 2)), w: DOME_W };
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
        return { x: r.left - n.left - DOME_PAD, w: r.width };
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
      /* Mid-flight shape: a low, stretched wave. Wider than the dome by 60% of the distance (max 70px), centred 45% of the way to the target,
         clamped to the links wrapper, squashed to 32% height and leaning (skewX) in the direction of travel. */
      var span = nav.offsetWidth, dist = Math.abs(t.x - f.x), dir = t.x >= f.x ? 1 : -1;
      var sw = Math.min(span, Math.max(f.w, t.w) + Math.min(dist * 0.6, 70));
      var mc = (f.x + f.w / 2) + ((t.x + t.w / 2) - (f.x + f.w / 2)) * 0.45;
      var left = Math.max(0, Math.min(span - sw, mc - sw / 2));
      var dur = Math.round(Math.min(760, 440 + dist * 1.1));
      anim = ind.animate([
        { transform: tf(f.x, 1, 0),            width: f.w + 'px', easing: 'cubic-bezier(.4,0,.2,1)' },     /* flatten + stretch */
        { transform: tf(left, .32, dir * 16),  width: sw + 'px',  easing: SPRING, offset: .38 },           /* spring back into the dome */
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
