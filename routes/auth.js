// Customer registration, login, logout and "My Account" (orders, tracking, profile)
const router = require('express').Router();
const { get, all, run, transaction } = require('../db');
const { hashPassword, verifyPassword, flash, requireLogin } = require('../lib/helpers');

function sessionUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('register', { title: 'Create Account', form: {}, errors: [] });
});

router.post('/register', (req, res) => {
  const form = {
    name: (req.body.name || '').trim(),
    email: (req.body.email || '').trim().toLowerCase(),
    phone: (req.body.phone || '').trim(),
    address: (req.body.address || '').trim(),
    city: (req.body.city || '').trim(),
  };
  const { password = '', confirm = '' } = req.body;
  const errors = [];
  if (form.name.length < 2) errors.push('Please enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.push('Please enter a valid email address.');
  if (form.phone.replace(/\D/g, '').length < 10) errors.push('Please enter a valid phone number.');
  if (password.length < 6) errors.push('Password must be at least 6 characters.');
  if (password !== confirm) errors.push('Passwords do not match.');
  if (!errors.length && get('SELECT id FROM users WHERE email = ?', form.email)) {
    errors.push('An account with this email already exists. Please log in.');
  }
  if (errors.length) {
    return res.status(400).render('register', { title: 'Create Account', form, errors });
  }

  const result = run(`INSERT INTO users (name, email, password_hash, phone, address, city, role)
                      VALUES (?, ?, ?, ?, ?, ?, 'customer')`,
  form.name, form.email, hashPassword(password), form.phone, form.address, form.city);
  const user = get('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid));
  const returnTo = req.session.returnTo;
  delete req.session.returnTo;
  req.session.user = sessionUser(user); // the guest cart is kept
  flash(req, 'success', `Welcome, ${user.name}! Your account has been created.`);
  res.redirect(returnTo || '/account');
});

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/account');
  res.render('login', { title: 'Log In', email: '', error: null });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(req.body.password || '', user.password_hash)) {
    return res.status(401).render('login', { title: 'Log In', email, error: 'Incorrect email or password.' });
  }
  // Keep the guest cart and send the user back to the page they were trying to reach
  const returnTo = req.session.returnTo;
  delete req.session.returnTo;
  req.session.user = sessionUser(user);
  flash(req, 'success', `Welcome back, ${user.name}!`);
  res.redirect(returnTo || (user.role === 'admin' ? '/admin' : '/account'));
});

router.post('/logout', (req, res) => {
  req.session = null; // clears the session cookie
  res.redirect('/');
});

router.get('/account', requireLogin, (req, res) => {
  const customer = get('SELECT * FROM users WHERE id = ?', req.session.user.id);
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', req.session.user.id);
  for (const o of orders) o.items = all('SELECT * FROM order_items WHERE order_id = ?', o.id);
  const wishCount = get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', req.session.user.id).n;
  res.render('account', { title: 'My Account', customer, orders, wishCount });
});

router.post('/account', requireLogin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (name.length < 2) {
    flash(req, 'error', 'Please enter your full name.');
    return res.redirect('/account#profile');
  }
  run('UPDATE users SET name = ?, phone = ?, address = ?, city = ? WHERE id = ?',
    name, (req.body.phone || '').trim(), (req.body.address || '').trim(),
    (req.body.city || '').trim(), req.session.user.id);
  req.session.user.name = name;
  flash(req, 'success', 'Your details have been saved.');
  res.redirect('/account#profile');
});

// Order details with tracking timeline (also the "order placed" confirmation page)
router.get('/account/orders/:id', requireLogin, (req, res, next) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?',
    Number(req.params.id), req.session.user.id);
  if (!order) return next();
  const items = all('SELECT * FROM order_items WHERE order_id = ?', order.id);
  const history = all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at, id', order.id);
  res.render('order', { title: `Order #${order.id}`, order, items, history, placed: !!req.query.placed });
});

// Customers can cancel an order while it is still pending
router.post('/account/orders/:id/cancel', requireLogin, (req, res, next) => {
  const order = get('SELECT * FROM orders WHERE id = ? AND user_id = ?',
    Number(req.params.id), req.session.user.id);
  if (!order) return next();
  if (order.status !== 'Pending') {
    flash(req, 'error', 'This order is already being processed and can no longer be cancelled.');
  } else {
    transaction(() => {
      for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
        if (item.product_id) {
          run('UPDATE products SET stock = stock + ?, sold_count = MAX(0, sold_count - ?) WHERE id = ?',
            item.quantity, item.quantity, item.product_id);
        }
      }
      const payment = order.payment_method === 'COD' ? order.payment_status : 'Refunded (demo)';
      run("UPDATE orders SET status = 'Cancelled', payment_status = ? WHERE id = ?", payment, order.id);
      run("INSERT INTO order_status_history (order_id, status, note) VALUES (?, 'Cancelled', 'Cancelled by customer')", order.id);
    });
    flash(req, 'success', `Order #${order.id} has been cancelled.`);
  }
  res.redirect(`/account/orders/${order.id}`);
});

module.exports = router;
