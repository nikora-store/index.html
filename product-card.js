/* NIKORA shared product card: ONE template + ONE stylesheet, loaded by index.html AND catalog.html,
   so both pages render identical cards. Change the look here and it changes everywhere.
   Needs window.NKBestsellers (bestsellers.js) at render time: badges(), imagesOf(), thumbsHtml().
   Usage:  NKCard.html(product, { addAttr: 'data-bs-add' })   // addAttr = the attribute the page's click handler listens for */
(function(){
  'use strict';
  var CSS = [
  '.glass-card.nk-card{position:relative;display:flex;flex-direction:column;height:100%;padding:0;overflow:hidden;border-radius:20px;',
  ' background:var(--card-bg);border:1px solid var(--card-border);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);',
  ' box-shadow:var(--shadow-ambient);transform-style:flat;will-change:transform;transition:transform .15s ease-out,box-shadow .3s ease,border-color .3s ease}',
  '.glass-card.nk-card::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .3s ease;',
  ' background:radial-gradient(320px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(255,255,255,.35),transparent 70%)}',
  '[data-theme="dark"] .glass-card.nk-card::after{background:radial-gradient(320px circle at var(--mouse-x,50%) var(--mouse-y,50%),rgba(255,255,255,.12),transparent 70%)}',
  '.glass-card.nk-card:hover{border-color:rgba(var(--gold-rgb,200,155,84),.45);box-shadow:0 26px 60px -22px rgba(var(--gold-rgb,200,155,84),.4),0 12px 32px -14px rgba(0,0,0,.3)}',
  '.glass-card.nk-card:hover::after{opacity:1}',
  '.nk-card .nk-media{position:relative;display:block;aspect-ratio:1/1;overflow:hidden;background:var(--surface-tint,rgba(128,128,128,.07))}',
  '.nk-card .nk-media img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s cubic-bezier(.2,.8,.2,1),opacity .2s ease}',
  '.nk-card:hover .nk-media img{transform:scale(1.06)}',
  '.nk-card .nk-badges{position:absolute;top:10px;left:10px;z-index:2;display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
  '.nk-card .nk-badge{font-size:10px;font-weight:700;letter-spacing:.05em;line-height:1.2;text-transform:uppercase;padding:5px 10px;border-radius:100px;white-space:nowrap}',
  '.nk-card .nk-badge.best{background:var(--gold);color:#241c0f}',
  '.nk-card .nk-badge.sale{background:var(--rose);color:#fff}',
  '.nk-card .nk-badge.low{background:#e11d48;color:#fff;animation:nkBadgeFlash 1.2s ease-in-out infinite}',
  '.nk-card .nk-badge.out{background:#2a2a30;color:#f7f4f0;border:1px solid rgba(255,255,255,.18)}',
  '.nk-card .nk-urgency{display:flex;align-items:center;gap:7px;margin:-6px 0 12px;font-size:12px;font-weight:700;line-height:1.3;color:#e11d48}',
  '[data-theme="dark"] .nk-card .nk-urgency{color:#ff6b86}',
  '.nk-card .nk-urgency::before{content:"";flex:none;width:7px;height:7px;border-radius:50%;background:currentColor;animation:nkBadgeFlash 1.2s ease-in-out infinite}',
  '.nk-card.is-soldout .nk-media img{filter:grayscale(.85);opacity:.7}',
  '.nk-card .nk-add[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}',
  '.nk-card .nk-add[disabled]:hover{background:transparent;color:var(--gold);box-shadow:none}',
  '@keyframes nkBadgeFlash{0%,100%{opacity:1}50%{opacity:.45}}',
  '.nk-card .bs-thumbs{display:flex;gap:6px;margin:0;padding:10px 18px 0}',
  '.nk-card .bs-thumb{width:38px;height:38px;border-radius:9px;border:1px solid var(--card-border)}',
  '.nk-card .nk-body{display:flex;flex-direction:column;flex:1;padding:16px 18px 18px}',
  '.nk-card .nk-cat{margin:0 0 6px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint)}',
  '.nk-card .nk-title{margin:0 0 6px;font-family:"Playfair Display",serif;font-size:17px;font-weight:500;line-height:1.3;color:var(--text)}',
  '.nk-card .nk-title a{color:inherit;text-decoration:none;transition:color .2s ease}',
  '.nk-card .nk-title a:hover{color:var(--gold)}',
  '.nk-card .nk-desc{margin:0 0 12px;flex-grow:1;font-size:12.5px;line-height:1.55;color:var(--text-soft);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
  '.nk-card .nk-grow{flex-grow:1}',
  '.nk-card .nk-price-row{display:flex;align-items:baseline;gap:8px;margin:0 0 14px}',
  '.nk-card .nk-price{font-size:17px;font-weight:700;color:var(--gold)}',
  '.nk-card .nk-was{font-size:12.5px;color:var(--text-soft);opacity:.5;text-decoration:line-through}',
  '.nk-card .nk-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 14px;border-radius:100px;border:1px solid var(--gold);',
  ' background:transparent;color:var(--gold);font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.03em;cursor:pointer;',
  ' transition:background .2s ease,color .2s ease,box-shadow .2s ease}',
  '.nk-card .nk-add:hover{background:var(--gold);color:#241c0f;box-shadow:0 8px 22px -8px rgba(var(--gold-rgb,200,155,84),.6)}',
  '.nk-card .nk-add:focus-visible{outline:2px solid var(--gold);outline-offset:3px}',
  '.nk-card .nk-add svg{width:15px;height:15px;fill:none;stroke:currentColor}',
  '@media (prefers-reduced-motion:reduce){.nk-card .nk-badge.low,.nk-card .nk-urgency::before{animation:none}.nk-card .nk-media img{transition:none}}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'nk-card-css'; st.textContent = CSS; document.head.appendChild(st);

  var ICON = '<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/><path d="M14 9v4M12 11h4"/></svg>';
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function html(p, o){
    o = o || {};
    var B = window.NKBestsellers, id = esc(p.id), name = esc(p.name);
    var price = Number(p.price) || 0, was = Number(p.oldPrice) || 0, sale = was > price;
    var href = 'product.html?id=' + encodeURIComponent(p.id);
    var sl = window.NKShipping && NKShipping.cardLine(p.id), shipLine = sl ? '<div class="nk-ship">' + esc(sl) + '</div>' : '';   /* supplier-based estimate (shipping-rules.js) */
    var main = B.imagesOf(p)[0];                       /* the product's Firebase photo, or the branded placeholder (never lib/products.js) */
    var badges = B.badges(p).map(function(t){ return '<span class="nk-badge best">' + esc(t) + '</span>'; }).join('');
    if(sale) badges += '<span class="nk-badge sale">Save $' + (was - price).toFixed(2) + '</span>';
    var st = B.stockOf ? B.stockOf(p) : { state: p.lowStock === true ? 'low' : 'in', left: null, label: 'Low stock' };   /* urgency comes from the product's real stock fields (bestsellers.js stockOf) */
    if(st.state === 'out') badges += '<span class="nk-badge out">Sold out</span>';
    else if(st.state === 'low') badges += '<span class="nk-badge low">Low Stock</span>';
    var urgency = st.state === 'low' ? '<div class="nk-urgency" role="status">' + esc(st.label) + '</div>' : '';
    return '<article class="glass-card product-card nk-card' + (st.state === 'out' ? ' is-soldout' : '') + '" data-bs-card data-bs-id="' + id + '" data-product-id="' + id + '">' +
      '<a class="nk-media" href="' + href + '" aria-label="' + name + '">' +
        (badges ? '<span class="nk-badges">' + badges + '</span>' : '') +
        '<img data-bs-main data-bs-src0="' + esc(main) + '" src="' + esc(main) + '" alt="' + name + '" loading="lazy" onerror="window.NKImgFail&amp;&amp;NKImgFail(this)">' +
      '</a>' +
      B.thumbsHtml(p) +
      '<div class="nk-body">' +
        '<div class="nk-cat">' + esc(p.category || '') + '</div>' +
        '<h3 class="nk-title"><a href="' + href + '">' + name + '</a></h3>' +
        (p.desc ? '<p class="nk-desc">' + esc(p.desc) + '</p>' : '<div class="nk-grow"></div>') +
        '<div class="nk-price-row"><span class="nk-price">$' + price.toFixed(2) + '</span>' + (sale ? '<span class="nk-was">$' + was.toFixed(2) + '</span>' : '') + '</div>' +
        urgency +
        shipLine +
        (st.state === 'out'
          ? '<button type="button" class="nk-add" disabled aria-disabled="true">Sold out</button>'
          : '<button type="button" class="nk-add" ' + (o.addAttr || 'data-action="add-to-cart"') + ' data-id="' + id + '" data-name="' + name + '" data-price="' + price + '">' + ICON + 'Add to Cart</button>') +
      '</div></article>';
  }

  /* Hover: gold glow + spotlight follow the pointer, a gentle lift/tilt, and a small press. Mouse only; the CSS hover state still applies on touch. */
  var canTilt = window.matchMedia && matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches;
  var cur = null, pressed = false;
  function pose(c, rx, ry){ c.style.transform = 'perspective(1000px) translateY(-6px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) scale(' + (pressed ? 0.985 : 1) + ')'; }
  document.addEventListener('mousemove', function(e){
    var c = e.target.closest ? e.target.closest('.nk-card') : null;
    if(cur && cur !== c){ cur.style.transform = ''; pressed = false; }
    cur = c; if(!c) return;
    var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    c.style.setProperty('--mouse-x', (px * 100) + '%'); c.style.setProperty('--mouse-y', (py * 100) + '%');
    if(canTilt){ c._rx = -(py - 0.5) * 8; c._ry = (px - 0.5) * 8; pose(c, c._rx, c._ry); }
  });
  if(canTilt){
    document.addEventListener('mousedown', function(){ if(cur){ pressed = true; pose(cur, cur._rx || 0, cur._ry || 0); } });
    document.addEventListener('mouseup', function(){ if(cur && pressed){ pressed = false; pose(cur, cur._rx || 0, cur._ry || 0); } });
  }
  document.addEventListener('mouseleave', function(){ if(cur){ cur.style.transform = ''; cur = null; } });

  window.NKCard = { html: html };
})();
