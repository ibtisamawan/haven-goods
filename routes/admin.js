// Admin dashboard: products, categories, customers, orders and reviews
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = require('express').Router();
const { all, get, run, transaction, UPLOAD_DIR } = require('../db');
const { flash, requireAdmin, ORDER_STATUSES, STATUS_NOTES, PRODUCT_SELECT } = require('../lib/helpers');

router.use(requireAdmin);

// Product image uploads -> public/uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(path.extname(file.originalname).toLowerCase())
      && file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only JPG, PNG, WEBP or GIF images are allowed.'), ok);
  },
});
const productUpload = upload.fields([{ name: 'image', maxCount: 1 }, { name: 'gallery', maxCount: 5 }]);

// ---------------------------------------------------------------- Dashboard
router.get('/', (req, res) => {
  const stats = {
    products: get('SELECT COUNT(*) AS n FROM products').n,
    categories: get('SELECT COUNT(*) AS n FROM categories').n,
    customers: get("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n,
    orders: get('SELECT COUNT(*) AS n FROM orders').n,
    pending: get("SELECT COUNT(*) AS n FROM orders WHERE status IN ('Pending','Processing')").n,
    revenue: get("SELECT COALESCE(SUM(total),0) AS n FROM orders WHERE status != 'Cancelled'").n,
    reviews: get('SELECT COUNT(*) AS n FROM reviews').n,
  };
  const byStatus = ORDER_STATUSES.map((s) => ({
    status: s, count: get('SELECT COUNT(*) AS n FROM orders WHERE status = ?', s).n,
  }));
  const recentOrders = all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 7');
  const lowStock = all('SELECT * FROM products WHERE stock <= 10 ORDER BY stock LIMIT 6');
  const topSelling = all(`SELECT oi.product_id, oi.product_name, oi.image, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.price) AS revenue
    FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status != 'Cancelled'
    GROUP BY oi.product_id, oi.product_name ORDER BY qty DESC, revenue DESC LIMIT 5`);
  res.render('admin/dashboard', { title: 'Admin Dashboard', stats, byStatus, recentOrders, lowStock, topSelling });
});

// ---------------------------------------------------------------- Products
router.get('/products', (req, res) => {
  const q = (req.query.q || '').trim();
  const products = q
    ? all(`${PRODUCT_SELECT} WHERE p.name LIKE ? OR p.brand LIKE ? ORDER BY p.id DESC`, `%${q}%`, `%${q}%`)
    : all(`${PRODUCT_SELECT} ORDER BY p.id DESC`);
  res.render('admin/products', { title: 'Manage Products', products, q });
});

function formData(product, errors = []) {
  return {
    product, errors,
    categories: all('SELECT * FROM categories ORDER BY name'),
    gallery: product.id ? all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order, id', product.id) : [],
  };
}

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', { title: 'Add Product', ...formData({ featured: 0, stock: 10 }) });
});

router.get('/products/:id/edit', (req, res, next) => {
  const product = get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
  if (!product) return next();
  res.render('admin/product-form', { title: 'Edit Product', ...formData(product) });
});

function productFromBody(req, existing = {}) {
  const main = req.files && req.files.image && req.files.image[0];
  const oldPrice = Number(req.body.old_price);
  return {
    id: existing.id,
    name: (req.body.name || '').trim(),
    brand: (req.body.brand || '').trim() || null,
    description: (req.body.description || '').trim(),
    price: Number(req.body.price),
    old_price: oldPrice > 0 ? oldPrice : null,
    stock: parseInt(req.body.stock, 10),
    category_id: Number(req.body.category_id),
    featured: req.body.featured ? 1 : 0,
    warranty: (req.body.warranty || '').trim() || null,
    specs: (req.body.specs || '').trim() || null,
    image: main ? `/uploads/${main.filename}` : ((req.body.image_url || '').trim() || existing.image || ''),
  };
}

function validateProduct(p) {
  const errors = [];
  if (!p.name) errors.push('Product name is required.');
  if (!p.description) errors.push('Description is required.');
  if (!Number.isFinite(p.price) || p.price < 0) errors.push('Price must be a positive number.');
  if (p.old_price !== null && p.old_price <= p.price) errors.push('"Price before discount" must be higher than the price (or left empty).');
  if (!Number.isInteger(p.stock) || p.stock < 0) errors.push('Stock must be 0 or more.');
  if (!get('SELECT id FROM categories WHERE id = ?', p.category_id)) errors.push('Please choose a category.');
  if (!p.image) errors.push('Please upload a main image or enter an image path.');
  return errors;
}

