// Customer registration, login, logout and "My Account" (orders, tracking, profile, password)
const router = require('express').Router();
const { get, all, run, transaction } = require('../db');
const {
  hashPassword, verifyPassword, flash, requireLogin, safePath, clean, PASSWORD_MIN, LIMITS, EMAIL_RE,
} = require('../lib/helpers');
const { createLimiter } = require('../lib/security');

// Slow down password guessing and mass sign-ups
const loginLimiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 }); // 10 failed logins / 15 min
const registerLimiter = createLimiter({ max: 5, windowMs: 60 * 60 * 1000 }); // 5 accounts / hour
// Used when the email does not exist, so a wrong email takes as long as a wrong password
const DUMMY_HASH = hashPassword('not-a-real-password');

function sessionUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

function passwordErrors(password, confirm) {
  const errors = [];
  if (password.length < PASSWORD_MIN) errors.push(`Password must be at least ${PASSWORD_MIN} characters.`);
  if (password.length > LIMITS.password) errors.push(`Password must be at most ${LIMITS.password} characters.`);
  if (password !== confirm) errors.push('Passwords do not match.');
  return errors;
}

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/account');
  res.render('register', { title: 'Create Account', form: {}, errors: [] });
});

router.post('/register', (req, res) => {
  const form = {
    name: clean(req.body.name, LIMITS.name),
    email: clean(req.body.email, LIMITS.email).toLowerCase(),
    phone: clean(req.body.phone, LIMITS.phone),
    address: clean(req.body.address, LIMITS.address),
    city: clean(req.body.city, LIMITS.city),
  };
  const password = String(req.body.password || '');
  const confirm = String(req.body.confirm || '');
  if (registerLimiter.isBlocked(req.ip)) {
    return res.status(429).render('register', { title: 'Create Account', form,
      errors: ['Too many accounts have been created from your network. Please try again later.'] });
  }
  const errors = [];
  if (form.name.length < 2) errors.push('Please enter your full name.');
  if (!EMAIL_RE.test(form.email)) errors.push('Please enter a valid email address.');
  if (form.phone.replace(/\D/g, '').length < 10) errors.push('Please enter a valid phone number.');
  errors.push(...passwordErrors(password, confirm));
  if (!errors.length && get('SELECT id FROM users WHERE email = ?', form.email)) {
    errors.push('An account with this email already exists. Please log in.');
  }
  if (errors.length) {
    return res.status(400).render('register', { title: 'Create Account', form, errors });
  }

  const result = run(`INSERT INTO users (name, email, password_hash, phone, address, city, role)
                      VALUES (?, ?, ?, ?, ?, ?, 'customer')`,
  form.name, form.email, hashPassword(password), form.phone, form.address, form.city);
  registerLimiter.hit(req.ip);
  const user = get('SELECT * FROM users WHERE id = ?', Number(result.lastInsertRowid));
  const returnTo = safePath(req.session.returnTo);
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
  const email = clean(req.body.email, LIMITS.email).toLowerCase();
  const password = String(req.body.password || '').slice(0, LIMITS.password);
  const key = req.ip;
  if (loginLimiter.isBlocked(key)) {
    return res.status(429).render('login', { title: 'Log In', email, error: 'Too many failed login attempts. Please wait 15 minutes and try again.' });
  }
  const user = get('SELECT * FROM users WHERE email = ?', email);
  const valid = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid) {
    loginLimiter.hit(key);
    return res.status(401).render('login', { title: 'Log In', email, error: 'Incorrect email or password.' });
  }
  loginLimiter.reset(key);
  // Keep the guest cart and send the user back to the page they were trying to reach
  const returnTo = safePath(req.session.returnTo);
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
  const userId = req.session.user.id;
  const customer = get('SELECT * FROM users WHERE id = ?', userId);
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC', userId);
  // Load the items of all orders in one query
  const items = all(`SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.user_id = ? ORDER BY oi.id`, userId);
  for (const o of orders) o.items = items.filter((i) => i.order_id === o.id);
  const wishCount = get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', userId).n;
  res.render('account', { title: 'My Account', customer, orders, wishCount });
});

router.post('/account', requireLogin, (req, res) => {
  const name = clean(req.body.name, LIMITS.name);
  const phone = clean(req.body.phone, LIMITS.phone);
  if (name.length < 2) {
    flash(req, 'error', 'Please enter your full name.');
    return res.redirect('/account#profile');
  }
  if (phone && phone.replace(/\D/g, '').length < 10) {
    flash(req, 'error', 'Please enter a valid phone number.');
    return res.redirect('/account#profile');
  }
  run('UPDATE users SET name = ?, phone = ?, address = ?, city = ? WHERE id = ?',
    name, phone, clean(req.body.address, LIMITS.address), clean(req.body.city, LIMITS.city), req.session.user.id);
  req.session.user.name = name;
  flash(req, 'success', 'Your details have been saved.');
  res.redirect('/account#profile');
});

router.post('/account/password', requireLogin, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.session.user.id);
  const current = String(req.body.current_password || '');
  const errors = verifyPassword(current, user.password_hash) ? [] : ['Your current password is incorrect.'];
  if (!errors.length) errors.push(...passwordErrors(String(req.body.new_password || ''), String(req.body.confirm_password || '')));
  if (errors.length) {
    flash(req, 'error', errors.join(' '));
  } else {
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(req.body.new_password)), user.id);
    flash(req, 'success', 'Your password has been changed.');
  }
  res.redirect('/account#password');
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
