/**
 * POST /api/checkout/stripe-complete   { paymentIntentId }
 * Called by checkout.html right after Stripe confirms the payment in the browser (or after a 3-D Secure redirect),
 * so the customer sees their order number immediately instead of waiting for the webhook. It checks the payment
 * with Stripe itself and creates the order through the same idempotent pipeline the webhook uses, so whichever
 * of the two runs first wins and the other just returns the same order.
 */
'use strict';

const { getDb, reply, sameOrigin } = require('../../lib/common');
const { fulfillStripePayment } = require('../../lib/stripe');

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { success: false, error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return reply(res, 403, { success: false, error: 'Origin not allowed.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const id = String((body && body.paymentIntentId) || '');
  if (!/^pi_[A-Za-z0-9]{8,64}$/.test(id)) return reply(res, 400, { success: false, error: 'Invalid payment reference.' });

  try {
    const r = await fulfillStripePayment(getDb(), id);
    if (r.status === 'paid') return reply(res, 200, r.order);
    if (r.status === 'processing') return reply(res, 202, { success: false, pending: true });
    if (r.status === 'issue') return reply(res, 500, { success: false, error: 'Your payment went through but we need to check your order. Please email nikora.support@gmail.com and we will fix it right away.' });
    return reply(res, 409, { success: false, error: 'This payment was not completed.' });
  } catch (e) {
    console.error('stripe-complete failed:', e.message);
    return reply(res, 500, { success: false, error: 'We are still finishing your order. Please wait a moment and refresh, or email nikora.support@gmail.com.' });
  }
}

module.exports = handler;
