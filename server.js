// Haven Goods - e-commerce website
// Run locally: npm install  then  npm start  ->  http://localhost:3000
// On Vercel the same app runs as a serverless function (see api/index.js and vercel.json).
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const { all, get, UPLOAD_DIR } = require('./db');
const { STORE, ORDER_STATUSES, PAYMENT_LABELS, money, discount, compact } = require('./lib/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const ON_VERCEL = !!process.env.VERCEL;

if (ON_VERCEL && !process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set: logins will not survive across server instances.');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // behind Vercel's proxy: lets secure cookies and https links work

// Static files. s-maxage lets Vercel's CDN cache them too.
const staticOptions = { maxAge: '1d', setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400') };
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/uploads', express.static(UPLOAD_DIR, staticOptions));
app.use(express.urlencoded({ extended: true }));

// The session (login + cart) is kept in a signed cookie, so it works no matter
// which server instance handles the request.
app.use(cookieSession({
  name: 'hg_session',
  keys: [process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex')],
  maxAge: 1000 * 60 * 60 * 24,
  httpOnly: true,
  sameSite: 'lax',
  secure: ON_VERCEL,
}));

// Values available in every view
app.use((req, res, next) => {
  // If the database was rebuilt (fresh server instance), forget a login whose account no longer exists
  if (req.session.user && !get('SELECT id FROM users WHERE id = ? AND email = ?', req.session.user.id, req.session.user.email)) {
    delete req.session.user;
    req.session.flash = { type: 'info', text: 'Your session has expired. Please log in again.' };
  }
  const cart = req.session.cart || {};
  res.locals.store = STORE;
  res.locals.money = money;
  res.locals.discount = discount;
  res.locals.compact = compact;
  res.locals.paymentLabels = PAYMENT_LABELS;
  res.locals.statuses = ORDER_STATUSES;
  res.locals.user = req.session.user || null;
  res.locals.cartCount = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
  res.locals.wishCount = req.session.user
    ? get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', req.session.user.id).n : 0;
  res.locals.navCategories = all('SELECT id, name FROM categories ORDER BY id');
  res.locals.path = req.path;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.use('/', require('./routes/shop'));
app.use('/', require('./routes/auth'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('message', { title: 'Page not found', heading: 'Page not found',
    text: 'The page you were looking for does not exist.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('message', { title: 'Error', heading: 'Something went wrong',
    text: err.message || 'Please try again.' });
});

// Start a normal web server when run with "npm start" (Vercel imports the app instead)
if (require.main === module) {
  app.listen(PORT, () => console.log(`${STORE.name} running at http://localhost:${PORT}`));
}

module.exports = app;
