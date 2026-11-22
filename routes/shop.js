// Public storefront: home page, product listing with filters, product page, reviews, search API
const router = require('express').Router();
const { all, get, run } = require('../db');
const { PRODUCT_SELECT, flash, requireLogin, sameSiteReferer } = require('../lib/helpers');

const PAGE_SIZE = 20;

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
  res.render('home', { title: 'Online Shopping in Pakistan', flashSale, categories, featured, forYou, brands, banners });
});

router.get('/products', (req, res) => {
  const { q = '', sort = '', rating = '' } = req.query;
  const min = Number(req.query.min) || null;
  const max = Number(req.query.max) || null;
  const selectedBrands = [].concat(req.query.brand || []).filter(Boolean);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  // Base filters (category + search) decide which brands are offered
  const base = []; const baseParams = [];
  let activeCategory = null;
  if (req.query.category) {
    activeCategory = get('SELECT * FROM categories WHERE id = ?', Number(req.query.category));
    if (activeCategory) { base.push('p.category_id = ?'); baseParams.push(activeCategory.id); }
  }
  if (q.trim()) {
    base.push('(p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ? OR c.name LIKE ?)');
    const like = `%${q.trim()}%`;
    baseParams.push(like, like, like, like);
  }
  const baseWhere = base.length ? `WHERE ${base.join(' AND ')}` : '';
  const brands = all(`SELECT p.brand, COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id
    ${baseWhere} ${base.length ? 'AND' : 'WHERE'} p.brand IS NOT NULL GROUP BY p.brand ORDER BY n DESC, p.brand LIMIT 15`, ...baseParams);

  const where = [...base]; const params = [...baseParams];
  if (selectedBrands.length) { where.push(`p.brand IN (${selectedBrands.map(() => '?').join(',')})`); params.push(...selectedBrands); }
  if (min) { where.push('p.price >= ?'); params.push(min); }
  if (max) { where.push('p.price <= ?'); params.push(max); }
  const outer = rating ? `WHERE rating >= ${Number(rating) || 0}` : '';
  const orderBy = {
    price_asc: 'price ASC', price_desc: 'price DESC', newest: 'created_at DESC',
    rating: 'rating DESC, review_count DESC', popular: 'sold_count DESC',
  }[sort] || 'featured DESC, sold_count DESC';

  const inner = `${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const total = get(`SELECT COUNT(*) AS n FROM (${inner}) ${outer}`, ...params).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const products = all(`SELECT * FROM (${inner}) ${outer} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${(Math.min(page, pages) - 1) * PAGE_SIZE}`, ...params);
  const categories = all('SELECT c.*, (SELECT COUNT(*) FROM products WHERE category_id = c.id) AS n FROM categories c ORDER BY c.id');

  // Builds a link that keeps the current filters but changes some of them
  const query = { ...req.query };
  const link = (changes) => {
    const merged = { ...query, ...changes };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      for (const one of [].concat(v)) if (one !== undefined && one !== null && one !== '') sp.append(k, one);
    }
    return `/products${sp.toString() ? '?' + sp : ''}`;
  };

  res.render('products', {
    title: activeCategory ? activeCategory.name : (q ? `Search: ${q}` : 'All Products'),
    products, categories, brands, selectedBrands, activeCategory, q, sort, rating, min, max,
    page: Math.min(page, pages), pages, total, link,
  });
});

router.get('/products/:id', (req, res, next) => {
  const product = get(`${PRODUCT_SELECT} WHERE p.id = ?`, Number(req.params.id));
  if (!product) return next();
  const images = all('SELECT image FROM product_images WHERE product_id = ? ORDER BY sort_order', product.id).map((r) => r.image);
  if (!images.includes(product.image)) images.unshift(product.image);
  const reviews = all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', product.id);
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
  const related = all(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id != ? ORDER BY p.sold_count DESC LIMIT 6`,
    product.category_id, product.id);
  const user = req.session.user;
  const inWishlist = user ? !!get('SELECT 1 AS x FROM wishlist WHERE user_id = ? AND product_id = ?', user.id, product.id) : false;
  const myReview = user ? reviews.find((r) => r.user_id === user.id) : null;
  const city = user ? (get('SELECT city FROM users WHERE id = ?', user.id) || {}).city : null;
  res.render('product', { title: product.name, product, images, reviews, breakdown, related, inWishlist, myReview, city });
});

// Customers can rate and review a product (one review each, editable)
router.post('/products/:id/reviews', requireLogin, (req, res, next) => {
  const product = get('SELECT id FROM products WHERE id = ?', Number(req.params.id));
  if (!product) return next();
  const rating = parseInt(req.body.rating, 10);
  const comment = (req.body.comment || '').trim().slice(0, 1000);
  if (!(rating >= 1 && rating <= 5)) {
    flash(req, 'error', 'Please choose a star rating.');
  } else {
    const user = req.session.user;
    const existing = get('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?', product.id, user.id);
    if (existing) {
      run("UPDATE reviews SET rating = ?, comment = ?, created_at = datetime('now') WHERE id = ?", rating, comment, existing.id);
    } else {
      run('INSERT INTO reviews (product_id, user_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
        product.id, user.id, user.name, rating, comment);
    }
    flash(req, 'success', 'Thank you! Your review has been posted.');
  }
  res.redirect(`/products/${product.id}#reviews`);
});

// Wishlist
router.post('/wishlist/:id', requireLogin, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.session.user.id;
  if (get('SELECT 1 AS x FROM wishlist WHERE user_id = ? AND product_id = ?', userId, id)) {
    run('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?', userId, id);
    flash(req, 'success', 'Removed from your wishlist.');
  } else if (get('SELECT id FROM products WHERE id = ?', id)) {
    run('INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)', userId, id);
    flash(req, 'success', 'Saved to your wishlist.');
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
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  const like = `%${q}%`;
  res.json(all(`SELECT p.id, p.name, p.price, p.image, c.name AS category FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.name LIKE ? OR p.brand LIKE ? OR c.name LIKE ? ORDER BY p.sold_count DESC LIMIT 6`, like, like, like));
});

router.get('/about', (req, res) => res.render('about', { title: 'About Us' }));
router.get('/help', (req, res) => res.render('help', { title: 'Help Center' }));

module.exports = router;
