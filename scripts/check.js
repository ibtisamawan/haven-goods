// Build check: catches broken templates, broken file references and a broken
// database file before deploying. Usage: npm run check
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);

// 1. Every EJS template compiles and every include() points to a real file
const views = walk(path.join(ROOT, 'views')).filter((f) => f.endsWith('.ejs'));
for (const file of views) {
  const src = fs.readFileSync(file, 'utf8');
  try { ejs.compile(src, { filename: file }); } catch (e) { fail(`${path.relative(ROOT, file)}: ${e.message.split('\n')[0]}`); }
  for (const [, inc] of src.matchAll(/include\('([^']+)'/g)) {
    if (!fs.existsSync(path.resolve(path.dirname(file), inc + '.ejs'))) fail(`${path.relative(ROOT, file)} includes missing "${inc}"`);
  }
}
ok(`${views.length} templates compile`);

// 2. Every res.render('x') in the routes has a template
const routes = walk(path.join(ROOT, 'routes')).concat(path.join(ROOT, 'server.js'));
let renders = 0;
for (const file of routes) {
  for (const [, view] of fs.readFileSync(file, 'utf8').matchAll(/render\('([^']+)'/g)) {
    renders++;
    if (!fs.existsSync(path.join(ROOT, 'views', view + '.ejs'))) fail(`${path.relative(ROOT, file)} renders missing view "${view}"`);
  }
}
ok(`${renders} res.render() calls point to existing templates`);

// 3. database.sql loads into a fresh in-memory database
const sql = fs.readFileSync(path.join(ROOT, 'database', 'database.sql'), 'utf8');
try {
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  const counts = ['categories', 'products', 'product_images', 'users', 'reviews', 'orders', 'order_items', 'order_status_history', 'wishlist']
    .map((t) => `${t}=${db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n}`);
  ok(`database.sql loads (${counts.join(', ')})`);
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) fail(`${fk.length} foreign key problems in database.sql`); else ok('no foreign key problems');
} catch (e) { fail(`database.sql: ${e.message}`); }

// 4. Every image path in database.sql and the templates exists in public/
const refs = new Set([...sql.matchAll(/'(\/images\/[^']+)'/g)].map((m) => m[1]));
for (const file of views) for (const [, p] of fs.readFileSync(file, 'utf8').matchAll(/(?:src|href)="(\/(?:images|css|js)\/[^"?<]+)/g)) refs.add(p);
const missing = [...refs].filter((p) => !fs.existsSync(path.join(ROOT, 'public', p)));
missing.forEach((p) => fail(`missing asset ${p}`));
ok(`${refs.size} asset references checked`);

// 5. The app module loads (catches broken requires) without starting a server
try {
  require(path.join(ROOT, 'server.js'));
  ok('server.js and all routes load');
} catch (e) { fail(`server.js failed to load: ${e.message}`); }

console.log(failures ? `\n${failures} problem(s) found` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
