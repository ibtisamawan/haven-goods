# Haven Goods – Website Audit Report

| | |
|---|---|
| **Website** | Haven Goods e-commerce store – <https://haven-goods.vercel.app> |
| **Repository** | <https://github.com/ibtisamawan/haven-goods> |
| **Audit date** | 22 November 2026 |
| **Audited code** | `main` @ `851c4f8` (currently live) |
| **Fixes on branch** | `audit/production-hardening` (local, **not pushed and not deployed** – see section 13) |

**Summary.** The whole project was inspected file by file and tested in a real browser at 7 screen sizes, plus an end-to-end shopping test and a 35-check security test. **60 issues** were found: **0 Critical, 6 High, 24 Medium, 30 Low**.
- **56 were fixed** (all 6 High, 22 Medium, 28 Low). 55 of these are verified; 1 (smaller Vercel bundle, P6) can only be confirmed by a Vercel build.
- **4 remain**, because they need an external service or account: a hosted database, an email service, a shared rate-limit store and a payment gateway. They are documented in section 13.

Every automated check now passes. The only step that could not be verified is a real Vercel build: Vercel's command-line tool has a bug on this Windows computer, so a preview deployment is needed (with your permission).

---

## 1. Project architecture overview

| Layer | Technology | Files |
|---|---|---|
| Server | Node.js 24, Express 4 | `server.js` (app setup, middleware, error handling) |
| Routing | Express routers | `routes/shop.js`, `routes/cart.js`, `routes/checkout.js`, `routes/auth.js`, `routes/admin.js` |
| Views | EJS server-rendered templates | `views/*.ejs` (13 pages), `views/partials/*` (3), `views/admin/*` (11) |
| Database | SQLite via built-in `node:sqlite` | `db.js`, `database/database.sql` (9 tables, sample data) |
| Sessions | Signed cookie (`cookie-session`) | login + cart stored client-side, signed with `SESSION_SECRET` |
| Uploads | `multer` 2 | admin product photos → `public/uploads` (local) or `/tmp/uploads` (Vercel) |
| Front-end | Plain CSS + one script | `public/css/style.css`, `public/js/main.js` (slider, countdown, gallery, live search, payment panels) |
| Hosting | Vercel (serverless function + CDN) | `api/index.js` (entry), `vercel.json`, `.vercelignore` |
| Security (new) | Headers, CSRF, rate limiting | `lib/security.js` |

**How a request flows:** Vercel CDN serves `public/` files directly. Every other request is rewritten to `api/index.js`, which loads the Express app. Then: security headers → static files → body parser → signed session cookie → shared page values (user re-checked in the database) → CSRF check → route → EJS view. On Vercel the SQLite database is created in `/tmp` from `database.sql` when a server instance starts.

## 2. What was inspected

| Area | Count |
|---|---|
| Server-side JavaScript files | 10 (server, db, api entry, 2 libs, 5 routers) |
| HTTP routes | 46 (11 shop, 10 account/auth, 5 cart, 2 checkout, 18 admin) |
| EJS templates | 27 (13 storefront pages, 3 partials, 11 admin) |
| Client-side files | `main.js`, `style.css`, logo, 170 product photos |
| Config files | `package.json`, `package-lock.json`, `vercel.json`, `.vercelignore`, `.gitignore` |
| Database | `database.sql` – schema, 62 products, 225 reviews, 12 orders, foreign keys |
| Scripts | 7 (reset-db, build check, report builder, end-to-end, browser audit, security tests, Vercel secret) |
| Browser page views tested | 210 (30 pages × 7 widths, as visitor, customer and admin) |

## 3. Testing tools added

The project had no linter or automated test commands, so these were added and used throughout the audit:

