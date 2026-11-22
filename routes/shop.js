// Public storefront: home page, product listing with filters, product page, reviews,
// wishlist, search API, robots.txt and sitemap.xml
const router = require('express').Router();
const { all, get, run } = require('../db');
const { PRODUCT_SELECT, STORE, flash, requireLogin, sameSiteReferer, clean } = require('../lib/helpers');

const PAGE_SIZE = 20;
const SORTS = {
  price_asc: 'price ASC, id ASC', price_desc: 'price DESC, id ASC', newest: 'created_at DESC, id DESC',
  rating: 'rating DESC, review_count DESC, id ASC', popular: 'sold_count DESC, id ASC',
};

// Query values can arrive as arrays (?q=a&q=b); use the first one as text
const one = (v) => String((Array.isArray(v) ? v[0] : v) ?? '');
// Search text is matched literally: % and _ are not wildcards
const likePattern = (text) => `%${text.replace(/[\\%_]/g, (c) => '\\' + c)}%`;

router.get('/', (req, res) => {
  // Flash sale: the biggest discount in each category
  const flashSale = all(`SELECT * FROM (
      SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.category_id ORDER BY x.off DESC) AS rn
      FROM (${PRODUCT_SELECT.replace('SELECT p.*,', 'SELECT p.*, (p.old_price - p.price) * 1.0 / p.old_price AS off,')}
            WHERE p.old_price > p.price AND p.stock > 0) x
    ) WHERE rn = 1 ORDER BY off DESC LIMIT 6`);
  const categories = all(`
    SELECT c.*, COUNT(p.id) AS product_count,
      (SELECT image FROM products WHERE category_id = c.id ORDER BY featured DESC, sold_count DESC LIMIT 1) AS image
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.id`);
  const featured = all(`${PRODUCT_SELECT} WHERE p.featured = 1 ORDER BY p.sold_count DESC LIMIT 12`);
  const forYou = all(`${PRODUCT_SELECT} ORDER BY (p.id * 37) % 61, p.id LIMIT 24`);
  const brands = all(`SELECT brand, COUNT(*) AS n, MIN(image) AS image FROM products
    WHERE brand IS NOT NULL AND category_id != 4 GROUP BY brand ORDER BY COUNT(*) DESC, SUM(sold_count) DESC LIMIT 8`);
  const banners = {
    phone: get(`${PRODUCT_SELECT} WHERE p.name LIKE 'iPhone 13%'`),
    laptop: get(`${PRODUCT_SELECT} WHERE p.name LIKE '%MacBook%'`),
    shoes: get(`${PRODUCT_SELECT} WHERE p.name LIKE '%Jordan%'`),
    book: get(`${PRODUCT_SELECT} WHERE p.name = 'Atomic Habits'`),
  };
  res.render('home', {
    title: 'Online Shopping in Pakistan', flashSale, categories, featured, forYou, brands, banners,
    description: `Shop original electronics, clothing, shoes, books, accessories, home and beauty products at ${STORE.name}. Flash deals, cash on delivery and free delivery over Rs. 5,000.`,
  });
});

