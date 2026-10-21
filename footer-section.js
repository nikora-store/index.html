/* ==== NIKORA footer: ONLY the parts that changed in nav.js (header untouched) ====
 * 1) CSS: replace the old footer rules (.nkn-footer, .nkn-f-wrap and the 480px padding-top override) inside the CSS array with the block below.
 * 2) JS: add the WAVE block just above buildFooterHtml().
 * 3) In buildFooterHtml() change the return line to:  return waveHtml() + '<div class="nkn-f-wrap">' + ...
 * 4) In the @media (max-width:480px) rule change  .nkn-footer{padding-top:44px;}  to  .nkn-footer{padding-top:calc(var(--nkn-wave-h) + 22px);}
 */

/* ---------- 1) CSS (goes inside the CSS = [ ... ] array) ---------- */
  /* ---- footer: frosted glass with an asymmetric multi-layer wave top edge + two ambient glow orbs ----
     Structure (see waveHtml()): .nkn-f-deco (decor, aria-hidden) = 2 glow orbs, glass strip clipped to the wave, glass body, SVG wave layers; .nkn-f-wrap = the content on top.
     Gold is the fixed brand #C89B54 (--nkn-f-gold); everything else comes from the variables below, so both themes need no hardcoded white. */
  '.nkn-footer{--nkn-f-gold:200,155,84;--nkn-f-glow2:214,140,118;--nkn-wave-h:clamp(48px,8vw,112px);',
  '  --nkn-foot-bg:rgba(11,11,14,.045);--nkn-wave-a:.22;--nkn-wave-b:.14;--nkn-edge-a:.5;--nkn-edge-b:.26;--nkn-edge-c:.14;--nkn-glow-a:.2;--nkn-glow-b:.13;',
  '  position:relative;isolation:isolate;display:block;width:100%;max-width:none;margin:12px 0 0;padding:calc(var(--nkn-wave-h) + 34px) 0 28px;color:var(--nkn-text);font-family:inherit;}',
  ':root[data-theme="dark"] .nkn-footer{--nkn-foot-bg:rgba(11,11,14,.62);--nkn-wave-a:.2;--nkn-wave-b:.12;--nkn-edge-a:.42;--nkn-edge-b:.22;--nkn-edge-c:.12;--nkn-glow-a:.17;--nkn-glow-b:.11;}',
  '.nkn-f-deco{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}',
  '.nkn-f-glow{position:absolute;z-index:0;aspect-ratio:1;border-radius:50%;}',
  '.nkn-f-glow-a{left:-6%;top:0;width:clamp(260px,36vw,560px);background:radial-gradient(closest-side,rgba(var(--nkn-f-gold),var(--nkn-glow-a)),transparent);}',
  '.nkn-f-glow-b{right:-5%;bottom:0;width:clamp(220px,30vw,460px);background:radial-gradient(closest-side,rgba(var(--nkn-f-glow2),var(--nkn-glow-b)),transparent);}',
  '.nkn-f-glass-wave,.nkn-f-glass{position:absolute;left:0;right:0;z-index:1;background:var(--nkn-foot-bg);-webkit-backdrop-filter:blur(12px) saturate(140%);backdrop-filter:blur(12px) saturate(140%);}',
  '.nkn-f-glass-wave{top:0;height:var(--nkn-wave-h);-webkit-clip-path:url(#nkn-wave-clip);clip-path:url(#nkn-wave-clip);}',
  '.nkn-f-glass{top:var(--nkn-wave-h);bottom:0;}',
  '.nkn-f-wave{position:absolute;left:0;top:0;z-index:2;display:block;width:100%;height:var(--nkn-wave-h);overflow:hidden;}',
  '.nkn-f-wave .nkn-we{fill:none;vector-effect:non-scaling-stroke;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;}',
  '.nkn-f-wave .nkn-we-a{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-c));}',
  '.nkn-f-wave .nkn-we-b{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-b));}',
  '.nkn-f-wave .nkn-we-f{stroke:rgba(var(--nkn-f-gold),var(--nkn-edge-a));}',
  '.nkn-f-wrap{position:relative;z-index:3;max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px);}',

/* ---------- 2) JS (goes above function buildFooterHtml) ---------- */
  /* Footer wave: three stacked, hand-drawn crests in one 1440 x 120 box. Asymmetric on purpose: high on the left (behind the brand block),
     a long soft dip under the middle link columns, a gentler lift on the right. The front crest is also used (normalised to 0..1) as the clip-path of the
     frosted-glass strip, so the glass follows the exact same curve; the two back crests are translucent gold tints that fade out downward. */
  var WAVE = {
    front: 'M0,40 C90,10 200,2 330,20 C470,40 560,80 740,86 C900,92 1020,70 1130,58 C1260,44 1350,40 1440,56',
    mid:   'M0,32 C100,8 215,2 345,16 C490,32 585,74 760,80 C925,86 1030,62 1145,50 C1270,38 1355,34 1440,48',
    back:  'M0,24 C110,2 230,-2 360,14 C510,34 600,70 780,76 C940,82 1040,56 1160,46 C1280,36 1360,32 1440,42'
  };
  function waveNorm(edge) { var i = 0; return edge.replace(/-?\d+(\.\d+)?/g, function (n) { return (+n / (i++ % 2 ? 120 : 1440)).toFixed(4); }); }
  function waveGrad(id, v) {
    return '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" style="stop-color:rgb(var(--nkn-f-gold));stop-opacity:var(' + v + ')"/>' +
      '<stop offset="1" style="stop-color:rgb(var(--nkn-f-gold));stop-opacity:0"/></linearGradient>';
  }
  function waveHtml() {
    var down = ' V120 H0 Z';
    return '<div class="nkn-f-deco" aria-hidden="true">' +
      '<span class="nkn-f-glow nkn-f-glow-a"></span><span class="nkn-f-glow nkn-f-glow-b"></span>' +
      '<div class="nkn-f-glass-wave"></div><div class="nkn-f-glass"></div>' +
      '<svg class="nkn-f-wave" viewBox="0 0 1440 120" preserveAspectRatio="none" focusable="false">' +
        '<defs>' + waveGrad('nkn-wg-a', '--nkn-wave-a') + waveGrad('nkn-wg-b', '--nkn-wave-b') +
        '<clipPath id="nkn-wave-clip" clipPathUnits="objectBoundingBox"><path d="' + waveNorm(WAVE.front) + ' V1 H0 Z"/></clipPath></defs>' +
        '<path d="' + WAVE.back + down + '" fill="url(#nkn-wg-a)"/><path class="nkn-we nkn-we-a" d="' + WAVE.back + '"/>' +
        '<path d="' + WAVE.mid + down + '" fill="url(#nkn-wg-b)"/><path class="nkn-we nkn-we-b" d="' + WAVE.mid + '"/>' +
        '<path class="nkn-we nkn-we-f" d="' + WAVE.front + '"/>' +
      '</svg></div>';
  }