| Command | What it checks |
|---|---|
| `npm run lint` | ESLint (recommended rules, `no-unused-vars`, `eqeqeq`, `prefer-const`, `no-var`) on all JS |
| `npm run check` | All 27 templates compile; every `include()` and `res.render()` target exists; `database.sql` loads into a fresh database with no foreign-key errors; all 173 asset paths exist; the app loads. **Vercel now runs this on every deploy** (`buildCommand`), so a broken template fails the build instead of the live site |
| `npm run build` | `lint` + `check` |
| `npm test` | End-to-end test in headless Chrome: browse, search, filter, cart (add / update / remove), register, checkout with each payment method, wishlist, review, cancel, admin product upload with gallery, category, order status update, customer sees update, mobile view. Saves 26 screenshots |
| `npm run audit:browser` | 30 pages × 7 widths (320, 375, 414, 768, 1024, 1366, 1440 px): console errors, JS errors, failed requests, HTTP errors, broken images, horizontal scrolling, one `<h1>` per page, meta description, unlabeled form fields, images without `alt` |
| `npm run test:security` | 35 attack-style tests (section 6) |

## 4. All identified issues and their status

Severity scale: **Critical** – data loss or full compromise · **High** – security weakness or misleading/incorrect behaviour customers would hit · **Medium** – bug, accessibility barrier or production risk · **Low** – polish, hardening, best practice.

### 4.1 Security

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| S1 | No CSRF protection: another website could make a logged-in user's browser submit forms (add to cart, cancel order, admin status change, delete product) | High | No origin or token check on POST routes; `SameSite=Lax` alone is not a complete defense | `lib/security.js` `csrfProtection`: every non-GET request must have an `Origin`/`Referer` from the same host, else **403** | ✅ security tests: foreign origin → 403, no origin → 403, same site → works |
| S2 | No brute-force protection on login (unlimited password guesses) | High | No rate limiting | `createLimiter`: 10 failed logins / 15 min per IP → **429**; 5 sign-ups / hour per IP; memory is pruned | ✅ 11th wrong password → 429; correct password refused while blocked |
| S3 | Admin rights were read from the session cookie: an admin who is demoted or deleted kept access until the cookie expired (24 h) | High | `role` was copied into the cookie at login and never re-checked | Every request reloads `id, name, email, role` from the database; missing accounts are logged out | ✅ code + end-to-end; customer → `/admin` redirected |
| S4 | No security headers (no CSP, page could be framed for clickjacking, MIME sniffing allowed) | Medium | Not configured | CSP (`default-src 'self'`, no inline scripts), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS on https; `X-Powered-By` removed; same headers in `vercel.json` for CDN files | ✅ security tests (5 header checks); browser audit shows no CSP violations |
| S5 | Open redirect: after "Add to cart" the user was sent back to the `Referer`, and a look-alike domain (`haven-goods.vercel.app.evil.com`) passed the `startsWith` check | Medium | String prefix comparison instead of URL parsing | `sameSiteReferer()` parses the URL and compares the exact host; `safePath()` only allows `/path` redirects (also for `returnTo` after login) | ✅ security test with look-alike Referer |
| S6 | Error page showed internal error messages (e.g. SQL errors) to visitors | Medium | `err.message` rendered directly | Generic message for 5xx (details only in server logs); safe defaults if an error happens before page values are ready | ✅ code review; 404/500 paths render |
| S7 | Upload check trusted the file name and browser-sent type only, so an HTML file named `evil.png` would be stored and served | Medium | No content validation | After upload, the first bytes are checked for real JPEG/PNG/GIF/WEBP signatures; rejected files are deleted; clear error for files over 2 MB | ✅ security test: fake PNG rejected, no product created, 0 files left |
| S8 | Login timing revealed whether an email is registered (password hashed only for existing users) | Low | Early return for unknown email | A dummy hash is checked for unknown emails, so both cases take the same time | ✅ code review |
| S9 | Admin "image path" accepted any text (e.g. `javascript:` or a foreign `http:` URL) | Low | No validation | Only `/local/path` or `https://` URLs accepted | ✅ code review |
| S10 | Minimum password length 6 | Low | Weak policy | Minimum 8, maximum 128 (server + form attributes) | ✅ security test: 5-character password rejected |
| S11 | No length limits on form fields | Low | Unbounded input | `clean()` trims and limits every field (name 100, email 150, address 255, notes 500, review 1000…); `maxlength` on inputs; body size limit 50 kB | ✅ code review |
| S12 | 9 high-severity advisories in dev dependencies (`puppeteer-core` → `basic-ftp`, `extract-zip`, `zod`…) | Low (dev tools only, not shipped to users) | Outdated test tooling | Upgraded `puppeteer-core` 23 → 25; `multer` 1.x (end of life) → 2.x | ✅ `npm audit`: **0 vulnerabilities** (prod and dev) |
| S13 | No way for a customer to change their password | Medium | Feature missing | **Change Password** form on My Account (current password required) | ✅ tested: wrong current password, too short and mismatched new passwords rejected; change succeeds; old password stops working; new one works |