router.get('/products', (req, res) => {
  const q = clean(one(req.query.q), 100);
  const sort = SORTS[one(req.query.sort)] ? one(req.query.sort) : '';
  const rating = [3, 4, 5].includes(Number(one(req.query.rating))) ? Number(one(req.query.rating)) : '';
  let min = Number(one(req.query.min)) > 0 ? Number(one(req.query.min)) : null;
  let max = Number(one(req.query.max)) > 0 ? Number(one(req.query.max)) : null;
  if (min && max && min > max) [min, max] = [max, min];
  const selectedBrands = [].concat(req.query.brand || []).map(String).filter(Boolean).slice(0, 20);
  const page = Math.max(1, parseInt(one(req.query.page), 10) || 1);

  // Base filters (category + search) decide which brands are offered
  const base = []; const baseParams = [];
  let activeCategory = null;
  if (req.query.category) {
    activeCategory = get('SELECT * FROM categories WHERE id = ?', Number(one(req.query.category)) || 0) || null;
    if (activeCategory) { base.push('p.category_id = ?'); baseParams.push(activeCategory.id); }
  }
  if (q) {
    base.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    const like = likePattern(q);
    baseParams.push(like, like, like, like);
  }
  const baseWhere = base.length ? `WHERE ${base.join(' AND ')}` : '';
  const brands = all(`SELECT p.brand, COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id
    ${baseWhere} ${base.length ? 'AND' : 'WHERE'} p.brand IS NOT NULL GROUP BY p.brand ORDER BY n DESC, p.brand LIMIT 15`, ...baseParams);

  const where = [...base]; const params = [...baseParams];
  if (selectedBrands.length) { where.push(`p.brand IN (${selectedBrands.map(() => '?').join(',')})`); params.push(...selectedBrands); }
  if (min) { where.push('p.price >= ?'); params.push(min); }
  if (max) { where.push('p.price <= ?'); params.push(max); }
  const outer = rating ? 'WHERE rating >= ?' : '';
  const outerParams = rating ? [rating] : [];
  const orderBy = SORTS[sort] || 'featured DESC, sold_count DESC, id ASC';

  const inner = `${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const total = get(`SELECT COUNT(*) AS n FROM (${inner}) ${outer}`, ...params, ...outerParams).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const products = all(`SELECT * FROM (${inner}) ${outer} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params, ...outerParams, PAGE_SIZE, (current - 1) * PAGE_SIZE);
  const categories = all('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id = c.id) AS n FROM categories c ORDER BY c.id');

  // Builds a link that keeps the current filters but changes some of them
  const query = {
    category: activeCategory ? activeCategory.id : null, q, sort, rating, min, max, brand: selectedBrands,
    page: current > 1 ? current : null,
  };
  const link = (changes) => {
    const merged = { ...query, ...changes };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      for (const val of [].concat(v)) if (val !== undefined && val !== null && val !== '') sp.append(k, val);
    }
    return `/products${sp.toString() ? '?' + sp : ''}`;
  };

  const heading = activeCategory ? activeCategory.name : (q ? `Search results for "${q}"` : 'All Products');
  res.render('products', {
    title: heading, products, categories, brands, selectedBrands, activeCategory, q, sort, rating, min, max,
    page: current, pages, total, link,
    description: activeCategory
      ? `Buy ${activeCategory.name} online at ${STORE.name}: ${activeCategory.description} Cash on delivery available.`
      : `Browse ${total} products at ${STORE.name}. Filter by category, brand, price and rating.`,
    // Search and filtered pages should not be indexed separately by search engines
    noindex: !!(q || selectedBrands.length || min || max || rating || sort || current > 1),
  });
});

