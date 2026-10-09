/*!
 * NIKORA Beauty Concierge  -  ai-assistant.js
 * ---------------------------------------------------------------------------
 * A standalone, dependency-free floating chat widget. nav.js loads it on every
 * page; it can also be used alone:  <script src="ai-assistant.js" defer></script>
 *
 *  - Floating champagne-glow toggle (bottom-right) with a custom SVG sparkle icon
 *  - Glassmorphic slide-up chat panel, light / dark via <html data-theme>
 *    (follows nav.js / the page; the header button switches it and stores
 *     localStorage 'theme', exactly like the site's own theme switcher)
 *  - Rich replies: bold, bullet lists, [inline links] and link buttons
 *    (track-order.html, returns.html, mailto:nikora.support@gmail.com ...)
 *  - Quick-reply chips, typing indicator, per-tab chat history (sessionStorage)
 *  - Client-side knowledge engine built from the site's own policies, used
 *    whenever no live AI endpoint is configured (or the endpoint fails)
 *
 * CONNECTING A LIVE MODEL LATER (optional)
 *   Never put an API key in browser code. Point the widget at YOUR server-side
 *   proxy (a Cloud Function, etc.) before this script runs:
 *       window.NIKORA_AI_CONFIG = { endpoint: 'https://your-proxy.example/concierge' };
 *   The widget POSTs  { messages:[{role,content}...], page }  and expects JSON
 *   { reply: "text" }  (a { content:[{text}] } shape is also accepted).
 *   On any error or timeout it silently falls back to the local engine.
 *
 * Public API: window.NikoraAssistant = { open, close, toggle, send, reset }
 * All CSS is namespaced .nkai-* so it cannot clash with page styles.
 */