### 4.2 Bugs and business logic

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| B1 | **"✓ Verified Purchase" shown on every review**, including reviews from people who never bought the product | High | Badge hard-coded in the template | Badge shown only when the reviewer has a non-cancelled order containing that product (SQL `EXISTS`) | ✅ e2e: buyer's review has badge; security test: non-buyer's review has none |
| B2 | Seller box showed made-up figures ("96% positive", "98% ship on time", "92% chat response" – there is no chat) | High | Hard-coded numbers | Real figures from the database: % of reviews ≥ 4★, delivered orders, number of products | ✅ screenshot: 86% / 4 / 62 |
| B3 | **Duplicate orders**: a double click on "Place Order" or a network retry could create the same order twice | High | No idempotency | One-time checkout token stored in `orders.checkout_token UNIQUE`; a repeated submit shows the existing order; button disabled after the first click | ✅ security tests: same token twice → one order; forged token refused |
| B4 | **500 error** when a query parameter is repeated (`/products?q=a&q=b`) | Medium | Express turns repeated params into arrays; `q.trim()` then throws | All query values normalised to single strings; `sort`/`rating` whitelisted; `LIMIT`/`OFFSET`/rating bound as parameters | ✅ security test |
| B5 | `%` and `_` in a search acted as SQL wildcards (searching "100%" matched everything containing "100") | Low | Unescaped `LIKE` pattern | `likePattern()` escapes wildcards (`ESCAPE '\'`) | ✅ security test |
| B6 | "Update cart" left a line with quantity **0** when a product's stock was 0 | Medium | `Math.min(qty, 0)` stored instead of removing | Lines with no allowed quantity are removed; lines are only updated if they are in the cart | ✅ e2e cart test |
| B7 | Cart could grow without limit, but it lives in a cookie (~4 KB limit): a large cart would silently be dropped by the browser | Medium | No cap | Max 30 different products, 99 per product; clear message when the cap is reached | ✅ code review |
| B8 | Cart showed no warning when the shop no longer had enough stock; the problem only appeared at checkout | Medium | Stock not compared on the cart page | Cart flags "Only N available / Out of stock", disables checkout until fixed; checkout redirects back if the cart has problems | ✅ code review + security test (quantity clamped to stock) |
| B9 | Adding more than the stock showed "added to cart" though the quantity was capped | Low | Message ignored capping | Tells the customer how many were actually added | ✅ code review |
| B10 | Admin **re-opening a cancelled order** could oversell: stock was silently clamped to 0 | Medium | `MAX(0, stock - qty)` | Re-opening is refused with a clear message if any item is short on stock; payment status restored | ✅ code review |
| B11 | Admin cancelling an order returned stock but not the "sold" counter (the customer-side cancel did both) – inconsistent numbers | Low | Missing update | Admin cancel/re-open now adjusts `sold_count` too | ✅ code review |
| B12 | Saving an order with its current status gave no feedback; invalid status silently ignored; unknown order id redirected to a broken page | Low | Missing branches | "already Processing" info message, error for invalid status, 404 for unknown order | ✅ code review |
| B13 | Admin product form accepted price 0 and decimal stock (`2.5` → 2) | Low | `parseInt` and `>= 0` check | Price must be > 0; stock must be a whole number ≥ 0 | ✅ code review |
| B14 | Specification lines without ":" rendered broken table rows | Low | `indexOf(':')` = −1 not handled | Such lines render as one full-width row | ✅ code review |
| B15 | Search suggestions: a slow older response could overwrite a newer one; errors were swallowed silently (lint error: unused variable) | Low | No request cancellation; empty `catch` | `AbortController` cancels older requests; non-OK responses handled; failure logged with `console.warn` | ✅ lint clean; e2e live search |
| B16 | Account page ran one query per order (N+1) | Low | Loop query | One query for all items | ✅ e2e account page |
| B17 | Minor code issues: meaningless expression in admin reviews view; raw "COD" codes shown on admin customer page; "Load more products" button that doesn't load more | Low | Leftovers | Removed / readable payment labels / renamed "View all products" | ✅ visual check |

