// Checkout: order summary, customer details, payment method, place order
const crypto = require('crypto');
const router = require('express').Router();
const { get, run, transaction } = require('../db');
const { flash, requireLogin, clean, LIMITS, EMAIL_RE } = require('../lib/helpers');
const { buildCart } = require('./cart');

router.use(requireLogin);

// Each checkout page gets a one-time token. The orders table stores it with a
// UNIQUE constraint, so a double click or a retried request cannot create the
// same order twice.
function newCheckoutToken(req) {
  req.session.checkoutToken = crypto.randomUUID();
  return req.session.checkoutToken;
}

router.get('/', (req, res) => {
  const cart = buildCart(req.session.cart);
  if (!cart.items.length) {
    flash(req, 'info', 'Your cart is empty.');
    return res.redirect('/cart');
  }
  if (cart.problems) {
    flash(req, 'error', 'Some items in your cart are no longer available in that quantity.');
    return res.redirect('/cart');
  }
  const customer = get('SELECT * FROM users WHERE id = ?', req.session.user.id);
  res.render('checkout', {
    title: 'Checkout', cart, form: { ...customer, payment_method: 'COD' }, errors: [], checkoutToken: newCheckoutToken(req),
  });
});

router.post('/', (req, res) => {
  const userId = req.session.user.id;
  const token = clean(req.body.checkout_token, 64);

  // Same checkout submitted again (double click / retry): show the order that was already placed
  const existing = token && get('SELECT id FROM orders WHERE checkout_token = ? AND user_id = ?', token, userId);
  if (existing) return res.redirect(`/account/orders/${existing.id}?placed=1`);

  const cart = buildCart(req.session.cart);
  if (!cart.items.length) return res.redirect('/cart');
  if (!token || token !== req.session.checkoutToken) {
    flash(req, 'error', 'Your checkout session expired. Please review your order and try again.');
    return res.redirect('/checkout');
  }

  const form = {
    name: clean(req.body.name, LIMITS.name),
    email: clean(req.body.email, LIMITS.email),
    phone: clean(req.body.phone, LIMITS.phone),
    address: clean(req.body.address, LIMITS.address),
    city: clean(req.body.city, LIMITS.city),
    notes: clean(req.body.notes, LIMITS.notes),
    payment_method: ['CARD', 'WALLET'].includes(req.body.payment_method) ? req.body.payment_method : 'COD',
  };
  const errors = [];
  if (form.name.length < 2) errors.push('Full name is required.');
  if (!EMAIL_RE.test(form.email)) errors.push('A valid email is required.');
  if (form.phone.replace(/\D/g, '').length < 10) errors.push('A valid phone number is required.');
  if (!form.address) errors.push('Delivery address is required.');
  if (!form.city) errors.push('City is required.');
  for (const item of cart.items) {
    if (item.quantity > item.product.stock) {
      errors.push(`Only ${item.product.stock} of "${item.product.name}" left in stock.`);
    }
  }
  if (errors.length) {
    return res.status(400).render('checkout', { title: 'Checkout', cart, form, errors, checkoutToken: token });
  }

  // Online payment options are demonstrations only: no card or wallet details are
  // sent to the server or stored. The order is simply marked "Paid (demo)".
  const paymentStatus = form.payment_method === 'COD' ? 'Unpaid' : 'Paid (demo)';

  let orderId;
  try {
    orderId = transaction(() => {
      const result = run(`
        INSERT INTO orders (user_id, customer_name, email, phone, address, city,
          payment_method, payment_status, status, subtotal, shipping, total, notes, checkout_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?)`,
      userId, form.name, form.email, form.phone, form.address, form.city,
      form.payment_method, paymentStatus, cart.subtotal, cart.shipping, cart.total,
      form.notes || null, token);
      const id = Number(result.lastInsertRowid);
      for (const item of cart.items) {
        run(`INSERT INTO order_items (order_id, product_id, product_name, image, price, quantity)
             VALUES (?, ?, ?, ?, ?, ?)`, id, item.product.id, item.product.name, item.product.image,
        item.product.price, item.quantity);
        run('UPDATE products SET stock = stock - ?, sold_count = sold_count + ? WHERE id = ?',
          item.quantity, item.quantity, item.product.id);
      }
      run("INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'Pending', 'Order placed')", id);
      return id;
    });
  } catch (err) {
    // Another request with the same token won the race: show that order instead of failing
    const placed = /UNIQUE/.test(err.message) && get('SELECT id FROM orders WHERE checkout_token = ?', token);
    if (placed) return res.redirect(`/account/orders/${placed.id}?placed=1`);
    throw err;
  }

  req.session.cart = {};
  delete req.session.checkoutToken;
  res.redirect(`/account/orders/${orderId}?placed=1`);
});

module.exports = router;
