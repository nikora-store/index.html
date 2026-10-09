/**
 * Shared helpers for the NIKORA order pipeline (Vercel Serverless, Node 18+).
 * Lives in /lib (not /api) so Vercel does not expose it as a public route.
 */
'use strict';

const crypto = require('crypto');

const SITE_URL = (process.env.SITE_URL || 'https://nikora-store.vercel.app').replace(/\/+$/, '');
const DB_URL = (process.env.FIREBASE_DB_URL || 'https://nikora-store-default-rtdb.firebaseio.com').replace(/\/+$/, '');

/* ---------- Firebase Admin (server-side, bypasses security rules) ---------- */
let _db = null;
function getDb() {
  if (_db) return _db;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    let raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    raw = raw.trim();
    if (raw[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8');   // base64 form is accepted too
    const sa = JSON.parse(raw);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: DB_URL });
  }
  _db = admin.database();
  return _db;
}

/* ---------- tiny helpers ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, max = 100000) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : 0; };
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/.test(e);
const httpsUrl = (u, max = 600) => { try { const x = new URL(String(u)); return x.protocol === 'https:' && String(u).length <= max ? x.toString() : ''; } catch (e) { return ''; } };
const maskEmail = (e) => String(e).replace(/^(.).*(@.*)$/, '$1***$2');
const safeEq = (a, b) => crypto.timingSafeEqual(Buffer.from(sha256(a)), Buffer.from(sha256(b)));
const parseOrderId = (v) => { const m = /^#?(NK-\d{4})$/i.exec(String(v || '').trim()); return m ? m[1].toUpperCase() : null; };

function addBusinessDays(ts, n) {
  const d = new Date(ts); let added = 0;
  while (added < n) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) added++; }
  return d;
}

function reply(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(body));
}

async function timedFetch(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); } finally { clearTimeout(t); }
}

/* Browsers may only call our APIs from our own site (server-to-server callers send no Origin header). */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (e) { return false; }
}

/* ---------- countries (names used by the checkout <select> <-> ISO 3166-1 alpha-2) ---------- */
const COUNTRIES = { US:'United States', CA:'Canada', GB:'United Kingdom', IE:'Ireland', AU:'Australia', NZ:'New Zealand', DE:'Germany', FR:'France', ES:'Spain',
  IT:'Italy', NL:'Netherlands', BE:'Belgium', CH:'Switzerland', AT:'Austria', SE:'Sweden', NO:'Norway', DK:'Denmark', FI:'Finland', PL:'Poland', CZ:'Czechia',
  PT:'Portugal', GR:'Greece', RO:'Romania', HU:'Hungary', UA:'Ukraine', LT:'Lithuania', LV:'Latvia', EE:'Estonia', AE:'United Arab Emirates', SA:'Saudi Arabia',
  IL:'Israel', TR:'Turkey', IN:'India', JP:'Japan', KR:'South Korea', SG:'Singapore', HK:'Hong Kong', MY:'Malaysia', TH:'Thailand', PH:'Philippines',
  ID:'Indonesia', MX:'Mexico', BR:'Brazil', AR:'Argentina', CL:'Chile', CO:'Colombia', ZA:'South Africa', EG:'Egypt' };
const NAME_TO_ISO = Object.keys(COUNTRIES).reduce((m, k) => { m[COUNTRIES[k].toLowerCase()] = k; return m; }, { usa: 'US', uk: 'GB', 'czech republic': 'CZ', turkiye: 'TR', 'türkiye': 'TR' });
/** "United States" | "us" -> "US"  ('' when unknown) */
const countryCode = (v) => { const s = String(v || '').trim(); if (/^[A-Za-z]{2}$/.test(s) && COUNTRIES[s.toUpperCase()]) return s.toUpperCase(); return NAME_TO_ISO[s.toLowerCase()] || ''; };
/** "US" | "United States" -> "United States"  (unknown values are passed through, clipped) */
const countryName = (v) => { const c = countryCode(v); return c ? COUNTRIES[c] : clip(v, 60); };

module.exports = {
  COUNTRIES, countryCode, countryName,
  SITE_URL, DB_URL, getDb, sha256, clip, num, validEmail, httpsUrl, maskEmail, safeEq, parseOrderId,
  addBusinessDays, reply, timedFetch, sameOrigin
};