### 4.3 Accessibility (WCAG 2.1 AA)

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| A1 | Pages without an `<h1>`: home, cart, account, order details | Medium | Headings missing | Added (visually hidden on home) | ✅ browser audit: exactly one `<h1>` on all 30 pages |
| A2 | Colour contrast failures: grey text on page background **4.0:1**, sale prices **3.7:1**, white text on amber buttons (Buy Now, search, badges) **~2:1** – minimum is 4.5:1 | Medium | Palette choice | `--muted` #646464 (4.6:1), `--sale` #d0391d (4.7:1), dark text on amber (10:1); brand colours unchanged | ✅ contrast calculated for each pair; screenshots |
| A3 | Banner slider moved every 5 s with no way to pause, and hidden slides could still be reached with the Tab key | Medium | WCAG 2.2.2 / 2.4.3 not handled | Pauses on hover, keyboard focus and hidden tab; no autoplay with "reduce motion"; hidden slides get `aria-hidden` + `tabindex=-1`; slide/dot labels | ✅ code review + e2e |
| A4 | Star ratings were invisible to screen readers (CSS-only) | Medium | No text alternative | `role="img"` + "Rated 4.3 out of 5"; rating filter links have readable text; review form uses a `fieldset`/`legend` with "5 stars" labels | ✅ code review |
| A5 | "Add to cart" on product cards appeared only on mouse hover – keyboard users tabbed onto an invisible button | Medium | `:hover` only | Also shown on `:focus-within`; duplicate image link removed from tab order | ✅ code review |
| A6 | One form field without a label (email on My Account) | Low | `<label>` without `for` | Linked label | ✅ browser audit: 0 unlabeled fields |
| A7 | Heading levels skipped (h1 → h3/h4) on product, checkout, order and all admin pages | Low | Visual sizing via tag | Correct levels with size classes (`.h3`) | ✅ code review |
| A8 | No "skip to main content" link; no consistent keyboard focus outline | Low | Missing | Skip link + `:focus-visible` outline on everything | ✅ code review |
| A9 | Category menu had no `aria-expanded` and could not be closed with Escape; flash messages not announced | Low | Missing ARIA | `aria-expanded`/`aria-controls`, Escape closes; alerts use `role="alert"`/`status`; current page marked with `aria-current` | ✅ code review |
| A10 | Prefers-reduced-motion not respected | Low | — | Transitions disabled for users who ask for reduced motion | ✅ code review |

