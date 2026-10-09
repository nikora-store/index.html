/**
 * POST /api/webhooks/stripe        (add this URL in Stripe Dashboard -> Developers -> Webhooks)
 * Event: payment_intent.succeeded
 *   1. verifies the Stripe signature with STRIPE_WEBHOOK_SECRET (raw request body is required)
 *   2. saves the order to Firebase (/orders + /tracking)
 *   3. forwards it to CJ Dropshipping (lib/supplier.js)
 *   4. sends the confirmation email (Resend, via /api/send-email)
 * Steps 2-4 live in lib/orders.js and are idempotent, so Stripe retries and the browser's own
 * /api/checkout/stripe-complete call can never create a second order.
 * Status codes: 200 handled (or ignored), 400 bad signature, 500 failed (Stripe retries).
 */
'use strict';

const { getDb } = require('../../lib/common');
const { getStripe, fulfillStripePayment } = require('../../lib/stripe');

async function readRaw(req) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 1024 * 1024) throw new Error('payload too large'); chunks.push(c); }
  return Buffer.concat(chunks);
}

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { console.error('STRIPE_WEBHOOK_SECRET is not set'); return res.status(503).json({ ok: false, error: 'Webhook is not configured.' }); }

  let event;
  try {
    const raw = await readRaw(req);
    event = getStripe().webhooks.constructEvent(raw, req.headers['stripe-signature'], secret);
  } catch (e) {
    console.error('Stripe signature check failed:', e.message);
    return res.status(400).json({ ok: false, error: 'Invalid signature.' });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const r = await fulfillStripePayment(getDb(), event.data.object.id);
      console.log('stripe webhook', event.id, r.status, r.order ? r.order.key : '');
    } else if (event.type === 'payment_intent.payment_failed') {
      console.log('stripe payment failed', event.data.object.id);
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('stripe webhook failed:', e.message);
    return res.status(500).json({ ok: false });                       // Stripe retries with backoff
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };               // the signature is computed over the raw bytes
