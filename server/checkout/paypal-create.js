/**
 * POST /api/checkout/paypal-create
 * Called from the PayPal button's createOrder(). Same body as create-stripe-intent.
 * Validates the cart and creates the PayPal order for the amount the SERVER calculated, then saves the
 * validated cart as a pending checkout. Returns { success: true, id } (the PayPal order id).
 */
'use strict';

const { getDb, reply, sameOrigin, countryCode } = require('../../lib/common');
const { cleanInput, priceCart, savePending } = require('../../lib/orders');
const { ppFetch } = require('../../lib/paypal');

const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { success: false, error: 'Method not allowed.' }); }
  if (!sameOrigin(req)) return reply(res, 403, { success: false, error: 'Origin not allowed.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const input = cleanInput(body);
  if (input.error) return reply(res, 400, { success: false, error: input.error });

  let db;
  try { db = getDb(); } catch (e) { console.error('config error:', e.message); return reply(res, 500, { success: false, error: 'Payments are not configured.' }); }

  try {
    const cart = await priceCart(db, input);
    if (cart.error) return reply(res, 400, { success: false, error: cart.error });
    if (cart.conflict) return reply(res, 409, { success: false, error: cart.conflict });

    const a = input.customer.address, iso = countryCode(a.country);
    const p = cart.pricing;
    const unit = {
      description: 'NIKORA order',
      amount: {
        currency_code: 'USD', value: money(cart.total),
        breakdown: { item_total: { currency_code: 'USD', value: money(p.subtotal) }, tax_total: { currency_code: 'USD', value: money(p.tax) },
                     discount: { currency_code: 'USD', value: money(p.discount) }, shipping: { currency_code: 'USD', value: '0.00' } }
      },
      items: cart.items.map((i) => ({ name: i.title.slice(0, 127), quantity: String(i.qty), unit_amount: { currency_code: 'USD', value: money(i.price) }, category: 'PHYSICAL_GOODS' }))
    };
    if (iso) unit.shipping = { type: 'SHIPPING', name: { full_name: input.customer.name.slice(0, 300) },
      address: { address_line_1: a.line1, address_line_2: a.line2 || undefined, admin_area_2: a.city, admin_area_1: a.state || undefined, postal_code: a.postalCode || undefined, country_code: iso } };

    const order = await ppFetch('/v2/checkout/orders', { method: 'POST', requestId: 'nk-create-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10), body: {
      intent: 'CAPTURE', purchase_units: [unit],
      application_context: { brand_name: 'NIKORA', user_action: 'PAY_NOW', shipping_preference: iso ? 'SET_PROVIDED_ADDRESS' : 'NO_SHIPPING',
                             payment_method: { payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED' } }
    } });
    if (order.status >= 300 || !order.body.id) { console.error('PayPal create failed', order.status, JSON.stringify(order.body).slice(0, 400)); return reply(res, 502, { success: false, error: 'PayPal is unavailable right now. Please try again or pay by card.' }); }

    await savePending(db, 'paypal', order.body.id, input, cart);
    return reply(res, 200, { success: true, id: order.body.id });
  } catch (e) {
    console.error('paypal-create failed:', e.message);
    return reply(res, 500, { success: false, error: 'We could not start your PayPal payment. Please try again.' });
  }
}

module.exports = handler;