router.get('/products/:id', (req, res, next) => {
  const id = Number(req.params.id);
  const product = Number.isInteger(id) ? get(`${PRODUCT_SELECT} WHERE p.id = ?`, id) : null;
  if (!product) return next();
  const images = all('SELECT image FROM product_images WHERE product_id = ? ORDER BY sort_order, id', product.id).map((r) => r.image);
  if (!images.includes(product.image)) images.unshift(product.image);
  // "Verified purchase" = the reviewer has a (not cancelled) order containing this product
  const reviews = all(`SELECT r.*, EXISTS (
      SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
      WHERE r.user_id IS NOT NULL AND o.user_id = r.user_id AND oi.product_id = r.product_id AND o.status != 'Cancelled'
    ) AS verified
    FROM reviews r WHERE r.product_id = ? ORDER BY r.created_at DESC, r.id DESC`, product.id);
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
  const related = all(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id != ? ORDER BY p.sold_count DESC LIMIT 6`,
    product.category_id, product.id);
  const user = req.session.user;
  const inWishlist = user ? !!get('SELECT 1 AS x FROM wishlist WHERE user_id = ? AND product_id = ?', user.id, product.id) : false;
  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;
  const city = user ? (get('SELECT city FROM users WHERE id = ?', user.id) || {}).city : null;
  // Real store figures for the "Sold by" box
  const sellerStats = get(`SELECT
      (SELECT ROUND(100.0 * SUM(rating >= 4) / COUNT(*)) FROM reviews) AS positive,
      (SELECT COUNT(*) FROM orders WHERE status = 'Delivered') AS delivered,
      (SELECT COUNT(*) FROM products) AS products`);
  res.render('product', {
    title: product.name, product, images, reviews, breakdown, related, inWishlist, myReview, city, sellerStats,
    description: `${product.name} - ${product.description}`.slice(0, 158),
    ogImage: `${res.locals.baseUrl}${product.image}`,
    ogType: 'product',
  });
});

// Customers can rate and review a product (one review each, editable)
router.post('/products/:id/reviews', requireLogin, (req, res, next) => {
  const product = get('SELECT id FROM products WHERE id = ?', Number(req.params.id) || 0);
  if (!product) return next();
  const rating = parseInt(req.body.rating, 10);
  const comment = clean(req.body.comment, 1000);
  if (!(rating >= 1 && rating <= 5)) {
    flash(req, 'error', 'Please choose a star rating.');
  } else {
    const user = req.session.user;
    const existing = get('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', product.id, user.id);
    if (existing) {
      run("UPDATE reviews SET rating = ?, comment = ?, reviewer_name = ?, created_at = datetime('now') WHERE id = ?",
        rating, comment, user.name, existing.id);
    } else {
      run('INSERT INTO reviews (product_id, user_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
        product.id, user.id, user.name, rating, comment);
    }
    flash(req, 'success', existing ? 'Your review has been updated.' : 'Thank you! Your review has been posted.');
  }
  res.redirect(`/products/${product.id}#reviews`);
});

// Wishlist
router.post('/wishlist/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id) || 0;
  const userId = req.session.user.id;
  if (get('SELECT 1 AS x FROM wishlist WHERE user_id = ? AND product_id = ?', userId, id)) {
    run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', userId, id);
    flash(req, 'success', 'Removed from your wishlist.');
  } else if (get('SELECT id FROM products WHERE id = ?', id)) {
    run('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)', userId, id);
    flash(req, 'success', 'Saved to your wishlist.');
  } else {
    flash(req, 'error', 'Product not found.');
  }
  res.redirect(sameSiteReferer(req) || '/wishlist');
});

router.get('/wishlist', requireLogin, (req, res) => {
  const products = all(`${PRODUCT_SELECT} JOIN wishlist w ON w.product_id = p.id
    WHERE w.user_id = ? ORDER BY w.created_at DESC`, req.session.user.id);
  res.render('wishlist', { title: 'My Wishlist', products });
});

// Live search suggestions for the header search box
router.get('/api/search', (req, res) => {
  const q = clean(one(req.query.q), 100);
  res.set('Cache-Control', 'no-store');
  if (q.length < 2) return res.json([]);
  const like = likePattern(q);
  res.json(all(`SELECT p.id, p.name, p.price, p.image, c.name AS category FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\'
    ORDER BY p.sold_count DESC LIMIT 6`, like, like, like));
});

router.get('/about', (req, res) => res.render('about', {
  title: 'About Us', description: `${STORE.name} is a family shop on Main Bazaar, Lahore, now selling its full range online with delivery across Pakistan.`,
}));
router.get('/help', (req, res) => res.render('help', {
  title: 'Help Center', description: `How to order, pay, track deliveries and return items at ${STORE.name}.`,
}));

// Search engine files
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Disallow: /admin', 'Disallow: /account', 'Disallow: /cart', 'Disallow: /checkout',
    'Disallow: /wishlist', 'Disallow: /login', 'Disallow: /register', 'Disallow: /api/',
    '', `Sitemap: ${res.locals.baseUrl}/sitemap.xml`, '',
  ].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const base = res.locals.baseUrl;
  const urls = ['/', '/products', '/help', '/about']
    .concat(all('SELECT id FROM categories ORDER BY id').map((c) => `/products?category=${c.id}`))
    .concat(all('SELECT id FROM products ORDER BY id').map((p) => `/products/${p.id}`));
  const esc = (s) => s.replace(/&/g, '&amp;');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join('\n')}
</urlset>
`);
});

module.exports = router;
