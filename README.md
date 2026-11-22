# Haven Goods – Online Shopping Website

A full online store for a local business, built like a real marketplace: 62 real products in 8 categories, product photo galleries, discounts, flash sale, ratings & reviews, wishlist, live search, filters, shopping cart, checkout with **Cash on Delivery** and **demo online payments**, order tracking, and an **admin dashboard** to manage products, categories, customers, orders and reviews.

**Live website:** <https://haven-goods.vercel.app> (hosted on Vercel – see [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md))
**Source code:** <https://github.com/ibtisamawan/haven-goods> (every push to `main` deploys automatically)

**Tech stack:** Node.js (22.13+ or 24), Express, EJS templates, SQLite (built into Node – no separate database server), HTML, CSS, JavaScript. Deployed on Vercel.

## How to run on your computer

1. Install [Node.js](https://nodejs.org) version 22.13 or newer (version 24 recommended).
2. Open a terminal in this folder and run:

   ```
   npm install
   npm start
   ```

3. Open <http://localhost:3000> in your browser.

On first start the app builds `database/shop.db` from **`database/database.sql`** (all tables + sample data). To go back to the original sample data, stop the server and run `npm run reset-db`.

## Demo accounts

| Role     | Email                   | Password    |
|----------|-------------------------|-------------|
| Admin    | admin@havengoods.test   | admin123    |
| Customer | ayesha@example.com      | customer123 |

Other sample customers (usman@, fatima@, hamza@, zainab@, ahmed@ `example.com`) also use `customer123`. You can register a new account from **Sign up**. The admin panel is at <http://localhost:3000/admin>.

## Features

| Assignment module | What the website has |
|---|---|
| Home page | Logo, business name, search bar with live suggestions, category menu, banner slider, flash sale with countdown, categories, top picks, top brands, "Just For You" |
| Product management | 62 products with real photos (multi-photo gallery), name, description, price, discount, stock, brand, warranty, specifications; admin can add/edit/delete and upload photos |
| Product categories | Electronics, Clothing, Shoes, Books, Accessories, Home & Kitchen, Beauty & Fragrances, Sports & Outdoors; filters by brand, price and rating; sorting; pagination |
| Shopping cart | Add, remove, update quantity, clear cart, savings and free-delivery progress |
| Customer registration | Sign up, login, profile, order history, wishlist |
| Checkout system | Shipping address, order summary, delivery fee, total, customer details |
| Payment methods | Cash on Delivery, Card (demo) and Mobile Wallet (demo) – no real payment is taken |
| Order management | Order tracking timeline, customer can cancel pending orders, admin updates status with notes |
| Admin dashboard | Revenue, orders, customers, best sellers, low stock; manage products, categories, customers, orders, reviews |

## Project structure

```
haven-goods/
├── server.js              The Express app (npm start runs it locally)
├── api/index.js           Vercel entry point (reuses server.js)
├── vercel.json            Vercel settings
├── DEPLOY_GUIDE.md        How the site was deployed on Vercel, step by step
├── db.js                  SQLite connection; builds the database from database.sql
├── lib/helpers.js         Store settings, password hashing, login checks
├── routes/                shop.js, cart.js, checkout.js, auth.js, admin.js
├── views/                 EJS page templates (admin pages in views/admin)
├── public/                CSS, JavaScript, logo, product photos, uploads
├── database/database.sql  Database file (SQL): 9 tables + sample data
├── screenshots/           26 screenshots of all major pages
├── scripts/               reset-db, end-to-end test + screenshots, report builder
├── REPORT.pdf             Project report (source: REPORT.md)
└── DEMO_GUIDE.md          Step-by-step script for the live demonstration
```

## Useful commands

| Command | What it does |
|---|---|
| `npm start` | Run the website at http://localhost:3000 |
| `npm run reset-db` | Restore the original sample data (stop the server first) |
| `npm run screenshots` | Automated end-to-end test of the whole site; saves fresh screenshots (needs Chrome or Edge, fresh database) |
| `npm run report` | Rebuild `REPORT.pdf` from `REPORT.md` |

## Notes

- Passwords are stored hashed (scrypt + random salt), never as plain text.
- Logins and the cart are kept in a signed, HTTP-only cookie (`cookie-session`).
- On the live Vercel site the database restarts from `database.sql` from time to time, so new orders/accounts there are temporary demo data.
- The card and mobile-wallet payments are **demonstrations only**: those fields have no `name` attribute, so nothing typed into them is sent to the server or saved.
- Image credits: product photos from the free [DummyJSON](https://dummyjson.com) product catalogue; book covers from [Open Library](https://openlibrary.org). Prices are converted to Pakistani Rupees.
