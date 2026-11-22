// Shopping cart, stored in the session as { productId: quantity }
const router = require('express').Router();
const { all, get } = require('../db');
const { flash, shippingFor } = require('../lib/helpers');

// Builds the cart lines with current product data and totals.
function buildCart(sessionCart) {
  const cart = sessionCart || {};
  const ids = Object.keys(cart).map(Number);
  if (!ids.length) return { items: [], subtotal: 0, shipping: 0, total: 0, count: 0, savings: 0 };

  const products = all(`SELECT p.*, c.name AS category_name FROM products p
    JOIN categories c ON c.id = p.category_id WHERE p.id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const items = products.map((p) => {
    const quantity = cart[p.id];
    return { product: p, quantity, lineTotal: p.price * quantity };
  });
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const savings = items.reduce((s, i) => s + (i.product.old_price > i.product.price
    ? (i.product.old_price - i.product.price) * i.quantity : 0), 0);
  const shipping = shippingFor(subtotal);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  return { items, subtotal, shipping, total: subtotal + shipping, count, savings };
}

function backTo(req, fallback) {
  const ref = req.get('Referer');
  return ref && ref.startsWith(`${req.protocol}://${req.get('host')}`) ? ref : fallback;
}

router.get('/', (req, res) => {
  // Remove products that were deleted by the admin since they were added
  const cart = buildCart(req.session.cart);
  req.session.cart = Object.fromEntries(cart.items.map((i) => [i.product.id, i.quantity]));
  res.render('cart', { title: 'Shopping Cart', cart });
});

router.post('/add', (req, res) => {
  const id = Number(req.body.product_id);
  const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const product = get('SELECT * FROM products WHERE id = ?', id);
  if (!product) {
    flash(req, 'error', 'Product not found.');
    return res.redirect('/products');
  }
  const cart = req.session.cart || {};
  const newQty = Math.min((cart[id] || 0) + qty, product.stock);
  if (newQty <= 0) {
    flash(req, 'error', `${product.name} is out of stock.`);
    return res.redirect(backTo(req, '/products'));
  }
  cart[id] = newQty;
  req.session.cart = cart;
  flash(req, 'success', `${product.name} added to your cart.`);
  res.redirect(req.body.buy_now ? '/cart' : backTo(req, '/products'));
});

router.post('/update', (req, res) => {
  const cart = req.session.cart || {};
  // Fields are named qty_<productId>, e.g. qty_5=3
  for (const [field, value] of Object.entries(req.body)) {
    if (!field.startsWith('qty_')) continue;
    const id = field.slice(4);
    const qty = parseInt(value, 10);
    const product = get('SELECT stock FROM products WHERE id = ?', Number(id));
    if (!product || !qty || qty <= 0) delete cart[id];
    else cart[id] = Math.min(qty, product.stock);
  }
  req.session.cart = cart;
  flash(req, 'success', 'Cart updated.');
  res.redirect('/cart');
});

router.post('/remove/:id', (req, res) => {
  const cart = req.session.cart || {};
  delete cart[req.params.id];
  req.session.cart = cart;
  flash(req, 'success', 'Item removed from cart.');
  res.redirect('/cart');
});

router.post('/clear', (req, res) => {
  req.session.cart = {};
  res.redirect('/cart');
});

module.exports = router;
module.exports.buildCart = buildCart;