### 4.4 SEO

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| E1 | Same meta description on every page; admin pages had none | Medium | Hard-coded in header | Per-page descriptions (home, category, product uses its description, about, help, admin) | ✅ browser audit: description on all 30 pages |
| E2 | No `robots.txt`, no `sitemap.xml` | Medium | Missing | `/robots.txt` (blocks admin/account/cart/checkout/api) and `/sitemap.xml` (home, categories, all 62 products) | ✅ security test |
| E3 | No canonical URL or social sharing tags | Medium | Missing | `<link rel="canonical">`, Open Graph + Twitter tags, product photo as share image, new 1200×630 `og-image.png` | ✅ code review |
| E4 | Private pages (admin, account, cart, checkout, login) and filtered/search result pages could be indexed | Low | No `noindex` | `<meta name="robots" content="noindex">` on those pages | ✅ code review |

### 4.5 Responsive design

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| R1 | Admin pages scrolled sideways on phones (dashboard 530 px wide at 320 px) and on 1024 px laptops (products/orders/customers tables) | Medium | Grid children with `min-width: auto`; tables not in a scroll container; 2-column admin grid too narrow at 1024 px | Tables wrapped in a scrollable `.table-wrap`; grid children `min-width: 0`; admin grid single-column below 1200 px; toolbar wraps | ✅ browser audit: 0 overflow at all widths |
| R2 | A hidden screen-reader label inside the scrolling table escaped it and widened the Reviews page by 290 px | Medium | Absolutely positioned element inside a non-positioned scroll box | `.table-wrap { position: relative }` | ✅ browser audit |
| R3 | On phones the filter column pushed products far below the screen | Medium | Sidebar stacked above results | Filters become a collapsible "Filters" panel on small screens (closed unless a filter is active, with a count badge) | ✅ 320 px screenshot |
| R4 | Top utility links wrapped onto two lines at 320 px | Low | Too many links for the width | Help link hidden on small phones (still in the footer), no wrapping | ✅ CSS + browser audit |
| R5 | Images without width/height (layout shift while loading) | Low | Missing attributes | Width/height on product, gallery, category, brand, cart and order images | ✅ code review |

Result: **no horizontal scrolling, overlapping, broken image or console error on any of the 30 pages at 320, 375, 414, 768, 1024, 1366 or 1440 px.**

### 4.6 Performance

| # | Issue | Severity | Root cause | Solution implemented | Verified |
|---|---|---|---|---|---|
| P1 | CSS/JS had no cache busting; on Vercel's CDN they were re-checked on every visit (`max-age=0`) | Medium | No versioning | Content hash in the URL (`style.css?v=…`); CSS/JS cached for 1 year (`immutable`), images 7 days, on the CDN too | ✅ code + `vercel.json` |
| P2 | Above-the-fold images (first banner, flash-sale row, product photo) were lazy-loaded, slowing the largest paint | Low | `loading="lazy"` everywhere | `fetchpriority="high"` for those; lazy for the rest | ✅ code review |
| P3 | Script loaded at the end of `<body>` | Low | Placement | `defer` in `<head>` (downloads in parallel) | ✅ e2e |
| P4 | Missing indexes for frequent queries | Low | Schema | Indexes on `orders(status)`, `wishlist(product_id)`, `reviews(user_id)`, `products(featured, sold_count)` | ✅ `npm run check` |
| P5 | Admin order tabs ran 5 count queries | Low | Loop | One `GROUP BY` query | ✅ e2e |
| P6 | Vercel function bundled 10 MB of photos it never serves (the CDN serves them) | Low | `includeFiles` too broad | Bundle only views, `database.sql`, CSS and JS | ⚠️ needs a Vercel build to confirm (section 12) |
| P7 | Search suggestion requests piled up while typing | Low | No cancel | Debounce + `AbortController` | ✅ code review |

No changes were needed for: fonts (system fonts, nothing downloaded), JavaScript size (one 8 KB file, no framework), product images (WEBP, 15–55 KB each).

## 5. Files modified

