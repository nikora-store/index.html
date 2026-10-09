/**
 * POST /api/checkout/create-stripe-intent
 * Called by checkout.html when the customer presses Pay (card) or confirms Apple Pay / Google Pay.
 * Body: { customer, items: [{ id, variant?, quantity }], pricing: { promoCode }, total, notes }
 *   1. validates the customer + cart and calculates the total ON THE SERVER: prices come from lib/products.js
 *      (PRODUCTS_CATALOG), never from the browser; then promo code and tax
 *   2. creates a Stripe PaymentIntent for exactly that amount
 *   3. saves the validated cart as a pending checkout (the Stripe webhook turns it into an order once paid)
 * Returns { success: true, clientSecret, paymentIntentId, amount }.
 * ENV: STRIPE_SECRET_KEY, FIREBASE_SERVICE_ACCOUNT
 */
'use strict';

const { getDb, reply, sameOrigin, countryCode } = require('../../lib/common');
const { cleanInput, priceCart, savePending, cents } = require('../../lib/orders');
const { getStripe } = require('../../lib/stripe');

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { success: false, error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return reply(res, 403, { success: false, error: 'Origin not allowed.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const input = cleanInput(body);
  if (input.error) return reply(res, 400, { success: false, error: input.error });

  const iso = countryCode(input.customer.address.country);
  if (!iso) return reply(res, 400, { success: false, error: 'Sorry, we cannot ship to that country yet.' });

  let db, stripe;
  try { db = getDb(); stripe = getStripe(); } catch (e) { console.error('config error:', e.message); return reply(res, 500, { success: false, error: 'Payments are not configured.' }); }

  try {
    const cart = await priceCart(db, input);
    if (cart.error) return reply(res, 400, { success: false, error: cart.error });
    if (cart.conflict) return reply(res, 409, { success: false, error: cart.conflict });

    const a = input.customer.address;
    const pi = await stripe.paymentIntents.create({
      amount: cents(cart.total), currency: 'usd',
      payment_method_types: ['card'],                                   // cards + Apple Pay + Google Pay all travel as "card"
      description: 'NIKORA order',
      shipping: { name: input.customer.name, phone: input.customer.phone || undefined,
                  address: { line1: a.line1, line2: a.line2 || undefined, city: a.city, state: a.state || undefined, postal_code: a.postalCode || undefined, country: iso } },
      metadata: { source: 'nikora-checkout', items: String(cart.items.reduce((n, i) => n + i.qty, 0)) }
    });
    await savePending(db, 'stripe', pi.id, input, cart);

    return reply(res, 200, { success: true, clientSecret: pi.client_secret, paymentIntentId: pi.id, amount: cart.total });
  } catch (e) {
    console.error('create-stripe-intent failed:', e.message);
    return reply(res, 500, { success: false, error: 'We could not start your payment. Please try again.' });
  }
}

module.exports = handler;