function withUpload(req, res, next) {
  productUpload(req, res, (err) => {
    if (err) {
      flash(req, 'error', err.message);
      return res.redirect(req.originalUrl.endsWith('/products') ? '/admin/products/new' : `/admin/products/${req.params.id}/edit`);
    }
    next();
  });
}

function saveGallery(req, productId) {
  // Remove ticked gallery images, then add newly uploaded ones
  for (const id of [].concat(req.body.remove_image || [])) {
    run('DELETE FROM product_images WHERE id = ? AND product_id = ?', Number(id), productId);
  }
  const files = (req.files && req.files.gallery) || [];
  let order = (get('SELECT COALESCE(MAX(sort_order), 0) AS n FROM product_images WHERE product_id = ?', productId).n) + 1;
  for (const f of files) run('INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, ?)', productId, `/uploads/${f.filename}`, order++);
}

router.post('/products', withUpload, (req, res) => {
  const p = productFromBody(req);
  const errors = validateProduct(p);
  if (errors.length) return res.status(400).render('admin/product-form', { title: 'Add Product', ...formData(p, errors) });
  transaction(() => {
    const id = Number(run(`INSERT INTO products (category_id, name, brand, description, price, old_price, stock, image, featured, warranty, specs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, p.category_id, p.name, p.brand, p.description, p.price, p.old_price,
    p.stock, p.image, p.featured, p.warranty, p.specs).lastInsertRowid);
    run('INSERT INTO product_images (product_id, image, sort_order) VALUES (?, ?, 0)', id, p.image);
    saveGallery(req, id);
  });
  flash(req, 'success', `Product "${p.name}" added.`);
  res.redirect('/admin/products');
});

router.post('/products/:id', withUpload, (req, res, next) => {
  const existing = get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
  if (!existing) return next();
  const p = productFromBody(req, existing);
  const errors = validateProduct(p);
  if (errors.length) return res.status(400).render('admin/product-form', { title: 'Edit Product', ...formData(p, errors) });
  transaction(() => {
    run(`UPDATE products SET category_id = ?, name = ?, brand = ?, description = ?, price = ?, old_price = ?, stock = ?,
         image = ?, featured = ?, warranty = ?, specs = ? WHERE id = ?`, p.category_id, p.name, p.brand, p.description,
    p.price, p.old_price, p.stock, p.image, p.featured, p.warranty, p.specs, existing.id);
    if (p.image !== existing.image) {
      run('UPDATE product_images SET image = ? WHERE product_id = ? AND image = ?', p.image, existing.id, existing.image);
    }
    saveGallery(req, existing.id);
  });
  flash(req, 'success', `Product "${p.name}" updated.`);
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', (req, res) => {
  const product = get('SELECT * FROM products WHERE id = ?', Number(req.params.id));
  if (product) {
    run('DELETE FROM products WHERE id = ?', product.id);
    flash(req, 'success', `Product "${product.name}" deleted.`);
  }
  res.redirect('/admin/products');
});

// ---------------------------------------------------------------- Categories
router.get('/categories', (req, res) => {
  const categories = all(`SELECT c.*, COUNT(p.id) AS product_count FROM categories c
    LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name`);
  const editing = req.query.edit ? get('SELECT * FROM categories WHERE id = ?', Number(req.query.edit)) : null;
  res.render('admin/categories', { title: 'Manage Categories', categories, editing });
});

router.post('/categories', (req, res) => {
  const name = (req.body.name || '').trim();
  const description = (req.body.description || '').trim();
  const id = Number(req.body.id) || null;
  if (!name) {
    flash(req, 'error', 'Category name is required.');
  } else if (get('SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND id IS NOT ?', name, id)) {
    flash(req, 'error', `A category named "${name}" already exists.`);
  } else if (id) {
    run('UPDATE categories SET name = ?, description = ? WHERE id = ?', name, description, id);
    flash(req, 'success', `Category "${name}" updated.`);
  } else {
    run('INSERT INTO categories (name, description) VALUES (?, ?)', name, description);
    flash(req, 'success', `Category "${name}" added.`);
  }
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', (req, res) => {
  const cat = get('SELECT * FROM categories WHERE id = ?', Number(req.params.id));
  if (cat) {
    const count = get('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', cat.id).n;
    if (count > 0) {
      flash(req, 'error', `Cannot delete "${cat.name}": it still has ${count} product(s). Move or delete them first.`);
    } else {
      run('DELETE FROM categories WHERE id = ?', cat.id);
      flash(req, 'success', `Category "${cat.name}" deleted.`);
    }
  }
  res.redirect('/admin/categories');
});

// ---------------------------------------------------------------- Customers
router.get('/customers', (req, res) => {
  const customers = all(`SELECT u.*, COUNT(o.id) AS order_count,
      COALESCE(SUM(CASE WHEN o.status != 'Cancelled' THEN o.total END), 0) AS total_spent
    FROM users u LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.role = 'customer' GROUP BY u.id ORDER BY u.created_at DESC`);
  res.render('admin/customers', { title: 'Customers', customers });
});

router.get('/customers/:id', (req, res, next) => {
  const customer = get("SELECT * FROM users WHERE id = ? AND role = 'customer'", Number(req.params.id));
  if (!customer) return next();
  const orders = all('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', customer.id);
  res.render('admin/customer', { title: customer.name, customer, orders });
});

router.post('/customers/:id/delete', (req, res) => {
  const customer = get("SELECT * FROM users WHERE id = ? AND role = 'customer'", Number(req.params.id));
  if (customer) {
    run('DELETE FROM users WHERE id = ?', customer.id);
    flash(req, 'success', `Customer "${customer.name}" and their orders were deleted.`);
  }
  res.redirect('/admin/customers');
});

// ---------------------------------------------------------------- Orders
router.get('/orders', (req, res) => {
  const status = ORDER_STATUSES.includes(req.query.status) ? req.query.status : '';
  const orders = status
    ? all('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC', status)
    : all('SELECT * FROM orders ORDER BY created_at DESC');
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, get('SELECT COUNT(*) AS n FROM orders WHERE status = ?', s).n]));
  res.render('admin/orders', { title: 'Orders', orders, status, counts });
});

router.get('/orders/:id', (req, res, next) => {
  const order = get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  if (!order) return next();
  const items = all('SELECT * FROM order_items WHERE order_id = ?', order.id);
  const history = all('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at DESC, id DESC', order.id);
  res.render('admin/order', { title: `Order #${order.id}`, order, items, history });
});

router.post('/orders/:id/status', (req, res) => {
  const order = get('SELECT * FROM orders WHERE id = ?', Number(req.params.id));
  const status = req.body.status;
  if (order && ORDER_STATUSES.includes(status) && status !== order.status) {
    transaction(() => {
      let paymentStatus = order.payment_status;
      // Cash on delivery is collected when the order is delivered
      if (order.payment_method === 'COD' && status === 'Delivered') paymentStatus = 'Paid';
      if (order.payment_method !== 'COD' && status === 'Cancelled') paymentStatus = 'Refunded (demo)';
      // Put stock back when an order is cancelled (and take it again if re-opened)
      const cancelling = status === 'Cancelled';
      const reopening = order.status === 'Cancelled';
      if (cancelling || reopening) {
        const sign = cancelling ? '+' : '-';
        for (const item of all('SELECT * FROM order_items WHERE order_id = ?', order.id)) {
          if (item.product_id) {
            run(`UPDATE products SET stock = MAX(0, stock ${sign} ?) WHERE id = ?`, item.quantity, item.product_id);
          }
        }
      }
      run('UPDATE orders SET status = ?, payment_status = ? WHERE id = ?', status, paymentStatus, order.id);
      const note = (req.body.note || '').trim() || STATUS_NOTES[status];
      run('INSERT INTO order_status_history (order_id, status, note) VALUES (?, ?, ?)', order.id, status, note);
    });
    flash(req, 'success', `Order #${order.id} status changed to ${status}.`);
  }
  res.redirect(req.body.back === 'list' ? '/admin/orders' : `/admin/orders/${req.params.id}`);
});

// ---------------------------------------------------------------- Reviews
router.get('/reviews', (req, res) => {
  const reviews = all(`SELECT r.*, p.name AS product_name, p.image FROM reviews r
    JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC LIMIT 200`);
  res.render('admin/reviews', { title: 'Reviews', reviews });
});

router.post('/reviews/:id/delete', (req, res) => {
  run('DELETE FROM reviews WHERE id = ?', Number(req.params.id));
  flash(req, 'success', 'Review deleted.');
  res.redirect('/admin/reviews');
});

module.exports = router;
