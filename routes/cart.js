// Shopping cart, stored in the session cookie as { productId: quantity }
const router = require('express').Router();
const { all, get } = require('../db');
const { flash, shippingFor, sameSiteReferer } = require('../lib/helpers');

const MAX_LINES = 30; // keeps the session cookie well under the 4 KB browser limit
const MAX_QTY = 99; // per product

// Builds the cart lines with current product data and totals.
function buildCart(sessionCart) {
  const cart = sessionCart || {};
  const ids = Object.keys(cart).map(Number).filter(Number.isInteger);
  if (!ids.length) return { items: [], subtotal: 0, shipping: 0, total: 0, count: 0, savings: 0, problems: 0 };

  const products = all(`SELECT p.*, c.name AS category_name FROM products p
    JOIN categories c ON c.id = p.category_id WHERE p.id IN (${ids.map(() => '?').join(',')}) ORDER BY p.id`, ...ids);
  const items = products
    .map((p) => {
      const quantity = Math.max(0, Math.min(MAX_QTY, parseInt(cart[p.id], 10) || 0));
      // stockProblem: the shop no longer has enough of this product
      return { product: p, quantity, lineTotal: p.price * quantity, stockProblem: quantity > p.stock };
    })
    .filter((i) => i.quantity > 0);
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const savings = items.reduce((s, i) => s + (i.product.old_price > i.product.price
    ? (i.product.old_price - i.product.price) * i.quantity : 0), 0);
  const shipping = shippingFor(subtotal);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const problems = items.filter((i) => i.stockProblem).length;
  return { items, subtotal, shipping, total: subtotal + shipping, count, savings, problems };
}

router.get('/', (req, res) => {
  // Drop products that were deleted by the admin (or emptied) since they were added
  const cart = buildCart(req.session.cart);
  req.session.cart = Object.fromEntries(cart.items.map((i) => [i.product.id, i.quantity]));
  res.render('cart', { title: 'Shopping Cart', cart });
});

router.post('/add', (req, res) => {
  const id = Number(req.body.product_id);
  const qty = Math.min(MAX_QTY, Math.max(1, parseInt(req.body.quantity, 10) || 1));
  const product = Number.isInteger(id) ? get('SELECT * FROM products WHERE id = ?', id) : null;
  const back = sameSiteReferer(req) || '/products';
  if (!product) {
    flash(req, 'error', 'Product not found.');
    return res.redirect('/products');
  }
  const cart = req.session.cart || {};
  if (!cart[id] && Object.keys(cart).length >= MAX_LINES) {
    flash(req, 'error', `Your cart can hold up to ${MAX_LINES} different products. Please check out or remove some items first.`);
    return res.redirect('/cart');
  }
  const newQty = Math.min((cart[id] || 0) + qty, product.stock, MAX_QTY);
  if (newQty <= 0) {
    flash(req, 'error', `${product.name} is out of stock.`);
    return res.redirect(back);
  }
  const capped = newQty < (cart[id] || 0) + qty;
  cart[id] = newQty;
  req.session.cart = cart;
  flash(req, capped ? 'info' : 'success', capped
    ? `Only ${newQty} of ${product.name} can be added (limited stock). Your cart has been updated.`
    : `${product.name} added to your cart.`);
  res.redirect(req.body.buy_now ? '/cart' : back);
});

router.post('/update', (req, res) => {
  const cart = req.session.cart || {};
  // Fields are named qty_<productId>, e.g. qty_5=3
  for (const [field, value] of Object.entries(req.body)) {
    if (!field.startsWith('qty_')) continue;
    const id = Number(field.slice(4));
    if (!Number.isInteger(id) || !(id in cart)) continue;
    const qty = parseInt(value, 10);
    const product = get('SELECT stock FROM products WHERE id = ?', id);
    const allowed = product ? Math.min(qty, product.stock, MAX_QTY) : 0;
    if (!allowed || allowed <= 0) delete cart[id];
    else cart[id] = allowed;
  }
  req.session.cart = cart;
  flash(req, 'success', 'Cart updated.');
  res.redirect('/cart');
});

router.post('/remove/:id', (req, res) => {
  const cart = req.session.cart || {};
  delete cart[Number(req.params.id)];
  req.session.cart = cart;
  flash(req, 'success', 'Item removed from cart.');
  res.redirect('/cart');
});

router.post('/clear', (req, res) => {
  req.session.cart = {};
  flash(req, 'success', 'Your cart is now empty.');
  res.redirect('/cart');
});

module.exports = router;
module.exports.buildCart = buildCart;
