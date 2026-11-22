// Checkout: order summary, customer details, payment method, place order
const router = require('express').Router();
const { get, run, transaction } = require('../db');
const { flash, requireLogin } = require('../lib/helpers');
const { buildCart } = require('./cart');

router.use(requireLogin);

router.get('/', (req, res) => {
  const cart = buildCart(req.session.cart);
  if (!cart.items.length) {
    flash(req, 'info', 'Your cart is empty.');
    return res.redirect('/cart');
  }
  const customer = get('SELECT * FROM users WHERE id = ?', req.session.user.id);
  res.render('checkout', { title: 'Checkout', cart, form: { ...customer, payment_method: 'COD' }, errors: [] });
});

router.post('/', (req, res) => {
  const cart = buildCart(req.session.cart);
  if (!cart.items.length) return res.redirect('/cart');

  const form = {
    name: (req.body.name || '').trim(),
    email: (req.body.email || '').trim(),
    phone: (req.body.phone || '').trim(),
    address: (req.body.address || '').trim(),
    city: (req.body.city || '').trim(),
    notes: (req.body.notes || '').trim(),
    payment_method: ['CARD', 'WALLET'].includes(req.body.payment_method) ? req.body.payment_method : 'COD',
  };
  const errors = [];
  if (!form.name) errors.push('Full name is required.');
  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.push('A valid email is required.');
  if (form.phone.replace(/\D/g, '').length < 10) errors.push('A valid phone number is required.');
  if (!form.address) errors.push('Delivery address is required.');
  if (!form.city) errors.push('City is required.');
  for (const item of cart.items) {
    if (item.quantity > item.product.stock) {
      errors.push(`Only ${item.product.stock} of "${item.product.name}" left in stock.`);
    }
  }
  if (errors.length) {
    return res.status(400).render('checkout', { title: 'Checkout', cart, form, errors });
  }

  // Online payment options are demonstrations only: no card or wallet details are
  // sent to the server or stored. The order is simply marked "Paid (demo)".
  const paymentStatus = form.payment_method === 'COD' ? 'Unpaid' : 'Paid (demo)';

  const orderId = transaction(() => {
    const result = run(`
      INSERT INTO orders (user_id, customer_name, email, phone, address, city,
        payment_method, payment_status, status, subtotal, shipping, total, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?)`,
      req.session.user.id, form.name, form.email, form.phone, form.address, form.city,
      form.payment_method, paymentStatus, cart.subtotal, cart.shipping, cart.total,
      form.notes || null);
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

  req.session.cart = {};
  res.redirect(`/account/orders/${orderId}?placed=1`);
});

module.exports = router;
