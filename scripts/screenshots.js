// Walks through the whole site like a customer and an admin would, and saves
// a screenshot of every major page into /screenshots. Also works as an
// end-to-end test: it stops with an error if any page or step is broken.
//
// Usage (fresh database, server running on http://localhost:3000):
//   npm run reset-db  ->  npm start  ->  (in another terminal) npm run screenshots
// Needs Google Chrome or Microsoft Edge installed (set CHROME_PATH to override).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'screenshots');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

let n = 0;
async function shot(page, name, { full = true, scrollTo = null } = {}) {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  if (scrollTo) {
    await page.$eval(scrollTo, (el) => el.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -150));
  } else {
    await page.evaluate(() => { if (!document.activeElement?.matches('#search-input')) document.activeElement?.blur(); window.scrollTo(0, 0); });
  }
  // Load lazy images so full-page screenshots have no blank pictures
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    imgs.forEach((img) => { img.loading = 'eager'; });
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; }))));
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: file, fullPage: full });
  console.log('  saved', path.basename(file));
}

async function go(page, url) {
  const res = await page.goto(BASE + url, { waitUntil: 'networkidle0' });
  if (!res.ok()) throw new Error(`${url} returned ${res.status()}`);
}

async function submit(page, selector) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click(selector)]);
}

async function expectText(page, text) {
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes(text)) throw new Error(`Expected to see "${text}" on ${page.url()}`);
}

