// Haven Goods - e-commerce website
// Run locally: npm install  then  npm start  ->  http://localhost:3000
// On Vercel the same app runs as a serverless function (see api/index.js and vercel.json).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const { all, get, UPLOAD_DIR } = require('./db');
const { STORE, ORDER_STATUSES, PAYMENT_LABELS, money, discount, compact } = require('./lib/helpers');
const { securityHeaders, csrfProtection } = require('./lib/security');

const app = express();
const PORT = process.env.PORT || 3000;
const ON_VERCEL = !!process.env.VERCEL;
const IS_PROD = ON_VERCEL || process.env.NODE_ENV === 'production';

if (ON_VERCEL && !process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set: logins will not survive across server instances.');
}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // behind Vercel's proxy: lets secure cookies, req.ip and https links work

app.use(securityHeaders);

// Static files. CSS/JS links carry a content hash (?v=...), so browsers may cache them for a year;
// a new deploy changes the hash. Images are cached for a week.
const ASSET_VERSION = crypto.createHash('md5')
  .update(fs.readFileSync(path.join(__dirname, 'public/css/style.css')))
  .update(fs.readFileSync(path.join(__dirname, 'public/js/main.js')))
  .digest('hex').slice(0, 10);
const staticOptions = {
  setHeaders(res, filePath) {
    const longLived = /[\\/](css|js)[\\/]/.test(filePath);
    res.setHeader('Cache-Control', longLived
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=604800, s-maxage=604800');
  },
};
app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/uploads', express.static(UPLOAD_DIR, staticOptions));
app.use(express.urlencoded({ extended: true, limit: '50kb', parameterLimit: 200 }));

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

const PRIVATE_PAGES = /^\/(admin|account|cart|checkout|wishlist|login|register)(\/|$)/;

// Values available in every view
app.use((req, res, next) => {
  if (req.session.user) {
    // Always use the current account data from the database (e.g. if an admin's role changed).
    // If the database was rebuilt (fresh server instance) and the account is gone, log out.
    const account = get('SELECT id, name, email, role FROM users WHERE id = ? AND email = ?', req.session.user.id, req.session.user.email);
    if (account) {
      req.session.user = { id: account.id, name: account.name, email: account.email, role: account.role };
    } else {
      delete req.session.user;
      req.session.flash = { type: 'info', text: 'Your session has expired. Please log in again.' };
    }
  }
  const cart = req.session.cart || {};
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.locals.store = STORE;
  res.locals.money = money;
  res.locals.discount = discount;
  res.locals.compact = compact;
  res.locals.paymentLabels = PAYMENT_LABELS;
  res.locals.statuses = ORDER_STATUSES;
  res.locals.user = req.session.user || null;
  res.locals.cartCount = Object.values(cart).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  res.locals.wishCount = req.session.user
    ? get('SELECT COUNT(*) AS n FROM wishlist WHERE user_id = ?', req.session.user.id).n : 0;
  res.locals.navCategories = all('SELECT id, name FROM categories ORDER BY id');
  res.locals.path = req.path;
  // SEO
  res.locals.assetVersion = ASSET_VERSION;
  res.locals.baseUrl = baseUrl;
  res.locals.canonical = baseUrl + (req.path === '/products' && req.query.category
    ? `/products?category=${Number(req.query.category) || ''}` : req.path);
  res.locals.description = `${STORE.name} - shop electronics, fashion, shoes, books, home and beauty products online in Pakistan with cash on delivery and free delivery over ${money(STORE.freeShippingOver)}.`;
  res.locals.ogImage = `${baseUrl}/images/og-image.png`;
  res.locals.noindex = PRIVATE_PAGES.test(req.path);
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// Block form posts that come from other websites (CSRF)
app.use(csrfProtection);

app.use('/', require('./routes/shop'));
app.use('/', require('./routes/auth'));
app.use('/cart', require('./routes/cart'));
app.use('/checkout', require('./routes/checkout'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('message', {
    title: 'Page not found', heading: 'Page not found', noindex: true,
    text: 'The page you were looking for does not exist. It may have been moved or removed.',
  });
});

// Error handler (Express recognises it by its 4 arguments)
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  // Show friendly messages only; never internal details such as SQL errors
  const text = status === 413 ? 'The form you sent was too large.'
    : status < 500 && err.expose ? err.message
      : 'Sorry, something went wrong on our side. Please try again.';
  // If the error happened before the page values were prepared, provide safe defaults
  Object.assign(res.locals, {
    store: STORE, money, discount, compact, paymentLabels: PAYMENT_LABELS, statuses: ORDER_STATUSES,
    user: res.locals.user || null, cartCount: res.locals.cartCount || 0, wishCount: res.locals.wishCount || 0,
    navCategories: res.locals.navCategories || [], path: req.path, flash: null, assetVersion: ASSET_VERSION,
    baseUrl: res.locals.baseUrl || '', canonical: res.locals.canonical || '', description: res.locals.description || '',
    ogImage: res.locals.ogImage || '',
  });
  res.status(status).render('message', {
    title: 'Error', heading: status === 413 ? 'Request too large' : 'Something went wrong', text, noindex: true,
  }, (renderErr, html) => {
    if (renderErr) { console.error(renderErr); return res.type('text').send(text); }
    res.send(html);
  });
});

// Start a normal web server when run with "npm start" (Vercel imports the app instead)
if (require.main === module) {
  app.listen(PORT, () => console.log(`${STORE.name} running at http://localhost:${PORT}${IS_PROD ? ' (production mode)' : ''}`));
}

module.exports = app;
