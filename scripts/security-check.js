// Automated security tests against a running server with a FRESH database.
// It creates a test account and tries common attacks. Run it LAST: the
// brute-force test locks logins from this computer for 15 minutes
// (restart the server to clear it).
// Usage: npm run reset-db -> npm start -> npm run test:security
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
let passed = 0; let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${detail}`); }
};

// Minimal cookie jar so the tests can log in
function client() {
  const jar = new Map();
  return async (path, { method = 'GET', form, body, headers = {}, origin = ORIGIN } = {}) => {
    const h = { ...headers, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    if (method !== 'GET' && origin) h.origin = origin;
    if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const res = await fetch(BASE + path, { method, headers: h, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    res.text = await res.text();
    return res;
  };
}
const login = async (req, email, password) => req('/login', { method: 'POST', form: { email, password } });

(async () => {
  console.log(`Security checks on ${BASE}`);
  const anon = client();

  console.log('\nHTTP headers');
  const home = await anon('/');
  check('Content-Security-Policy set', /default-src 'self'/.test(home.headers.get('content-security-policy') || ''));
  check('X-Frame-Options DENY (no clickjacking)', home.headers.get('x-frame-options') === 'DENY');
  check('X-Content-Type-Options nosniff', home.headers.get('x-content-type-options') === 'nosniff');
  check('Referrer-Policy set', !!home.headers.get('referrer-policy'));
  check('X-Powered-By hidden', !home.headers.get('x-powered-by'));

  console.log('\nCross-site request forgery (CSRF)');
  let r = await anon('/cart/add', { method: 'POST', form: { product_id: 1 }, origin: 'https://evil.example' });
  check('form post from another website is blocked (403)', r.status === 403, `got ${r.status}`);
  r = await anon('/cart/add', { method: 'POST', form: { product_id: 1 }, origin: null });
  check('form post without Origin/Referer is blocked (403)', r.status === 403, `got ${r.status}`);
  r = await anon('/cart/add', { method: 'POST', form: { product_id: 1 } });
  check('same-site form post works (302)', r.status === 302, `got ${r.status}`);

  console.log('\nOpen redirect');
  r = await anon('/cart/add', { method: 'POST', form: { product_id: 1 }, headers: { referer: `${ORIGIN}.evil.example/phish` } });
  const loc = r.headers.get('location') || '';
  check('redirect stays on this site for a look-alike Referer', loc.startsWith('/') && !loc.startsWith('//'), `location=${loc}`);

  console.log('\nInput handling');
  r = await anon("/products?q=' OR 1=1 --");
  check('SQL injection text in search is treated as text', r.status === 200 && /0 items found/.test(r.text), `status ${r.status}`);
  r = await anon('/products?sort=price_asc;DROP TABLE products');
  check('unknown sort value is ignored', r.status === 200 && /62 items found/.test(r.text));
  r = await anon('/products?q=a&q=b&category=1&category=2&page=x');
  check('repeated query parameters do not crash the page', r.status === 200, `got ${r.status}`);
  r = await anon('/products?q=100%25');
  check('% in search is not a wildcard', r.status === 200 && /items found/.test(r.text));
  r = await anon('/products/abc');
  check('invalid product id gives 404', r.status === 404, `got ${r.status}`);

  console.log('\nRegistration and XSS');
  const user = client();
  r = await user('/register', { method: 'POST', form: { name: 'Short Pw', email: 'shortpw@example.com', phone: '03001234567', password: 'abc12', confirm: 'abc12' } });
  check('password shorter than 8 characters is rejected', r.status === 400 && /at least 8/.test(r.text));
  const xssName = '<script>alert(1)</script>';
  r = await user('/register', { method: 'POST', form: { name: xssName, email: 'xss.test@example.com', phone: '03001234567', password: 'testpass123', confirm: 'testpass123' } });
  check('registration works', r.status === 302, `got ${r.status}`);
  r = await user('/account');
  check('HTML in a name is escaped, not executed', !r.text.includes(xssName) && r.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  r = await user('/products/3/reviews', { method: 'POST', form: { rating: 5, comment: '<img src=x onerror=alert(1)>' } });
  r = await user('/products/3');
  check('HTML in a review is escaped', !r.text.includes('<img src=x onerror') && r.text.includes('&lt;img src=x onerror'));
  const myReviewBlock = r.text.split('<div class="review">').find((b) => b.includes('&lt;img src=x onerror')) || '';
  check('review by someone who did not buy is NOT marked "Verified Purchase"', myReviewBlock && !myReviewBlock.includes('Verified Purchase'));

  console.log('\nAuthorization');
  r = await anon('/admin');
  check('visitor cannot open /admin', r.status === 302 && /\/login/.test(r.headers.get('location')));
  r = await user('/admin/products');
  check('customer cannot open /admin', r.status === 302 && /\/login/.test(r.headers.get('location')));
  r = await user('/admin/orders/1/status', { method: 'POST', form: { status: 'Delivered' } });
  check('customer cannot change order status', r.status === 302 && /\/login/.test(r.headers.get('location')));
  const ayesha = client();
  await login(ayesha, 'ayesha@example.com', 'customer123');
  r = await ayesha('/account/orders/2'); // order 2 belongs to another customer
  check("customer cannot view another customer's order", r.status === 404, `got ${r.status}`);
  r = await ayesha('/account/orders/2/cancel', { method: 'POST' });
  check("customer cannot cancel another customer's order", r.status === 404, `got ${r.status}`);

  console.log('\nCart tampering');
  r = await user('/cart/add', { method: 'POST', form: { product_id: 6, quantity: 999999 } });
  r = await user('/cart');
  const qty = Number((r.text.match(/name="qty_6" value="(\d+)"/) || [])[1]);
  check('quantity is limited to the stock available (Realme XT: 3)', qty === 3, `qty=${qty}`);
  await user('/cart/add', { method: 'POST', form: { product_id: 41 } }); // Table Lamp has 0 stock
  r = await user('/cart');
  check('out-of-stock product cannot be added', !r.text.includes('name="qty_41"'));

  console.log('\nDuplicate orders');
  r = await user('/checkout');
  const token = (r.text.match(/name="checkout_token" value="([^"]+)"/) || [])[1];
  check('checkout page has a one-time token', !!token);
  const order = { checkout_token: token, name: 'Test Buyer', email: 'xss.test@example.com', phone: '03001234567', address: '1 Test Street', city: 'Lahore', payment_method: 'COD' };
  const first = await user('/checkout', { method: 'POST', form: order });
  const second = await user('/checkout', { method: 'POST', form: order }); // same token again (double click)
  check('submitting the same checkout twice creates only one order',
    first.headers.get('location') === second.headers.get('location') && /\/account\/orders\/\d+/.test(first.headers.get('location') || ''),
    `${first.headers.get('location')} vs ${second.headers.get('location')}`);
  await user('/cart/add', { method: 'POST', form: { product_id: 7 } }); // cart must not be empty for this test
  r = await user('/checkout', { method: 'POST', form: { ...order, checkout_token: 'forged-token' } });
  check('a forged checkout token is refused', r.status === 302 && /\/checkout$/.test(r.headers.get('location') || ''), `location=${r.headers.get('location')}`);

  console.log('\nFile upload');
  const admin = client();
  await login(admin, 'admin@havengoods.test', 'admin123');
  const fd = new FormData();
  for (const [k, v] of Object.entries({ name: 'Fake upload test', category_id: '1', price: '100', stock: '1', description: 'x' })) fd.append(k, v);
  fd.append('image', new Blob(['<html><script>alert(1)</script></html>'], { type: 'image/png' }), 'evil.png');
  r = await admin('/admin/products', { method: 'POST', body: fd });
  r = await admin(r.headers.get('location') || '/admin/products/new');
  check('a non-image file renamed to .png is rejected', /not a valid image/.test(r.text));
  r = await admin('/admin/products?q=Fake upload test');
  check('no product was created from the rejected upload', /0 products/.test(r.text));

  console.log('\nSEO files');
  r = await anon('/robots.txt');
  check('robots.txt blocks private pages', r.status === 200 && /Disallow: \/admin/.test(r.text) && /Sitemap:/.test(r.text));
  r = await anon('/sitemap.xml');
  check('sitemap.xml lists products', r.status === 200 && (r.text.match(/<loc>/g) || []).length >= 70);

  console.log('\nBrute force protection (run last)');
  const attacker = client();
  let last;
  for (let i = 0; i < 11; i++) last = await login(attacker, 'admin@havengoods.test', `wrong-${i}`);
  check('11th wrong password in a row is blocked (429)', last.status === 429, `got ${last.status}`);
  last = await login(attacker, 'admin@havengoods.test', 'admin123');
  check('even the right password is refused while blocked', last.status === 429, `got ${last.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
