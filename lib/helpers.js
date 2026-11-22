const crypto = require('crypto');

const STORE = {
  name: 'Haven Goods',
  tagline: 'Shop more, pay less',
  currency: 'Rs.',
  phone: '0300-0000000',
  email: 'support@havengoods.test',
  address: 'Main Bazaar, Lahore',
  freeShippingOver: 5000,
  shippingFee: 200,
};

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
const STATUS_NOTES = {
  Pending: 'Order placed',
  Processing: 'Seller is packing your order',
  Shipped: 'Handed over to courier',
  Delivered: 'Package delivered',
  Cancelled: 'Order cancelled',
};
const PAYMENT_LABELS = { COD: 'Cash on Delivery', CARD: 'Card (demo)', WALLET: 'Mobile Wallet (demo)' };

// Product query with category name, average rating and review count
const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name,
    (SELECT ROUND(AVG(r.rating), 1) FROM reviews r WHERE r.product_id = p.id) AS rating,
    (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id) AS review_count
  FROM products p JOIN categories c ON c.id = p.category_id`;

function money(n) {
  return `${STORE.currency} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function discount(p) {
  return p.old_price && p.old_price > p.price ? Math.round((1 - p.price / p.old_price) * 100) : 0;
}

function compact(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')}k` : String(n || 0);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

function shippingFor(subtotal) {
  if (subtotal <= 0) return 0;
  return subtotal >= STORE.freeShippingOver ? 0 : STORE.shippingFee;
}

// Flash messages: set in one request, shown on the next page.
function flash(req, type, text) {
  req.session.flash = { type, text };
}

function sameSiteReferer(req) {
  const ref = req.get('Referer');
  const origin = `${req.protocol}://${req.get('host')}`;
  return ref && ref.startsWith(origin) ? ref.slice(origin.length) || '/' : null;
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.returnTo = req.method === 'GET' ? req.originalUrl : (sameSiteReferer(req) || '/');
  flash(req, 'info', 'Please log in or create an account to continue.');
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  flash(req, 'error', 'Admin access only. Please log in with an admin account.');
  res.redirect('/login');
}

module.exports = {
  STORE, ORDER_STATUSES, STATUS_NOTES, PAYMENT_LABELS, PRODUCT_SELECT,
  money, discount, compact, hashPassword, verifyPassword, shippingFor,
  flash, sameSiteReferer, requireLogin, requireAdmin,
};