(function () {
  'use strict';
  if (window.NikoraAssistant) return;

  /* ======================================================================
   * 1. CONFIG
   * ====================================================================== */
  var CFG = {
    title: 'NIKORA Beauty Concierge',
    email: 'nikora.support@gmail.com',
    storeKey: 'nikora_concierge_v1',
    nudgeKey: 'nikora_concierge_nudge',
    maxStored: 40,
    timeoutMs: 12000
  };
  function endpoint() { return (window.NIKORA_AI_CONFIG && window.NIKORA_AI_CONFIG.endpoint) || ''; }
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ======================================================================
   * 2. ICONS (pure SVG, no emoji)
   * ====================================================================== */
  function svg(inner, cls, fill) {
    return '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 24 24" ' +
      (fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"') +
      ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  var P = {
    sparkle: '<path d="M12 2.2c.55 5 3.1 7.55 8.1 8.1-5 .55-7.55 3.1-8.1 8.1-.55-5-3.1-7.55-8.1-8.1 5-.55 7.55-3.1 8.1-8.1z"/><path d="M19.2 15.4c.22 1.9 1.1 2.78 3 3-1.9.22-2.78 1.1-3 3-.22-1.9-1.1-2.78-3-3 1.9-.22 2.78-1.1 3-3z" transform="translate(-1.2 -1.6) scale(.9)"/><path d="M5.3 14.6c.17 1.35.8 1.98 2.15 2.15-1.35.17-1.98.8-2.15 2.15-.17-1.35-.8-1.98-2.15-2.15 1.35-.17 1.98-.8 2.15-2.15z" transform="translate(.4 .2)"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    refresh: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>',
    truck: '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    ret: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/>',
    shield: '<path d="M12 2l7 4v6c0 5-3.5 8-7 10-3.5-2-7-5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    bag: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 01-8 0"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6.2L4.6 18.4A2 2 0 006.3 21.5h11.4a2 2 0 001.7-3.1L14 9.2V3"/><path d="M7.5 14h9"/>',
    star: '<path d="M12 2l2.9 6.6L22 9.3l-5 5 1.2 7.1L12 18l-6.2 3.4L7 14.3l-5-5 7.1-.7z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.7-2.5 2.2-2.5 3.9M12 17.2v.1"/>',
    arrow: '<path d="M9 6l6 6-6 6"/>'
  };
  function ico(n, cls) { return n === 'sparkle' ? svg(P.sparkle, cls, true) : svg(P[n] || P.arrow, cls); }

  /* ======================================================================
   * 3. TEXT HELPERS (escape, rich formatting, normalisation)
   * ====================================================================== */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeHref(h) { return /^(mailto:[^\s]+|https?:\/\/[^\s]+|[A-Za-z0-9_\-\/]+\.html(?:[?#][^\s]*)?)$/.test(h); }
  function inline(raw) {                                   /* escape first, then allow a tiny safe markup set */
    var s = esc(raw);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      if (!safeHref(url)) return label;
      var ext = /^https?:/.test(url);
      return '<a class="nkai-link" href="' + url + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + label + '</a>';
    });
    return s;
  }
  function rich(text) {                                    /* paragraphs, - bullets, line breaks */
    var out = [], list = null, para = [];
    function flushPara() { if (para.length) { out.push('<p>' + para.join('<br>') + '</p>'); para = []; } }
    function flushList() { if (list) { out.push('<ul>' + list.join('') + '</ul>'); list = null; } }
    String(text).split('\n').forEach(function (line) {
      var t = line.replace(/\s+$/, '');
      var b = /^\s*[-\u2022]\s+(.*)$/.exec(t);
      if (b) { flushPara(); (list = list || []).push('<li>' + inline(b[1]) + '</li>'); }
      else if (!t.trim()) { flushPara(); flushList(); }
      else { flushList(); para.push(inline(t)); }
    });
    flushPara(); flushList();
    return out.join('');
  }
  function norm(s) {
    return ' ' + String(s).toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9#'\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ======================================================================
   * 4. LOCAL KNOWLEDGE ENGINE
   *    Keyword scoring. '=word' means whole-word match; anything else is a
   *    word-prefix match (so "return" also catches "returns", "returned").
   *    Facts below mirror the store's FAQ / guarantee / returns / contact pages.
   * ====================================================================== */
  var MAIL = 'mailto:' + CFG.email;
  function mail(subject) { return MAIL + '?subject=' + encodeURIComponent(subject); }
  var B = {
    track:    { label: 'Track my order',      href: 'track-order.html', icon: 'truck' },
    returns:  { label: 'Start a return',      href: 'returns.html',     icon: 'ret' },
    status:   { label: 'Check return status', href: 'returns.html',     icon: 'ret' },
    guarantee:{ label: 'See the guarantee',   href: 'guarantee.html',   icon: 'shield' },
    faq:      { label: 'Browse the FAQ',      href: 'faq.html',         icon: 'help' },
    contact:  { label: 'Contact page',        href: 'contact.html',     icon: 'mail' },
    catalog:  { label: 'Shop the catalog',    href: 'catalog.html',     icon: 'bag' },
    science:  { label: 'Explore the science', href: 'science.html',     icon: 'flask' },
    reviews:  { label: 'Read verified reviews', href: 'reviews.html',   icon: 'star' },
    privacy:  { label: 'Privacy Policy & Terms', href: 'privacy.html',   icon: 'shield' },
    email:    function (subject) { return { label: 'Email ' + CFG.email, href: mail(subject || 'NIKORA support request'), icon: 'mail' }; }
  };
  var DEFAULT_CHIPS = ['How to use Wand?', 'Track my package', '30-Day Guarantee'];
  var SUPPORT_LINE = 'Our team is available **Monday\u2013Sunday, 8:00 AM\u201310:00 PM EST** and usually replies within **2\u20134 business hours**.';

  var INTENTS = [
    { id: 'about',
      k: [['are you a bot', 5], ['are you human', 5], ['are you real', 5], ['are you ai', 5], ['who are you', 4], ['what are you', 4], ['are you a person', 5], ['robot', 4], ['chatbot', 4], ['is this ai', 5]],
      text: "I'm NIKORA's **virtual beauty concierge**, an automated assistant that can answer skincare, device, order and returns questions around the clock.\n\nFor anything personal to your order or skin, our human team is happy to help by email.",
      buttons: [B.email('Question for the NIKORA team')], chips: DEFAULT_CHIPS },

    { id: 'wand',
      k: [['how to use', 3], ['how do i use', 3], ['how should i use', 3], ['wand', 2], ['instruction', 2], ['routine', 2], ['get started', 2], ['step by step', 2], ['directions', 2], ['set up', 2]],
      text: "Here's a simple routine for your **NIKORA SkinGlow Wand Pro**:\n- **Cleanse** your face and pat it dry.\n- **Prep:** use the device on clean skin with a water-based serum or conductive gel if your guide calls for one.\n- **Glide** slowly and keep the device moving. Start on the lowest intensity and increase gradually.\n- **Finish** with your moisturizer, plus sunscreen in the morning.\n\nMost routines take about **five minutes a day**. Always follow the schedule in your device's instruction guide for your exact model.",
      buttons: [B.faq], chips: ['How often should I use it?', 'Can I use it with retinol?', 'Is it safe for sensitive skin?'] },

    { id: 'frequency',
      k: [['how often', 4], ['every day', 3], ['daily', 2], ['per day', 2], ['how long should', 3], ['how many minutes', 3], ['minutes', 2], ['sessions', 2], ['how many times', 3], ['too much', 2], ['overuse', 3]],
      text: "Start with a **few sessions in your first week**, then build up to daily use as your skin gets comfortable. A routine takes about **five minutes**.\n\nConsistency matters more than intensity, so aim for regular use rather than longer sessions, and follow the schedule in your device's guide.",
      buttons: [], chips: ['When will I see results?', 'Does it hurt?', 'How to use Wand?'] },

    { id: 'results',
      k: [['results', 3], ['when will i see', 4], ['how long until', 4], ['see a difference', 4], ['does it work', 4], ['before and after', 3], ['effective', 3], ['visible', 2], ['how soon', 3], ['worth it', 2], ['really work', 4]],
      text: "Give microcurrents at least **30\u201345 days of regular use** to show real results. It helps to take **one photo each week** so you can see your own progress.\n\nIndividual results vary. Our **30-Day Money-Back Guarantee** covers **unopened and unused items in original packaging upon arrival**.",
      buttons: [B.guarantee, B.reviews], chips: ['30-Day Guarantee', 'How often should I use it?', 'How does red light work?'] },

    { id: 'combo',
      k: [['retinol', 5], ['serum', 3], ['moisturi', 3], ['sunscreen', 3], ['spf', 3], ['gel', 2], ['cream', 3], ['acid', 3], ['exfoliat', 3], ['vitamin c', 3], ['skincare products', 3], ['with my skincare', 4], ['existing', 2], ['conductive', 3]],
      text: "Yes, NIKORA works alongside your current skincare. A simple order that suits most routines:\n- **Cleanse** and pat dry.\n- **Device,** with a water-based serum or conductive gel if your guide calls for one.\n- **Moisturizer,** then sunscreen in the morning.\n\nIf you use strong actives like **retinol or exfoliating acids** and your skin is sensitive, try them on different evenings from your device.",
      buttons: [B.faq], chips: ['Is it safe for sensitive skin?', 'How often should I use it?', 'How to use Wand?'] },

    { id: 'sensation',
      k: [['hurt', 4], ['pain', 4], ['tingl', 4], ['uncomfortable', 4], ['feel like', 2], ['sting', 3], ['shock', 3], ['sharp', 3], ['intensity', 3], ['does it feel', 3]],
      text: "It shouldn't hurt. Microcurrents are designed to be gentle, and most people feel a **light tingle or barely anything at all**.\n- Begin on the **lowest intensity** and increase slowly.\n- Keep the device **moving** on clean, slightly damp or gel-prepped skin.\n- If anything feels sharp or painful, **turn it down or stop** and contact us.",
      buttons: [B.email('Device comfort question')], chips: ['Is it safe for sensitive skin?', 'How to use Wand?', 'Talk to support'] },

    { id: 'safety',
      k: [['safe', 3], ['sensitive', 3], ['pregnan', 5], ['pacemaker', 5], ['implant', 4], ['irritat', 3], ['redness', 3], ['rosacea', 4], ['eczema', 4], ['medication', 3], ['doctor', 3], ['dermatolog', 3], ['side effect', 4], ['uv', 2], ['acne', 2], ['breakout', 2], ['allerg', 3], ['reaction', 3]],
      text: "Red light contains **no UV** and is generally well tolerated, including by many people with sensitive skin. Used as directed, short daily sessions are what these devices are designed for.\n- If your skin is sensitive, start with **fewer, shorter sessions** and build up.\n- **Stop** if you notice lasting redness, irritation or discomfort.\n- **Check with your doctor first** if you are pregnant, have an implanted electronic device such as a pacemaker, have a skin condition, or take medication that makes skin light-sensitive.\n\nThis is general guidance, not medical advice, and individual results vary.",
      buttons: [B.science, B.email('Safety question')], chips: ['How does red light work?', 'Does it hurt?', 'Start a return'] },

    { id: 'tech',
      k: [['red light', 4], ['microcurrent', 4], ['ems', 3], ['how does it work', 4], ['how does', 1], ['technology', 3], ['clinical', 3], ['certif', 3], ['tested', 3], ['science', 3], ['collagen', 3], ['warmth', 2], ['heat', 2], ['led', 1]],
      text: "NIKORA brings together **red light, EMS microcurrents and gentle warmth** in a five-minute daily ritual, designed around the routine you actually have time for.\n\nOur Science page explains each technology and the safety standards we design around, and every product page lists the details for that model. Need documentation for a specific device? Email us the model name and we'll point you to it.",
      buttons: [B.science, B.catalog, B.email('Device documentation request')], chips: ['Is it safe for sensitive skin?', 'When will I see results?', 'Which device should I choose?'] },

    { id: 'concerns',
      k: [['wrinkle', 3], ['fine line', 3], ['firm', 3], ['sagging', 3], ['lift', 2], ['dull', 3], ['glow', 2], ['puff', 3], ['dark circle', 3], ['pores', 3], ['texture', 3], ['aging', 3], ['ageing', 3], ['anti age', 3], ['skin type', 3], ['oily', 3], ['dry skin', 3], ['pigment', 3]],
      text: "NIKORA devices are designed to support **glow and firmness** with red light, EMS microcurrents and warmth, in a gentle five-minute routine.\n\nFor best results, use consistently for **30\u201345 days**, pair the device with a good moisturizer and daily sunscreen, and take a weekly photo to track progress. Individual results vary.\n\nFor persistent concerns such as acne, rosacea or other skin conditions, it's wise to check with a dermatologist before starting a new device.",
      buttons: [B.catalog, B.science], chips: ['Which device should I choose?', 'When will I see results?', 'Is it safe for sensitive skin?'] },

    { id: 'recommend',
      k: [['which device', 4], ['which one', 3], ['recommend', 3], ['best', 2], ['choose', 3], ['compare', 3], ['difference between', 3], ['catalog', 3], ['products', 2], ['price', 3], ['cost', 3], ['how much', 3], ['buy', 3], ['purchase', 3], ['shop', 2], ['wand pro', 3], ['skinglow', 3], ['gift', 3], ['in stock', 3]],
      text: "You can browse every device in our catalog, and each product page lists the details, pricing and options for that model.\n\nTell me what matters most to you, such as **glow, firmness, or a quick daily routine**, and I'll point you in the right direction. Every order is covered by our **30-day money-back guarantee** and **Loss & Damage Protection**, and **Express shipping is free**.",
      buttons: [B.catalog, B.science], chips: ['30-Day Guarantee', 'How to use Wand?', 'How long does shipping take?'] },

    { id: 'tracking',
      k: [['track', 3], ['package', 3], ['parcel', 3], ['where is my', 4], ['order status', 4], ['delivery status', 4], ['tracking number', 4], ['shipment', 3], ['when will my', 3], ['has my order', 3], ['not arrived', 4], ['hasn t arrived', 4], ['late', 2], ['delayed', 3], ['order number', 3]],
      text: "You can follow your order on our tracking page. You'll need your **order number** (it starts with **#NK-** and is in your confirmation email) and the **email** you ordered with.\n\nOrders are processed in **1\u20133 business days**, then ship in **7\u201315 business days** with real-time tracking. Tracking numbers typically activate within 1\u20133 business days after checkout, once the warehouse dispatches your order. If tracking is inactive for more than 14 days, or transit exceeds 30 days, we'll reship for free or refund you in full.",
      buttons: [B.track, B.email('Order tracking help')], chips: ['How long does shipping take?', 'Start a return', 'Talk to support'] },

    { id: 'shipping',
      k: [['shipping', 3], ['delivery', 2], ['deliver', 2], ['arrive', 2], ['express', 3], ['free shipping', 4], ['international', 3], ['customs', 3], ['ship to', 3], ['how long does', 1], ['dispatch', 3], ['carrier', 2], ['abroad', 3], ['worldwide', 3], ['country', 2]],
      text: "Orders are processed in **1\u20133 business days** (quality check, assembly and packaging), then ship **free** in **7\u201315 business days** with real-time tracking.\n\nDelivery times can vary with your location and customs, and you'll always see the latest status on the tracking page. If you're unsure whether we deliver to your country, email us and we'll confirm.",
      buttons: [B.track], chips: ['Track my package', '30-Day Guarantee', 'Which device should I choose?'] },

    { id: 'guarantee',
      k: [['100 day', 4], ['30 day', 4], ['guarantee', 4], ['risk free', 4], ['trial', 3], ['money back', 4], ['satisf', 2], ['nothing to lose', 3], ['home trial', 4], ['100 days', 3]],
      text: "Visible lifting results usually appear within **30\u201345 days of consistent daily use**. Our **30-Day Money-Back Guarantee** covers **unopened and unused items in original packaging upon arrival**.\n\nCustomers are responsible for **return shipping costs for change-of-mind returns**. Returns apply to unopened/unused items within 30 days.\n\nSeparately, **Loss & Damage Protection** gives you a **free reshipment or a full refund** if an item is defective, damaged in shipping, or lost (tracking inactive for more than 14 days, or transit over 30 days).",
      buttons: [B.guarantee, B.returns], chips: ['How do I start a return?', 'When will I get my refund?', 'When will I see results?'] },

    { id: 'refund',
      k: [['when will i get my refund', 6], ['how long does a refund', 6], ['how long for a refund', 6], ['refund take', 5], ['get my money back', 5], ['when do i get my money', 5], ['refund timing', 5], ['refund time', 5]],
      text: "Once your return arrives and is checked in, we refund the **full purchase price** to your original payment method within **5\u20137 business days**. Your bank or card issuer may take a little longer to show it on your statement.\n\nFor change-of-mind returns, customers are responsible for **return shipping costs**. Returns apply to **unopened/unused items within 30 days**.",
      buttons: [B.status, B.returns], chips: ['How do I start a return?', '30-Day Guarantee', 'Talk to support'] },

    { id: 'returns',
      k: [['return', 3], ['refund', 2], ['send back', 3], ['exchange', 3], ['replace', 2], ['cancel', 3], ['label', 2], ['restocking', 3], ['return status', 3], ['ret 0', 3], ['when will i get my refund', 4], ['how do i get a refund', 4], ['start a return', 4], ['change my mind', 3], ['money', 1]],
      text: "Our automated returns portal takes about two minutes:\n- **Verify** your order with your order number and checkout email.\n- **Add details** and up to 3 photos.\n- **Confirm** and receive your return ID (like #RET-0000), then your return instructions once approved.\n\nCustomers are responsible for **return shipping costs for change-of-mind returns**, and returns apply to **unopened/unused items within 30 days**. After your return arrives and is checked in, the full purchase price goes back to your original payment method within **5\u20137 business days** (your bank may take a little longer to show it).\n\nHave your **order ID (#NK-)**, the device, charger and original packaging ready.",
      buttons: [B.returns, B.guarantee], chips: ['30-Day Guarantee', 'My device arrived damaged', 'Talk to support'] },

    { id: 'lost',
      k: [['lost', 4], ['never arrived', 5], ['didn t arrive', 5], ['not received', 4], ['no tracking', 4], ['tracking not', 4], ['tracking stuck', 5], ['still waiting', 4], ['reship', 4], ['stuck in transit', 5], ['missing package', 5]],
      text: "I'm sorry it hasn't arrived! A package counts as **lost** if its tracking has been **inactive for more than 14 days**, or it has been **in transit for more than 30 days**. In that case we'll send a **free reshipment or give you a full refund**.\n\nEmail us your **order number** and we'll take care of it.",
      buttons: [B.track, B.email('Lost package')], chips: ['Track my package', 'My device arrived damaged', 'Talk to support'] },

    { id: 'damaged',
      k: [['arrived damaged', 5], ['damaged', 4], ['broken', 4], ['defective', 4], ['faulty', 4], ['not working', 4], ['doesn t work', 4], ['stopped working', 4], ['won t charge', 4], ['doesn t charge', 4], ['wrong item', 4], ['missing', 3], ['cracked', 3], ['malfunction', 4]],
      text: "I'm sorry your device isn't right. Here's the quickest way to put it right:\n- Email us your **order number and a photo** and we'll send a **free reshipment or a full refund**.\n- Or start a request in the returns portal and choose **Damaged on Arrival** or **Defective / Not Working**.\n\nIf you ever feel a strong reaction while using a device, stop using it and seek medical advice.",
      buttons: [B.email('Damaged or faulty device'), B.returns], chips: ['What if my package is lost?', 'How do I start a return?', 'Talk to support'] },

    { id: 'warranty',
      k: [['warranty', 5], ['coverage', 3], ['repair', 3], ['guaranteed for', 2], ['covered', 3], ['protection', 3]],
      text: "Every order is covered by **Loss & Damage Protection**: if an item is **defective, damaged in shipping, or lost**, we send a **free reshipment or give you a full refund**. Email us your **order number** (a photo of the problem helps) and we'll take it from there.\n\nOur **30-Day Money-Back Guarantee** separately covers **unopened and unused items in original packaging upon arrival**.",
      buttons: [B.guarantee, B.email('Damaged or defective order')], chips: ['My device arrived damaged', '30-Day Guarantee', 'Talk to support'] },

    { id: 'promo',
      k: [['promo', 4], ['coupon', 4], ['discount', 4], ['voucher', 4], ['sale', 3], ['offer', 2], ['deal', 3], ['code', 2], ['first order', 3], ['cheaper', 3]],
      text: "If you have a promo code, open your bag and tap **\u201CHave a promo code?\u201D** to apply it before checkout. I can't see or issue codes from chat, but you can always ask the team.\n\n**Express shipping is free** on every order.",
      buttons: [B.catalog, B.email('Promo code question')], chips: ['Which device should I choose?', '30-Day Guarantee', 'How long does shipping take?'] },

    { id: 'orders',
      k: [['change my order', 5], ['change my address', 5], ['wrong address', 5], ['edit my order', 5], ['update my order', 4], ['payment', 3], ['pay', 2], ['checkout', 3], ['credit card', 3], ['paypal', 3], ['charged', 3], ['invoice', 3], ['receipt', 3], ['order confirmation', 3], ['didn t get an email', 4]],
      text: "For anything about your order or payment, such as an **address change, cancellation, receipt or a charge you're unsure about**, please email us your **order number** as soon as you can, and we'll sort it out.\n\nI can't change or look up orders from this chat, and for your security **please don't share card details or other sensitive information here**.",
      buttons: [B.email('Order or payment question'), B.track], chips: ['Track my package', 'Start a return', 'Talk to support'] },

    { id: 'reviews',
      k: [['review', 3], ['testimonial', 3], ['customers say', 3], ['feedback', 2], ['rating', 3], ['real people', 2], ['trustworthy', 3], ['legit', 3], ['reputable', 3]],
      text: "You can read what real customers say on our **Verified Reviews** page, and share your own experience once you've tried your device.",
      buttons: [B.reviews], chips: ['30-Day Guarantee', 'Is it safe for sensitive skin?', 'Which device should I choose?'] },

    { id: 'privacy',
      k: [['privacy', 4], ['personal data', 4], ['personal information', 4], ['my data', 3], ['gdpr', 4], ['ccpa', 4], ['cookie', 3], ['terms and conditions', 4], ['terms of use', 4], ['terms of service', 4], ['=terms', 3], ['delete my', 3], ['data protection', 4], ['do you sell my', 4], ['share my', 2], ['is my information safe', 4], ['legal', 2]],
      text: "We only collect what we need to deliver your order, answer your questions and process returns, and we **don't sell your personal information**. Your cart and theme are kept in your browser rather than in tracking cookies.\n\nYou can ask us to **access, correct or delete** your information at any time by emailing us. For the full details, see our Privacy Policy & Terms.",
      buttons: [B.privacy, B.email('Privacy request')], chips: ['Talk to support', '30-Day Guarantee', 'Track my package'] },

    { id: 'contact',
      k: [['contact', 3], ['support', 3], ['human', 3], ['agent', 3], ['real person', 4], ['speak to', 3], ['talk to', 3], ['email', 3], ['phone', 3], ['call', 2], ['hours', 3], ['open', 1], ['response time', 4], ['reply', 2], ['help desk', 3], ['customer service', 4], ['complain', 3]],
      text: "I'd be glad to connect you with the team. " + SUPPORT_LINE + "\n\nEmail **" + CFG.email + "** or send a message through the contact page.",
      buttons: [B.email('NIKORA support request'), B.contact], chips: DEFAULT_CHIPS },

    { id: 'greeting',
      k: [['=hi', 3], ['=hello', 3], ['=hey', 3], ['=hiya', 3], ['=hola', 3], ['good morning', 3], ['good afternoon', 3], ['good evening', 3], ['=greetings', 3]],
      text: ["Hello, and welcome to NIKORA. I can help with your device routine, order tracking, returns and our 30-day guarantee. What would you like to know?",
             "Hi there, welcome to NIKORA. Ask me anything about your skincare routine, your order or our guarantee, or tap a quick option below."],
      buttons: [], chips: DEFAULT_CHIPS },

    { id: 'thanks',
      k: [['=thanks', 4], ['thank you', 4], ['=thx', 4], ['appreciate', 3], ['=cheers', 3], ['that helps', 3], ['helpful', 3], ['perfect', 2], ['great', 1]],
      text: ["You're very welcome. Is there anything else I can help you with?", "My pleasure. If you think of anything else, I'm right here."],
      buttons: [], chips: DEFAULT_CHIPS },

    { id: 'bye',
      k: [['=bye', 4], ['goodbye', 4], ['see you', 3], ['talk later', 3], ['=cya', 3], ['that s all', 3], ['all good', 2], ['no thanks', 2]],
      text: ["Take care, and enjoy your glow. I'm here whenever you need me.", "Goodbye for now. Come back anytime you have a question."],
      buttons: [], chips: [] }
  ];

  var FALLBACK = {
    text: ["I want to get this right, and I'm not completely sure I understood. I can help with **device routines, skin safety, shipping, order tracking, returns and the 30-day guarantee**.\n\nFor anything else, our team will gladly help. " + SUPPORT_LINE],
    buttons: [B.faq, B.email('Question for the NIKORA team')],
    chips: DEFAULT_CHIPS
  };

  /* compile patterns once */
  INTENTS.forEach(function (it) {
    it._k = it.k.map(function (p) {
      var w = p[0], exact = w.charAt(0) === '=';
      var core = escRe(exact ? w.slice(1) : w);
      return { re: new RegExp('\\b' + core + (exact ? '\\b' : ''), 'i'), w: p[1] };
    });
  });

  var variantIx = {};
  function pick(it) {                                       /* rotate through wording variants */
    var t = it.text;
    if (!Array.isArray(t)) return t;
    variantIx[it.id] = ((variantIx[it.id] || 0) + 1) % t.length;
    return t[variantIx[it.id]];
  }
  function pack(it) {
    var btns = (it.buttons || []).map(function (b) { return typeof b === 'function' ? b() : b; });
    return { id: it.id, text: Array.isArray(it.text) ? pick(it) : it.text, buttons: btns, chips: it.chips || DEFAULT_CHIPS };
  }
  var lastIntent = null;

  function localAnswer(input) {
    var raw = String(input || '');
    var t = norm(raw);

    /* a pasted order number: be helpful, be honest, protect privacy */
    if (/\bnk[-\s]?\d{3,}/i.test(raw)) {
      lastIntent = 'tracking';
      return { text: "Thank you. I can't look up individual orders from this chat, and please avoid sharing personal or payment details here.\n\nYou can see the live status by entering that order number with your email or phone number on the tracking page. If anything looks wrong, email us the number and we'll check it for you.",
               buttons: [B.track, B.email('Order inquiry')], chips: ['How long does shipping take?', 'Start a return', 'Talk to support'] };
    }
    if (/\bret[-\s]?\d{3,}/i.test(raw)) {
      lastIntent = 'returns';
      return { text: "Thanks. You can check the live status of a return on the returns page using your **return ID (#RET-)** and the email you used. I can't look up requests from chat.",
               buttons: [B.status, B.email('Return status question')], chips: ['When will I get my refund?', 'Talk to support'] };
    }

    /* short affirmations continue the previous topic */
    if (lastIntent && /^ (yes|yeah|yep|yup|sure|ok|okay|please|go on|more|tell me more|continue)( please| thanks)? $/.test(t)) {
      var prev = INTENTS.filter(function (i) { return i.id === lastIntent; })[0];
      return { text: "Happy to help further. Pick a topic below, or just type your question.", buttons: [], chips: (prev && prev.chips) || DEFAULT_CHIPS };
    }

    var best = null, bestScore = 0;
    INTENTS.forEach(function (it) {
      var s = 0;
      it._k.forEach(function (k) { if (k.re.test(t)) s += k.w; });
      if (s > bestScore) { bestScore = s; best = it; }
    });
    if (best && bestScore >= 2) { lastIntent = best.id; return pack(best); }
    lastIntent = null;
    return { text: FALLBACK.text[0], buttons: FALLBACK.buttons.map(function (b) { return typeof b === 'function' ? b() : b; }), chips: FALLBACK.chips };
  }

  /* ======================================================================
   * 5. OPTIONAL LIVE ENDPOINT (your own proxy; falls back to the local engine)
   * ====================================================================== */
  function askRemote(history) {
    var url = endpoint();
    if (!url || typeof fetch !== 'function') return Promise.resolve(null);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, CFG.timeoutMs);
    var payload = {
      page: location.pathname,
      messages: history.slice(-12).map(function (m) { return { role: m.r === 'u' ? 'user' : 'assistant', content: m.t }; })
    };
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl ? ctl.signal : undefined })
      .then(function (res) { clearTimeout(timer); if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (d) {
        var txt = d && (d.reply || d.text || (d.content && d.content[0] && d.content[0].text));
        return (typeof txt === 'string' && txt.trim()) ? txt.trim().slice(0, 2500) : null;
      })
      .catch(function () { clearTimeout(timer); return null; });
  }

  /* ======================================================================
   * 6. CSS
   * ====================================================================== */
  var CSS = [
  '.nkai-root{--nkai-gold:#C59B56;--nkai-gold-hi:#E8D3A8;--nkai-gold-rgb:197,155,86;--nkai-ink:#241c0f;',
  '  --nkai-text:#1f1a17;--nkai-soft:rgba(31,26,23,.62);--nkai-faint:rgba(31,26,23,.42);',
  '  --nkai-glass:rgba(255,252,247,.78);--nkai-edge:rgba(255,255,255,.75);--nkai-line:rgba(31,26,23,.09);',
  '  --nkai-bot:rgba(255,255,255,.72);--nkai-input:rgba(255,255,255,.8);--nkai-shadow:0 30px 80px -24px rgba(60,40,15,.45),0 8px 24px -10px rgba(60,40,15,.25);',
  '  --nkai-live:#2fb36d;',
  '  position:fixed;right:max(20px,env(safe-area-inset-right,0px));bottom:max(20px,env(safe-area-inset-bottom,0px));z-index:1900;',
  '  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:var(--nkai-text);}',
  '.nkai-root[data-nkai-theme="dark"]{--nkai-gold:#E5BA73;--nkai-gold-hi:#F3DDB1;--nkai-gold-rgb:229,186,115;',
  '  --nkai-text:#f6f1ea;--nkai-soft:rgba(246,241,234,.66);--nkai-faint:rgba(246,241,234,.4);',
  '  --nkai-glass:rgba(22,18,28,.76);--nkai-edge:rgba(255,255,255,.12);--nkai-line:rgba(255,255,255,.09);',
  '  --nkai-bot:rgba(255,255,255,.07);--nkai-input:rgba(255,255,255,.07);--nkai-shadow:0 30px 80px -20px rgba(0,0,0,.7),0 8px 24px -10px rgba(0,0,0,.5);}',
  '.nkai-root *,.nkai-root *::before,.nkai-root *::after{box-sizing:border-box;}',
  ':where(.nkai-root) button{font:inherit;color:inherit;}',
  '.nkai-root svg{display:block;}',

  /* ---- floating toggle ---- */
  '.nkai-fab{position:relative;display:grid;place-items:center;width:60px;height:60px;margin:0 0 0 auto;padding:0;border:0;border-radius:50%;cursor:pointer;',
  '  color:var(--nkai-ink);background:radial-gradient(circle at 30% 25%,#F6E7C4 0%,var(--nkai-gold-hi) 38%,var(--nkai-gold) 100%);',
  '  box-shadow:0 0 0 1px rgba(255,255,255,.55) inset,0 10px 30px -6px rgba(var(--nkai-gold-rgb),.75),0 0 38px rgba(var(--nkai-gold-rgb),.55);',
  '  transition:transform .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease;-webkit-tap-highlight-color:transparent;}',
  '.nkai-fab::before{content:"";position:absolute;inset:-7px;border-radius:50%;border:1.5px solid rgba(var(--nkai-gold-rgb),.55);animation:nkaiPulse 2.8s ease-out infinite;pointer-events:none;}',
  '.nkai-fab:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 0 0 1px rgba(255,255,255,.6) inset,0 16px 38px -6px rgba(var(--nkai-gold-rgb),.85),0 0 52px rgba(var(--nkai-gold-rgb),.7);}',
  '.nkai-fab:active{transform:scale(.96);}',
  '.nkai-fab:focus-visible,.nkai-hbtn:focus-visible,.nkai-chip:focus-visible,.nkai-send:focus-visible,.nkai-btn:focus-visible,.nkai-link:focus-visible,.nkai-nudge-x:focus-visible{outline:2px solid var(--nkai-gold);outline-offset:3px;}',
  '.nkai-fab .nkai-i-spark,.nkai-fab .nkai-i-down{position:absolute;width:28px;height:28px;transition:opacity .25s ease,transform .35s cubic-bezier(.2,.8,.2,1);}',
  '.nkai-fab .nkai-i-down{opacity:0;transform:rotate(-90deg) scale(.6);}',
  '.nkai-root[data-open="true"] .nkai-fab .nkai-i-spark{opacity:0;transform:rotate(90deg) scale(.6);}',
  '.nkai-root[data-open="true"] .nkai-fab .nkai-i-down{opacity:1;transform:none;}',
  '.nkai-root[data-open="true"] .nkai-fab::before{animation:none;opacity:0;}',
  '@keyframes nkaiPulse{0%{transform:scale(.92);opacity:.85;}70%{transform:scale(1.28);opacity:0;}100%{transform:scale(1.28);opacity:0;}}',

  /* ---- greeting nudge ---- */
  '.nkai-nudge{position:absolute;right:0;bottom:76px;display:flex;align-items:center;gap:8px;max-width:260px;padding:11px 10px 11px 14px;border-radius:18px 18px 4px 18px;',
  '  background:var(--nkai-glass);border:1px solid var(--nkai-edge);box-shadow:var(--nkai-shadow);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);',
  '  font-size:13px;font-weight:500;cursor:pointer;animation:nkaiIn .5s cubic-bezier(.2,.8,.2,1) both;}',
  '.nkai-nudge[hidden]{display:none;}',
  '.nkai-nudge-x{flex:none;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:50%;background:none;cursor:pointer;color:var(--nkai-soft);}',
  '.nkai-nudge-x svg{width:13px;height:13px;}',
  '.nkai-root[data-open="true"] .nkai-nudge{display:none;}',

  /* ---- panel ---- */
  '.nkai-panel{position:absolute;right:0;bottom:78px;display:flex;flex-direction:column;width:min(396px,calc(100vw - 32px));height:min(640px,calc(100vh - 150px));height:min(640px,calc(100dvh - 150px));',
  '  border-radius:26px;overflow:hidden;color:var(--nkai-text);',
  '  background:linear-gradient(160deg,rgba(var(--nkai-gold-rgb),.10),transparent 42%),var(--nkai-glass);',
  '  -webkit-backdrop-filter:blur(26px) saturate(170%);backdrop-filter:blur(26px) saturate(170%);',
  '  border:1px solid var(--nkai-edge);box-shadow:var(--nkai-shadow),0 0 0 1px rgba(var(--nkai-gold-rgb),.16);',
  '  opacity:0;visibility:hidden;pointer-events:none;transform:translateY(22px) scale(.96);transform-origin:100% 100%;',
  '  transition:opacity .28s ease,transform .38s cubic-bezier(.2,.8,.2,1),visibility 0s linear .38s;}',
  '.nkai-root[data-open="true"] .nkai-panel{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition-delay:0s;}',
  '@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.nkai-panel{background:#fbf7f1;}.nkai-root[data-nkai-theme="dark"] .nkai-panel{background:#1b1622;}}',

  /* header */
  '.nkai-head{flex:none;display:flex;align-items:center;gap:12px;padding:16px 14px 14px 16px;border-bottom:1px solid var(--nkai-line);}',
  '.nkai-avatar{flex:none;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;color:var(--nkai-ink);',
  '  background:radial-gradient(circle at 30% 25%,#F6E7C4,var(--nkai-gold-hi) 40%,var(--nkai-gold));box-shadow:0 6px 18px -6px rgba(var(--nkai-gold-rgb),.8);}',
  '.nkai-avatar svg{width:22px;height:22px;}',
  '.nkai-id{flex:1;min-width:0;}',
  '.nkai-title{margin:0;font-family:"Playfair Display",Georgia,serif;font-size:16.5px;font-weight:600;letter-spacing:.01em;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '.nkai-status{display:flex;align-items:center;gap:7px;margin:2px 0 0;font-size:11.5px;color:var(--nkai-soft);}',
  '.nkai-live{position:relative;flex:none;width:8px;height:8px;border-radius:50%;background:var(--nkai-live);}',
  '.nkai-live::after{content:"";position:absolute;inset:-4px;border-radius:50%;background:var(--nkai-live);opacity:.35;animation:nkaiLive 2s ease-out infinite;}',
  '@keyframes nkaiLive{0%{transform:scale(.5);opacity:.5;}100%{transform:scale(1.5);opacity:0;}}',
  '.nkai-hbtns{flex:none;display:flex;align-items:center;gap:6px;}',
  '.nkai-hbtn{display:grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%;cursor:pointer;color:var(--nkai-soft);',
  '  background:rgba(var(--nkai-gold-rgb),.10);border:1px solid var(--nkai-line);transition:color .2s ease,border-color .2s ease,transform .25s ease;}',
  '.nkai-hbtn:hover{color:var(--nkai-text);border-color:var(--nkai-gold);}',
  '.nkai-hbtn svg{width:16px;height:16px;}',
  '.nkai-hbtn.nkai-x:hover{transform:rotate(90deg);}',

  /* log */
  '.nkai-log{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 16px 8px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth;',
  '  scrollbar-width:thin;scrollbar-color:rgba(var(--nkai-gold-rgb),.45) transparent;}',
  '.nkai-log::-webkit-scrollbar{width:6px;}.nkai-log::-webkit-scrollbar-thumb{background:rgba(var(--nkai-gold-rgb),.4);border-radius:6px;}',
  '.nkai-msg{display:flex;align-items:flex-end;gap:8px;max-width:100%;animation:nkaiIn .4s cubic-bezier(.2,.8,.2,1) both;}',
  '.nkai-msg.nkai-still{animation:none;}',
  '@keyframes nkaiIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}',
  '.nkai-msg.nkai-user{justify-content:flex-end;}',
  '.nkai-mav{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;color:var(--nkai-ink);background:linear-gradient(135deg,var(--nkai-gold-hi),var(--nkai-gold));}',
  '.nkai-mav svg{width:13px;height:13px;}',
  '.nkai-bub{max-width:calc(100% - 38px);padding:11px 14px;border-radius:18px;font-size:13.8px;line-height:1.55;word-wrap:break-word;overflow-wrap:anywhere;}',
  '.nkai-bot .nkai-bub{background:var(--nkai-bot);border:1px solid var(--nkai-line);border-bottom-left-radius:5px;}',
  '.nkai-user .nkai-bub{max-width:84%;color:var(--nkai-ink);background:linear-gradient(135deg,var(--nkai-gold-hi),var(--nkai-gold));border-bottom-right-radius:5px;box-shadow:0 8px 20px -10px rgba(var(--nkai-gold-rgb),.9);font-weight:500;}',
  '.nkai-bub p{margin:0;}.nkai-bub p+p,.nkai-bub p+ul,.nkai-bub ul+p{margin-top:9px;}',
  '.nkai-bub ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;}',
  '.nkai-bub li{position:relative;padding-left:16px;}',
  '.nkai-bub li::before{content:"";position:absolute;left:3px;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--nkai-gold);}',
  '.nkai-bub strong{font-weight:650;}',
  '.nkai-link{color:var(--nkai-gold);font-weight:600;text-decoration:none;border-bottom:1px solid rgba(var(--nkai-gold-rgb),.45);}',
  '.nkai-link:hover{border-bottom-color:var(--nkai-gold);}',

  /* link buttons inside replies */
  '.nkai-actions{display:flex;flex-direction:column;gap:7px;margin-top:12px;}',
  '.nkai-btn{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:13px;text-decoration:none;font-size:13px;font-weight:600;color:var(--nkai-text);',
  '  background:rgba(var(--nkai-gold-rgb),.12);border:1px solid rgba(var(--nkai-gold-rgb),.35);transition:background .2s ease,transform .2s ease,border-color .2s ease;word-break:break-word;}',
  '.nkai-btn:hover{background:rgba(var(--nkai-gold-rgb),.22);border-color:var(--nkai-gold);transform:translateX(2px);}',
  '.nkai-btn .nkai-b-ico{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;color:var(--nkai-ink);background:linear-gradient(135deg,var(--nkai-gold-hi),var(--nkai-gold));}',
  '.nkai-btn .nkai-b-ico svg{width:14px;height:14px;}',
  '.nkai-btn .nkai-b-txt{flex:1;min-width:0;}',
  '.nkai-btn .nkai-b-arr{flex:none;width:14px;height:14px;opacity:.5;}',

  /* typing */
  '.nkai-typing{display:inline-flex;align-items:center;gap:5px;padding:4px 2px;}',
  '.nkai-typing i{width:6px;height:6px;border-radius:50%;background:var(--nkai-gold);animation:nkaiDot 1.2s ease-in-out infinite;}',
  '.nkai-typing i:nth-child(2){animation-delay:.18s;}.nkai-typing i:nth-child(3){animation-delay:.36s;}',
  '@keyframes nkaiDot{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-5px);opacity:1;}}',

  /* chips */
  '.nkai-chips{flex:none;display:flex;gap:8px;padding:6px 16px 10px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}',
  '.nkai-chips::-webkit-scrollbar{display:none;}',
  '.nkai-chips:empty{display:none;}',
  '.nkai-chip{flex:none;padding:8px 14px;border-radius:100px;cursor:pointer;white-space:nowrap;font-size:12.5px;font-weight:600;color:var(--nkai-text);',
  '  background:rgba(var(--nkai-gold-rgb),.10);border:1px solid rgba(var(--nkai-gold-rgb),.42);transition:background .2s ease,transform .2s ease,color .2s ease;animation:nkaiIn .35s ease both;}',
  '.nkai-chip:hover{background:linear-gradient(135deg,var(--nkai-gold-hi),var(--nkai-gold));color:var(--nkai-ink);transform:translateY(-1px);}',

  /* composer */
  '.nkai-composer{flex:none;display:flex;align-items:center;gap:8px;margin:0 14px;padding:6px 6px 6px 16px;border-radius:100px;background:var(--nkai-input);border:1px solid var(--nkai-line);transition:border-color .2s ease,box-shadow .2s ease;}',
  '.nkai-composer:focus-within{border-color:var(--nkai-gold);box-shadow:0 0 0 3px rgba(var(--nkai-gold-rgb),.18);}',
  '.nkai-input{flex:1;min-width:0;height:36px;padding:0;border:0;outline:none;background:transparent;color:var(--nkai-text);font:inherit;font-size:14px;}',
  '.nkai-input::placeholder{color:var(--nkai-faint);}',
  '.nkai-send{flex:none;display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:50%;cursor:pointer;color:var(--nkai-ink);',
  '  background:linear-gradient(135deg,var(--nkai-gold-hi),var(--nkai-gold));transition:transform .2s ease,opacity .2s ease;}',
  '.nkai-send:hover{transform:scale(1.07);}',
  '.nkai-send:disabled{opacity:.45;cursor:default;transform:none;}',
  '.nkai-send svg{width:17px;height:17px;}',
  '.nkai-foot{flex:none;margin:0;padding:8px 18px 12px;text-align:center;font-size:10.5px;color:var(--nkai-faint);}',

  /* mobile */
  '@media (max-width:520px){',
  '  .nkai-root{right:max(14px,env(safe-area-inset-right,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));}',
  '  .nkai-fab{width:56px;height:56px;}',
  '  .nkai-panel{right:0;bottom:72px;width:calc(100vw - 28px);height:min(78vh,640px);height:min(78dvh,640px);border-radius:22px;}',
  '  .nkai-input{font-size:16px;}',
  '  .nkai-nudge{bottom:70px;max-width:230px;}',
  '}',
  '@media (max-height:560px){.nkai-panel{height:calc(100vh - 96px);height:calc(100dvh - 96px);}}',
  '@media (prefers-reduced-motion:reduce){',
  '  .nkai-fab::before,.nkai-live::after{animation:none;}',
  '  .nkai-panel,.nkai-fab,.nkai-fab svg,.nkai-msg,.nkai-chip,.nkai-nudge{transition-duration:.001s !important;animation:none !important;}',
  '  .nkai-log{scroll-behavior:auto;}',
  '}'
  ].join('\n');

  /* ======================================================================
   * 7. WIDGET
   * ====================================================================== */
  var root, panel, fab, log, chipsEl, form, input, sendBtn, themeBtn, nudge;
  var state = { msgs: [], open: false };
  var busy = false, typingEl = null, nudgeTimer = 0;

  function $(id) { return document.getElementById(id); }

  function build() {
    var st = document.createElement('style');
    st.id = 'nkai-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    root = document.createElement('div');
    root.className = 'nkai-root'; root.id = 'nkai-root';
    root.setAttribute('data-open', 'false'); root.setAttribute('data-nkai-theme', 'light');
    root.innerHTML =
      '<div class="nkai-nudge" id="nkai-nudge" role="button" tabindex="0" hidden>' +
        '<span>Need help choosing or tracking? <strong>Ask the Concierge.</strong></span>' +
        '<button type="button" class="nkai-nudge-x" id="nkai-nudge-x" aria-label="Dismiss">' + ico('close') + '</button>' +
      '</div>' +
      '<section class="nkai-panel" id="nkai-panel" role="dialog" aria-modal="false" aria-label="' + esc(CFG.title) + ' chat" aria-hidden="true">' +
        '<header class="nkai-head">' +
          '<div class="nkai-avatar">' + ico('sparkle') + '</div>' +
          '<div class="nkai-id"><h2 class="nkai-title">' + esc(CFG.title) + '</h2>' +
            '<p class="nkai-status"><span class="nkai-live" aria-hidden="true"></span>Online now &middot; AI skincare guidance</p></div>' +
          '<div class="nkai-hbtns">' +
            '<button type="button" class="nkai-hbtn" id="nkai-theme" aria-label="Switch theme"></button>' +
            '<button type="button" class="nkai-hbtn" id="nkai-reset" aria-label="Start a new conversation" title="New conversation">' + ico('refresh') + '</button>' +
            '<button type="button" class="nkai-hbtn nkai-x" id="nkai-close" aria-label="Close chat">' + ico('close') + '</button>' +
          '</div>' +
        '</header>' +
        '<div class="nkai-log" id="nkai-log" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Conversation"></div>' +
        '<div class="nkai-chips" id="nkai-chips" role="group" aria-label="Quick replies"></div>' +
        '<form class="nkai-composer" id="nkai-form" autocomplete="off">' +
          '<input class="nkai-input" id="nkai-input" type="text" maxlength="500" placeholder="Ask about skincare, orders, returns\u2026" aria-label="Type your message" enterkeyhint="send">' +
          '<button type="submit" class="nkai-send" id="nkai-send" aria-label="Send message">' + ico('send') + '</button>' +
        '</form>' +
        '<p class="nkai-foot">Automated guidance, not medical advice. Please don\u2019t share payment details.</p>' +
      '</section>' +
      '<button type="button" class="nkai-fab" id="nkai-fab" aria-expanded="false" aria-controls="nkai-panel" aria-label="Open ' + esc(CFG.title) + ' chat">' +
        ico('sparkle', 'nkai-i-spark') + ico('down', 'nkai-i-down') +
      '</button>';
    document.body.appendChild(root);

    panel = $('nkai-panel'); fab = $('nkai-fab'); log = $('nkai-log'); chipsEl = $('nkai-chips');
    form = $('nkai-form'); input = $('nkai-input'); sendBtn = $('nkai-send'); themeBtn = $('nkai-theme'); nudge = $('nkai-nudge');
  }

  /* ---- theme (follows <html data-theme>; the header button writes it back like the site's switcher) ---- */
  function themeNow() {
    var a = document.documentElement.getAttribute('data-theme');
    if (a === 'dark' || a === 'light') return a;
    try { var s = localStorage.getItem('theme'); if (s === 'dark' || s === 'light') return s; } catch (e) {}
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  function syncTheme() {
    var m = themeNow();
    root.setAttribute('data-nkai-theme', m);
    themeBtn.innerHTML = ico(m === 'dark' ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', m === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeBtn.setAttribute('title', m === 'dark' ? 'Light theme' : 'Dark theme');
  }
  function toggleTheme() {
    var next = themeNow() === 'dark' ? 'light' : 'dark';
    if (typeof window.setTheme === 'function') { window.setTheme(next); }          /* page's own handler (stores it too) */
    else {
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    }
    syncTheme();
  }

  /* ---- persistence (per tab) ---- */
  function save() {
    try { sessionStorage.setItem(CFG.storeKey, JSON.stringify({ open: state.open, msgs: state.msgs.slice(-CFG.maxStored) })); } catch (e) {}
  }
  function load() {
    try {
      var d = JSON.parse(sessionStorage.getItem(CFG.storeKey) || 'null');
      if (d && Array.isArray(d.msgs)) {
        state.msgs = d.msgs.filter(function (m) { return m && (m.r === 'u' || m.r === 'b') && typeof m.t === 'string'; }).slice(-CFG.maxStored);
        state.open = d.open === true;
      }
    } catch (e) {}
  }

  /* ---- rendering ---- */
  function btnHtml(b) {
    if (!b || !safeHref(b.href)) return '';
    var ext = /^https?:/.test(b.href);
    return '<a class="nkai-btn" href="' + esc(b.href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
      '<span class="nkai-b-ico">' + ico(b.icon || 'arrow') + '</span><span class="nkai-b-txt">' + esc(b.label) + '</span>' + ico('arrow', 'nkai-b-arr') + '</a>';
  }
  function msgNode(m, still) {
    var el = document.createElement('div');
    el.className = 'nkai-msg ' + (m.r === 'u' ? 'nkai-user' : 'nkai-bot') + (still ? ' nkai-still' : '');
    if (m.r === 'u') {
      el.innerHTML = '<div class="nkai-bub"><p>' + esc(m.t) + '</p></div>';
    } else {
      var acts = (m.b && m.b.length) ? '<div class="nkai-actions">' + m.b.map(btnHtml).join('') + '</div>' : '';
      el.innerHTML = '<span class="nkai-mav">' + ico('sparkle') + '</span><div class="nkai-bub">' + rich(m.t) + acts + '</div>';
    }
    return el;
  }
  function scrollDown(instant) {
    var go = function () { log.scrollTop = log.scrollHeight; };
    if (instant || REDUCED) go(); else requestAnimationFrame(go);
  }
  function addMsg(role, text, buttons, still) {
    var m = { r: role, t: text, b: buttons || [] };
    state.msgs.push(m);
    if (state.msgs.length > CFG.maxStored) state.msgs.shift();
    log.appendChild(msgNode(m, still));
    scrollDown(still);
    save();
    return m;
  }
  function setChips(list) {
    chipsEl.innerHTML = '';
    (list || []).forEach(function (label) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'nkai-chip'; b.textContent = label;
      b.addEventListener('click', function () { send(label); });
      chipsEl.appendChild(b);
    });
  }
  function showTyping() {
    hideTyping();
    typingEl = document.createElement('div');
    typingEl.className = 'nkai-msg nkai-bot';
    typingEl.setAttribute('aria-label', 'Concierge is typing');
    typingEl.innerHTML = '<span class="nkai-mav">' + ico('sparkle') + '</span><div class="nkai-bub"><span class="nkai-typing" aria-hidden="true"><i></i><i></i><i></i></span></div>';
    log.appendChild(typingEl); scrollDown();
  }
  function hideTyping() { if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl); typingEl = null; }

  function setBusy(v) { busy = v; sendBtn.disabled = v; }

  /* ---- conversation ---- */
  function welcome() {
    addMsg('b', "Hello, and welcome to NIKORA. I'm your virtual beauty concierge. I can help with your device routine, order tracking, returns and our 30-day guarantee.\n\nWhat would you like to know?", [], false);
    setChips(DEFAULT_CHIPS);
  }
  function send(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    if (text.length > 500) text = text.slice(0, 500);
    if (!state.open) open();
    addMsg('u', text);
    input.value = '';
    setChips([]); setBusy(true); showTyping();
    var started = Date.now();
    askRemote(state.msgs).then(function (remote) {
      var out = remote ? { text: remote, buttons: [], chips: DEFAULT_CHIPS } : localAnswer(text);
      var base = REDUCED ? 120 : Math.min(1500, 520 + out.text.length * 3);
      var wait = Math.max(0, base - (Date.now() - started));
      setTimeout(function () {
        hideTyping();
        addMsg('b', out.text, out.buttons);
        setChips(out.chips);
        setBusy(false);
      }, wait);
    });
  }
  function reset() {
    state.msgs = []; log.innerHTML = ''; hideTyping(); setBusy(false); lastIntent = null; save();
    welcome();
  }

  /* ---- open / close ---- */
  function open(opts) {
    state.open = true;
    root.setAttribute('data-open', 'true'); panel.setAttribute('aria-hidden', 'false');
    fab.setAttribute('aria-expanded', 'true'); fab.setAttribute('aria-label', 'Close ' + CFG.title + ' chat');
    hideNudge(true);
    scrollDown(true); save();
    if (!(opts && opts.quiet)) setTimeout(function () { if (state.open) try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } }, 320);
  }
  function close(returnFocus) {
    state.open = false;
    root.setAttribute('data-open', 'false'); panel.setAttribute('aria-hidden', 'true');
    fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-label', 'Open ' + CFG.title + ' chat');
    save();
    if (returnFocus) fab.focus();
  }
  function toggle() { if (state.open) close(false); else open(); }

  /* ---- greeting nudge (once per tab session, never after interaction) ---- */
  function hideNudge(remember) {
    clearTimeout(nudgeTimer);
    if (nudge) nudge.hidden = true;
    if (remember) { try { sessionStorage.setItem(CFG.nudgeKey, '1'); } catch (e) {} }
  }
  function scheduleNudge() {
    var seen = false; try { seen = sessionStorage.getItem(CFG.nudgeKey) === '1'; } catch (e) {}
    if (seen || state.open || state.msgs.length > 1) return;
    nudgeTimer = setTimeout(function () {
      if (state.open) return;
      nudge.hidden = false;
      nudgeTimer = setTimeout(function () { hideNudge(true); }, 9000);
    }, 7000);
  }

  /* ---- wiring ---- */
  function wire() {
    fab.addEventListener('click', toggle);
    $('nkai-close').addEventListener('click', function () { close(true); });
    $('nkai-reset').addEventListener('click', reset);
    themeBtn.addEventListener('click', toggleTheme);
    form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
    nudge.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#nkai-nudge-x')) { hideNudge(true); return; } open(); });
    nudge.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.open && root.contains(document.activeElement)) close(true); });
    if (window.MutationObserver) new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('storage', function (e) { if (e.key === 'theme') syncTheme(); });
  }

  function init() {
    if ($('nkai-root')) return;
    build();
    load();
    syncTheme();
    wire();
    if (state.msgs.length) {
      state.msgs.forEach(function (m) { log.appendChild(msgNode(m, true)); });
      var last = state.msgs[state.msgs.length - 1];
      setChips(last && last.r === 'b' ? DEFAULT_CHIPS : []);
      scrollDown(true);
    } else {
      welcome();
    }
    if (state.open) open({ quiet: true });
    scheduleNudge();
  }

  window.NikoraAssistant = {
    open: function () { open(); }, close: function () { close(false); }, toggle: toggle,
    send: send, reset: reset
  };

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
