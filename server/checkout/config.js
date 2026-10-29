/**
 * GET /api/checkout/config
 * checkout.html is a static page, so it cannot read process.env. This returns ONLY values that are meant to be public
 * (Stripe publishable key, PayPal client id, optional Google Places browser key). Secrets are never returned.
 */
'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || '',
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || ''
  });
};
