/**
 * POST /api/checkout/paypal-capture   { orderID }
 * Called from the PayPal button's onApprove(). Captures the money, checks it against the cart we saved,
 * then runs the same pipeline as Stripe: Firebase -> CJ Dropshipping -> Resend email.
 * Safe to call twice (PayPal returns ORDER_ALREADY_CAPTURED, and the order pipeline is idempotent), so the
 * browser can simply retry if the connection drops.
 * Returns the order, or { success: false, restart: true } when PayPal declined the funding source (the button restarts).
 */
'use strict';

const { getDb, reply, sameOrigin } = require('../../lib/common');
const { finalizePaidOrder, loadPending, recordPaymentIssue, cents } = require('../../lib/orders');
const { ppFetch } = require('../../lib/paypal');

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { success: false, error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return reply(res, 403, { success: false, error: 'Origin not allowed.' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const id = String((body && body.orderID) || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return reply(res, 400, { success: false, error: 'Invalid PayPal order.' });

  let db;
  try { db = getDb(); } catch (e) { console.error('config error:', e.message); return reply(res, 500, { success: false, error: 'Payments are not configured.' }); }

  try {
    const idx = (await db.ref('paymentIndex/paypal_' + id).once('value')).val();
    const pending = await loadPending(db, 'paypal', id);
    if (!pending && !(idx && idx.orderId)) return reply(res, 404, { success: false, error: 'We could not find this checkout. You have not been charged.' });

    /* 1. capture (or pick up a capture that already happened) */
    let cap = await ppFetch('/v2/checkout/orders/' + id + '/capture', { method: 'POST', requestId: 'nk-capture-' + id, body: {} });
    const issue = (cap.body.details || []).map((d) => d.issue);
    if (cap.status === 422 && issue.indexOf('ORDER_ALREADY_CAPTURED') !== -1) cap = await ppFetch('/v2/checkout/orders/' + id);
    else if (cap.status === 422 && issue.indexOf('INSTRUMENT_DECLINED') !== -1) return reply(res, 422, { success: false, restart: true, error: 'PayPal could not use that payment method. Please choose another one.' });
    if (cap.status >= 300) { console.error('PayPal capture failed', cap.status, JSON.stringify(cap.body).slice(0, 400)); return reply(res, 502, { success: false, error: 'We could not complete your PayPal payment. You have not been charged. Please try again.' }); }

    /* 2. verify what was actually captured */
    const unit = (cap.body.purchase_units || [])[0] || {};
    const capture = ((unit.payments || {}).captures || [])[0];
    if (!capture) return reply(res, 502, { success: false, error: 'We could not confirm your PayPal payment. Please try again.' });
    if (capture.status !== 'COMPLETED') {
      await recordPaymentIssue(db, 'paypal', id, 'capture-' + String(capture.status).toLowerCase(), capture.id);
      return reply(res, 202, { success: false, pending: true, error: 'Your PayPal payment is pending. We will email you as soon as it clears.' });
    }
    const paidCents = Math.round(parseFloat((capture.amount || {}).value) * 100);
    if (pending && ((capture.amount || {}).currency_code !== 'USD' || paidCents !== pending.amountCents)) {
      await recordPaymentIssue(db, 'paypal', id, 'amount-mismatch', 'expected ' + pending.amountCents + ' got ' + paidCents);
      return reply(res, 500, { success: false, error: 'Your payment went through but we need to check your order. Please email nikora.support@gmail.com and we will fix it right away.' });
    }

    /* 3. Firebase -> CJ -> Resend (idempotent) */
    const order = await finalizePaidOrder(db, { provider: 'paypal', ref: id, payment: { method: 'paypal', reference: id, captureId: capture.id, amountCents: pending ? pending.amountCents : paidCents } });
    return reply(res, 200, order);
  } catch (e) {
    if (e.message === 'pending-missing') { await recordPaymentIssue(db, 'paypal', id, 'no-pending-checkout', 'captured but no cart saved'); }
    console.error('paypal-capture failed:', e.message);
    return reply(res, 500, { success: false, error: 'Your payment was received but we are still finishing your order. Please retry, or email nikora.support@gmail.com.' });
  }
}

module.exports = handler;