**New:** `lib/security.js`, `eslint.config.js`, `scripts/check.js`, `scripts/browser-audit.js`, `scripts/security-check.js`, `public/images/og-image.png`, `WEBSITE_AUDIT_REPORT.md`

**Changed:**
- Server: `server.js`, `lib/helpers.js`, `routes/shop.js`, `routes/cart.js`, `routes/checkout.js`, `routes/auth.js`, `routes/admin.js`
- Data: `database/database.sql` (4 indexes, `orders.checkout_token`)
- Front-end: `public/css/style.css`, `public/js/main.js`
- Templates: `views/partials/header.ejs`, `footer.ejs`, `product-card.ejs`; `home`, `products`, `product`, `cart`, `checkout`, `order`, `account`, `login`, `register`; `views/admin/_top`, `_bottom`, `dashboard`, `products`, `categories`, `customers`, `customer`, `orders`, `order`, `reviews`
- Config/docs: `package.json`, `package-lock.json`, `vercel.json`, `README.md`, `REPORT.md`, `REPORT.pdf`, `scripts/screenshots.js`, `screenshots/*.png` (regenerated)

**Not changed (inspected, no issues):** `db.js`, `api/index.js`, `views/about.ejs`, `help.ejs`, `wishlist.ejs`, `message.ejs`, `views/admin/product-form.ejs`, `.gitignore`, `.vercelignore`, `scripts/reset-db.js`, `scripts/build-report.js`, `DEMO_GUIDE.md`, `DEPLOY_GUIDE.md`

No features were removed and no sample data was replaced. The live database was not touched.

## 6. Security audit findings

Checks with no problem found:
- **Secrets:** none hard-coded. `SESSION_SECRET` is only in Vercel (stored as a hidden Secret). `.env*` and `.vercel/` are excluded from git, from the Vercel upload and from the submission zip. The GitHub repository was checked earlier: 0 secret files.
- **SQL injection:** every query uses bound parameters; the only dynamic SQL pieces (sort order, placeholders) come from whitelists.
- **XSS:** EJS escapes all output (`<%= %>`); `<%-` is only used for includes and fixed attributes; live-search results are escaped in JavaScript; CSP blocks inline scripts.
- **Authorization:** customers can only view or cancel their own orders (IDOR tested). Admin routes are protected by one `router.use(requireAdmin)`.
- **CORS:** the app sends no CORS headers, so other sites cannot read its responses (correct for a server-rendered site).
- **Demo payments:** card and wallet fields have no `name` attribute and are never sent.

Results of `npm run test:security` (fresh database): **35 passed, 0 failed**. The tests are grouped into headers, CSRF, open redirect, input handling, registration/XSS, authorization, cart tampering, duplicate orders, file upload, SEO files and brute force.

Accepted, documented limitations:
- Cookie sessions cannot be revoked server-side before they expire (24 h). Changing `SESSION_SECRET` logs everyone out.
- The rate limiter is per server instance (see 13).
- Demo passwords (`admin123`, `customer123`) are public in the README. That is intended for a student demo, but they must be changed for real use.

## 7. Performance improvements

See 4.6. Measurable results: CSS/JS are now cached long-term instead of revalidated on every page view; the Vercel function bundle should shrink by about 10 MB of images; first-screen images get download priority; 4 indexes added; the per-request query count on the account and admin-orders pages went down.

## 8. Responsive design findings

See 4.5. The baseline audit found horizontal scrolling on 4 admin pages at phone and laptop widths. The final audit at 7 widths found **0 issues on 30 pages**. 320 px phone screenshots of the product list, product page, account and order pages were reviewed by eye: nothing overlaps, and the filters panel and header work.

## 9. SEO and accessibility findings

See 4.3 and 4.4. All pages now have one `<h1>`, a page title and a meta description. All form fields have labels, all images have `alt` text, colour contrast meets AA, a keyboard user can reach and see everything, and the slider can be paused. Search engines get a sitemap and robots.txt, private pages are `noindex`, and links shared on social media show a picture.

