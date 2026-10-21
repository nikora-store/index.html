/* ==== NIKORA footer: ONLY the parts that changed in nav.js (header untouched) ====
 * 1) CSS: replace the footer rules inside the CSS array (from the "footer:" comment down to just before .nkn-f-grid) with block 1.
 * 2) JS: replace the WAVE / waveHtml block above buildFooterHtml() with block 2 (buildFooterHtml still starts with: return waveHtml() + '<div class="nkn-f-wrap">' + ...).
 * 3) JS: add watchFooterMotion() (block 3) above mountFooter(), and call  watchFooterMotion(el);  right after swapMailLinks(); at the end of mountFooter().
 * 4) In the @media (max-width:480px) rule: .nkn-footer{padding-top:calc(var(--nkn-wave-h) + 22px);}
 */

/* ---------- 1) CSS ---------- */
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

/* ---------- 2) JS: wave builder ---------- */
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


/* ---------- 3) JS: pause motion when the footer is off screen ---------- */
  function watchFooterMotion(el) {                      /* animations run only while the footer is (nearly) on screen: saves battery and GPU on phones */
    if (el._nkWatch) return; el._nkWatch = true;
    if (!('IntersectionObserver' in window)) { el.classList.add('is-live'); return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { el.classList.toggle('is-live', e.isIntersecting); });
    }, { rootMargin: '120px 0px' }).observe(el);
  }
