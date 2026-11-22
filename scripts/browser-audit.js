// Read-only browser audit: opens every page (as a visitor, a customer and the
// admin) at several screen widths and reports console errors, failed requests,
// broken images, horizontal scrolling and missing page basics (h1, title,
// description). It does not change any data, so it is safe on the live site.
//
// Usage: BASE_URL=http://localhost:3000 npm run audit:browser
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const WIDTHS = (process.env.WIDTHS || '320,375,414,768,1024,1366,1440').split(',').map(Number);
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find((p) => fs.existsSync(p));

const PUBLIC = ['/', '/products', '/products?category=1', '/products?category=4', '/products?q=shirt&sort=price_asc',
  '/products?brand=Apple&min=10000&max=600000', '/products?q=zzzz-no-results', '/products/1', '/products/56', '/products/41',
  '/cart', '/login', '/register', '/help', '/about', '/does-not-exist'];
const CUSTOMER = ['/account', '/wishlist', '/account/orders/1', '/cart'];
const ADMIN = ['/admin', '/admin/products', '/admin/products/new', '/admin/products/1/edit', '/admin/categories',
  '/admin/customers', '/admin/customers/2', '/admin/orders', '/admin/orders/1', '/admin/reviews'];

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', password);
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('form.auth-card button')]);
}

async function auditPage(page, url, width, issues) {
  page.setDefaultNavigationTimeout(30000);
  const problems = [];
  const expected404 = url === '/does-not-exist';
  const onConsole = (m) => {
    if (m.type() !== 'error') return;
    if (expected404 && m.text().includes('404')) return; // this test page is meant to return 404
    problems.push(`console error: ${m.text()}`);
  };
  const onPageError = (e) => problems.push(`JS error: ${e.message}`);
  const onFailed = (r) => problems.push(`request failed: ${r.url()} (${r.failure() && r.failure().errorText})`);
  const onResponse = (r) => { if (r.status() >= 400 && !r.url().endsWith('/does-not-exist')) problems.push(`HTTP ${r.status()}: ${r.url()}`); };
  page.on('console', onConsole); page.on('pageerror', onPageError); page.on('requestfailed', onFailed); page.on('response', onResponse);
  await page.setViewport({ width, height: 800 });
  await page.goto(BASE + url, { waitUntil: 'networkidle0' });
  const info = await page.evaluate(async () => {
    document.querySelectorAll('img').forEach((i) => { i.loading = 'eager'; });
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || getComputedStyle(el).position === 'fixed') return false;
      // ignore content inside elements that are meant to scroll sideways
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(p).overflowX)) return false;
      }
      return r.right > vw + 1 || r.left < -1;
    }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`);
    return {
      overflow: document.documentElement.scrollWidth > vw + 1 ? `${document.documentElement.scrollWidth}px > ${vw}px` : null,
      wide,
      broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      h1: document.querySelectorAll('h1').length,
      title: document.title,
      description: !!document.querySelector('meta[name="description"]')?.content,
      unlabeled: [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter((el) =>
        !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map((el) => el.name || el.id || el.type),
      noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).map((i) => i.getAttribute('src')),
    };
  });
  page.off('console', onConsole); page.off('pageerror', onPageError); page.off('requestfailed', onFailed); page.off('response', onResponse);
  if (info.overflow) problems.push(`horizontal scroll ${info.overflow} (${info.wide.join(', ')})`);
  if (info.broken.length) problems.push(`broken images: ${info.broken.join(', ')}`);
  if (width === WIDTHS[WIDTHS.length - 1]) {
    if (info.h1 !== 1) problems.push(`page has ${info.h1} <h1> elements`);
    if (!info.description) problems.push('missing meta description');
    if (info.unlabeled.length) problems.push(`form fields without label: ${info.unlabeled.join(', ')}`);
    if (info.noAlt.length) problems.push(`images without alt: ${info.noAlt.join(', ')}`);
  }
  for (const p of problems) issues.push(`[${width}px] ${url}: ${p}`);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const issues = [];
  let checked = 0;
  const run = async (label, urls, creds) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    if (creds) await login(page, ...creds);
    for (const url of urls) for (const w of WIDTHS) { await auditPage(page, url, w, issues); checked++; }
    console.log(`${label}: ${urls.length} pages x ${WIDTHS.length} widths done`);
    await ctx.close();
  };
  await run('Visitor', PUBLIC);
  await run('Customer', CUSTOMER, ['ayesha@example.com', 'customer123']);
  await run('Admin', ADMIN, ['admin@havengoods.test', 'admin123']);
  await browser.close();
  console.log(`\n${checked} page views checked on ${BASE}`);
  const unique = [...new Set(issues)];
  if (unique.length) { console.log(`${unique.length} issue(s):`); unique.forEach((i) => console.log('  - ' + i)); process.exit(1); }
  console.log('No issues found.');
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