async function addToCart(page, id, qty = 1) {
  await go(page, `/products/${id}`);
  await page.$eval('#quantity', (el, q) => { el.value = q; }, String(qty));
  await submit(page, '#add-to-cart');
  await expectText(page, 'added to your cart');
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f));
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) throw new Error('Chrome/Edge not found. Set CHROME_PATH.');
  const browser = await puppeteer.launch({ executablePath, headless: true, defaultViewport: { width: 1366, height: 860 } });

  // ---------------- Customer journey
  console.log('Customer journey');
  const customer = await (await browser.createBrowserContext()).newPage();
  await go(customer, '/');
  await expectText(customer, 'Flash Sale');
  await expectText(customer, 'Just For You');
  await shot(customer, 'home-page');

  await customer.type('#search-input', 'sams');
  await customer.waitForSelector('#suggest a', { visible: true });
  await shot(customer, 'live-search-suggestions', { full: false });

  await go(customer, '/products');
  await expectText(customer, '62 items found');
  await shot(customer, 'all-products');

  await go(customer, '/products?category=1');
  await customer.click('input[name="brand"][value="Samsung"]');
  await customer.waitForNavigation({ waitUntil: 'networkidle0' });
  await expectText(customer, 'Samsung ✕');
  await shot(customer, 'category-with-brand-filter');

  await go(customer, '/products?q=shirt');
  await expectText(customer, 'items found');

  await go(customer, '/products/1');
  await expectText(customer, 'iPhone 13 Pro');
  await expectText(customer, 'Ratings & Reviews');
  await customer.hover('.thumb-btn:nth-child(2)');
  await shot(customer, 'product-details');

  // Cart: add, update quantity, remove
  await addToCart(customer, 2);
  await addToCart(customer, 15, 2);
  await addToCart(customer, 12);
  await go(customer, '/cart');
  await customer.$eval('input[name="qty_15"]', (el) => { el.value = '3'; });
  await submit(customer, '#update-cart');
  await expectText(customer, 'Cart updated');
  const qtys = async () => (await customer.$$eval('.stepper input', (els) => els.map((e) => `${e.name}=${e.value}`))).sort().join(',');
  if (await qtys() !== 'qty_12=1,qty_15=3,qty_2=1') throw new Error(`Cart quantities wrong after update: ${await qtys()}`);
  await submit(customer, 'button[formaction="/cart/remove/12"]');
  await expectText(customer, 'Item removed');
  if (await qtys() !== 'qty_15=3,qty_2=1') throw new Error(`Cart wrong after remove: ${await qtys()}`);
  await addToCart(customer, 12);
  await go(customer, '/cart');
  await shot(customer, 'shopping-cart');

  // Checkout requires an account -> registration
  await go(customer, '/checkout');
  await expectText(customer, 'Please log in');
  await go(customer, '/register');
  await customer.type('#name', 'Bilal Ahmed');
  await customer.type('#email', 'bilal@example.com');
  await customer.type('#phone', '0333-7654321');
  await customer.type('#address', 'Flat 3B, Gulberg Heights, Main Boulevard');
  await customer.type('#city', 'Lahore');
  await customer.type('#password', 'bilal123');
  await customer.type('#confirm', 'bilal123');
  await shot(customer, 'customer-registration');
  await submit(customer, 'form.auth-card button');
  await expectText(customer, 'Select payment method'); // back at checkout after registering

  await customer.type('#notes', 'Please call before delivery.');
  await shot(customer, 'checkout-cash-on-delivery');
  await customer.click('input[value="CARD"]');
  await shot(customer, 'checkout-card-payment-demo');
  await customer.click('input[value="WALLET"]');
  await shot(customer, 'checkout-mobile-wallet-demo');
  await customer.click('input[value="COD"]');
  await submit(customer, '#place-order');
  await expectText(customer, 'Thank you for your order');
  const firstOrder = customer.url().match(/orders\/(\d+)/)[1];
  await shot(customer, 'order-confirmation-tracking');

  // Wishlist and a product review
  await go(customer, '/products/7');
  await submit(customer, '.wish-inline button');
  await expectText(customer, 'Saved to your wishlist');
  await go(customer, '/products/23');
  await submit(customer, '.wish-inline button');
  await go(customer, '/wishlist');
  await expectText(customer, 'My Wishlist (2)');
  await shot(customer, 'wishlist');

  await go(customer, '/products/2');
  await customer.click('label[for="star5"]');
  await customer.type('.review-form textarea', 'Bought this for my brother, original phone and delivered in 2 days. Very happy!');
  await submit(customer, '.review-form button');
  await expectText(customer, 'Your review has been posted');
  await expectText(customer, 'Bought this for my brother');
  // Bilal ordered this phone above, so his review must carry the badge
  const verified = await customer.$$eval('.review', (els) => els.some((e) => e.textContent.includes('Bought this for my brother') && e.textContent.includes('Verified Purchase')));
  if (!verified) throw new Error('Review by a buyer should be marked "Verified Purchase"');
  await shot(customer, 'product-ratings-and-reviews', { full: false, scrollTo: '#reviews' });

  // Second order paid with the demo wallet, then cancelled by the customer
  await addToCart(customer, 50);
  await go(customer, '/checkout');
  await customer.click('input[value="WALLET"]');
  await submit(customer, '#place-order');
  await expectText(customer, 'Mobile Wallet (demo)');
  customer.on('dialog', (d) => d.accept());
  await submit(customer, 'form[action$="/cancel"] button');
  await expectText(customer, 'has been cancelled');
  await expectText(customer, 'Refunded (demo)');

  await go(customer, '/account');
  await expectText(customer, 'My Orders');
  await shot(customer, 'customer-account-orders');

  await go(customer, '/help');
  await shot(customer, 'help-center', { full: false });

  // ---------------- Admin
  console.log('Admin');
  const admin = await (await browser.createBrowserContext()).newPage();
  admin.on('dialog', (d) => d.accept());
  await go(admin, '/admin');
  await expectText(admin, 'Admin access only');
  await shot(admin, 'login-page', { full: false });
  await admin.type('#email', 'admin@havengoods.test');
  await admin.type('#password', 'admin123');
  await submit(admin, 'form.auth-card button');
  await expectText(admin, 'Total revenue');
  await shot(admin, 'admin-dashboard');

  await go(admin, '/admin/products');
  await shot(admin, 'admin-products');

  await go(admin, '/admin/products/new');
  await admin.type('#name', 'Apple AirPods Pro (2nd Gen)');
  await admin.select('#category_id', '1');
  await admin.type('#brand', 'Apple');
  await admin.type('#price', '18999');
  await admin.type('#old_price', '24999');
  await admin.$eval('#stock', (el) => { el.value = '25'; });
  await admin.type('#warranty', '1 year official warranty');
  await admin.type('#description', 'Wireless earbuds with active noise cancellation, adaptive transparency, spatial audio and up to 30 hours of listening with the MagSafe charging case.');
  await admin.type('#specs', 'Battery: Up to 30 hours with case\nConnectivity: Bluetooth 5.3');
  const imgDir = path.join(__dirname, '..', 'public', 'images', 'products');
  await (await admin.$('#image')).uploadFile(path.join(imgDir, 'apple-airpods-1.webp'));
  await (await admin.$('#gallery')).uploadFile(path.join(imgDir, 'apple-airpods-2.webp'), path.join(imgDir, 'apple-airpods-3.webp'));
  await shot(admin, 'admin-add-product');
  await submit(admin, 'form.form-card .form-actions button');
  await expectText(admin, 'Product "Apple AirPods Pro (2nd Gen)" added');
  const newId = await admin.$eval('table tbody tr td small', (el) => el.textContent.match(/#(\d+)/)[1]);
  await go(admin, `/products/${newId}`);
  const thumbs = await admin.$$eval('.thumb-btn', (els) => els.length);
  if (thumbs !== 3) throw new Error(`Uploaded product should have 3 photos, found ${thumbs}`);
  await expectText(admin, '-24%');

  await go(admin, '/admin/categories');
  await admin.type('#name', 'Toys & Games');
  await admin.type('#description', 'Toys, puzzles and board games for all ages.');
  await submit(admin, 'form.card button.btn');
  await expectText(admin, 'Category "Toys & Games" added');
  await shot(admin, 'admin-categories');

  await go(admin, '/admin/customers');
  await expectText(admin, 'Bilal Ahmed');
  await shot(admin, 'admin-customers');

  await go(admin, '/admin/orders');
  await shot(admin, 'admin-orders');

  await go(admin, `/admin/orders/${firstOrder}`);
  await admin.select('#status', 'Shipped');
  await admin.type('#note', 'Shipped via courier, tracking no. HG-TRK-55821');
  await submit(admin, '#status-update button');
  await expectText(admin, 'status changed to Shipped');
  await shot(admin, 'admin-order-details');

  await go(admin, '/admin/reviews');
  await expectText(admin, 'Bought this for my brother');
  await shot(admin, 'admin-reviews', { full: false });

  // Customer sees the admin's update on the tracking page
  await go(customer, `/account/orders/${firstOrder}`);
  await expectText(customer, 'HG-TRK-55821');
  await shot(customer, 'customer-order-tracking');

  // Mobile view of the home page
  const mobile = await (await browser.createBrowserContext()).newPage();
  await mobile.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
  await go(mobile, '/');
  await shot(mobile, 'mobile-home', { full: false });

  await browser.close();
  console.log(`Done: ${n} screenshots in ${OUT}`);
})().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
