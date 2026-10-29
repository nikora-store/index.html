/**
 * api/router.js  -  ONE Vercel Serverless Function that serves the checkout and internal routes.
 * The handlers live in /server (outside /api, so Vercel does not count them as functions). Each handler file is
 * moved there UNCHANGED: server/checkout/x.js sits at the same depth as api/checkout/x.js, so its
 * require('../../lib/...') lines keep working.
 * vercel.json rewrites each public URL to /api/router?r=<key>.
 *
 * Not routed here on purpose: api/checkout/stripe.js (Stripe webhook, needs the raw body: bodyParser:false),
 * api/webhooks/fulfillment.js, api/wc/v3/orders.js.
 */
'use strict';

/* Static string literals on purpose: Vercel bundles exactly these files. A file that is not there only fails when its route is called. */
const HANDLERS = {
  'checkout/config':               () => require('../server/checkout/config'),
  'checkout/create-stripe-intent': () => require('../server/checkout/create-stripe-intent'),
  'checkout/stripe-complete':      () => require('../server/checkout/stripe-complete'),
  'checkout/paypal-create':        () => require('../server/checkout/paypal-create'),
  'checkout/paypal-capture':       () => require('../server/checkout/paypal-capture'),
  'send-email':                    () => require('../server/send-email'),
  'agent':                         () => require('../server/agent')
};

module.exports = async function router(req, res) {
  const key = String((req.query && req.query.r) || '').replace(/^\/+|\/+$/g, '');
  const load = Object.prototype.hasOwnProperty.call(HANDLERS, key) ? HANDLERS[key] : null;
  if (!load) return res.status(404).json({ error: 'not-found' });

  let fn;
  try {
    const m = load();
    fn = typeof m === 'function' ? m : (m && m.default);
  } catch (e) {
    console.error('[router] cannot load handler', key, e && e.message);
    return res.status(500).json({ error: 'handler-unavailable' });
  }
  if (typeof fn !== 'function') {
    console.error('[router] handler has no function export', key);
    return res.status(500).json({ error: 'handler-unavailable' });
  }
  try { delete req.query.r; } catch (e) { /* hide the internal routing param from the handler when possible */ }
  return fn(req, res);
};