## 10. Testing results (final run, fresh database each time)

| Check | Result |
|---|---|
| `npm run lint` (ESLint) | ✅ 0 errors, 0 warnings (baseline: 1 error) |
| `npm run check` (build check) | ✅ 27 templates, 31 renders, database loads (62 products, 225 reviews…), no FK errors, 173 assets |
| `npm audit` (production and dev) | ✅ 0 vulnerabilities (baseline: 9 high in dev tools) |
| `npm run audit:browser` – 210 page views | ✅ 0 issues (baseline: 34 issues) |
| `npm test` – end-to-end shopping + admin flow | ✅ all steps pass, 26 screenshots |
| `npm run test:security` | ✅ 35 / 35 |
| Type checking | Not applicable: the project is plain JavaScript with no TypeScript |

Everything in this table was actually run. The order was: lint → check → browser audit → end-to-end → security tests, with the database reset in between.

## 11. Production build status

The project has no compile/bundle step (server-rendered EJS, no front-end build). The "production build" is `npm run build` (lint + check), and it **passes**. Vercel now runs `npm run check` as its build command, so a broken template or SQL file stops the deploy and the current live site stays up.

## 12. Vercel deployment readiness

| Item | Status |
|---|---|
| Node version | ✅ Project setting is 26.x, but `engines` makes Vercel use **24.x**, the version tested (confirmed in the `vercel build` output) |
| Framework / routing | ✅ `framework: null`, `public/` served by CDN, everything else rewritten to `api/index.js`; no SPA fallback needed (server-rendered) |
| Environment variables | ✅ `SESSION_SECRET` exists in Production. Preview deployments do not have it: logins there still work, but users get logged out whenever a new server instance starts (a warning is logged) |
| Serverless compatibility | ✅ no `app.listen` on Vercel; database and uploads in `/tmp`; sessions in cookies; `trust proxy` for https cookies |
| Security / cache headers on CDN files | ✅ added in `vercel.json` |
| Asset paths | ✅ all 173 checked by `npm run check`; CSS/JS needed by the function are included |
| `vercel build` locally | ⚠️ **Not verified.** Vercel CLI 66.6.0 fails on this Windows PC with `spawn cmd.exe ENOENT` before running the build command. It fails the same way with `cmd.exe` explicitly on PATH, so the bug is in the CLI, not the project. The build command itself (`npm run check`) passes locally |
| Deployed? | ❌ **No.** As requested, nothing was pushed or deployed. The live site still runs the pre-audit code |

**Recommended way to verify:** push the branch `audit/production-hardening` to GitHub. Vercel then builds a **Preview** deployment on its own URL, which does not affect the live site. Run `BASE_URL=<preview-url> npm run audit:browser` against it, then merge to `main` to go live. This needs your permission.

## 13. Remaining issues (need external access or a decision)

| # | Issue | Severity | Why it is not fixed | What is needed |
|---|---|---|---|---|
| X1 | On Vercel, orders, new accounts and reviews are lost when a server instance restarts, and two instances do not share data | Medium (fine for a demo; not for a real shop) | SQLite in `/tmp` is temporary on serverless hosting | A hosted database (e.g. Turso/libSQL – closest to SQLite – or Vercel Postgres/Neon) and an account with that provider |
| X2 | No "forgot password" email | Medium | Needs an email-sending service | An email provider account (e.g. Resend, SendGrid) and its API key in Vercel |
| X3 | Rate limits are counted per server instance, so a determined attacker hitting many instances gets more attempts | Low | Needs shared storage | A shared store such as Upstash Redis |
| X4 | Card and mobile-wallet payments are demonstrations | Low (by design for the assignment) | Requires a merchant account | A payment gateway account and keys |
| — | Real Vercel build of the new code | — | Needs permission to create a preview deployment | Your OK to push the branch |
