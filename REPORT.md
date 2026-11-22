# Project Report: Haven Goods Online Shopping Website

**Live website:** https://haven-goods.vercel.app &nbsp;·&nbsp; Admin login: admin@havengoods.test / admin123 &nbsp;·&nbsp; Customer login: ayesha@example.com / customer123

## 1. Introduction

Haven Goods is a local shop on Main Bazaar, Lahore, that sells electronics, clothing, shoes, books, accessories, home and kitchen items, beauty products and sports goods. Until now customers could only buy in person. The aim of this project was to design and develop an e-commerce website where customers can browse products, add items to a shopping cart and place orders, while the shop's staff manage the store from an admin dashboard.

The website was designed to feel like the large online marketplaces customers already use: a big search bar with live suggestions, a banner slider, flash sale deals, product ratings and reviews, a wishlist and order tracking.

## 2. Objectives

- Show the business name, logo, navigation menu and featured products on a home page.
- List at least 10 products with name, image, description and price (the site has **62 real products**).
- Organise products into categories such as Electronics, Clothing, Books and Accessories.
- Let customers add, remove and update quantities in a shopping cart.
- Let customers register an account with basic information.
- Provide a checkout that shows the order summary, total price and customer details.
- Offer Cash on Delivery and an example of an online payment option.
- Let the admin view customer orders and update their status.
- Provide an admin dashboard to manage products, categories, customers and orders.

## 3. Technologies Used

| Layer | Technology | Why |
|---|---|---|
| Server | Node.js + Express | Simple, widely used web framework |
| Pages | EJS templates, HTML5, CSS3 | Server-rendered pages that work in every browser and on mobile |
| Client scripts | Plain JavaScript | Banner slider, countdown, photo gallery, live search, quantity buttons |
| Database | SQLite (built into Node.js 22.5+) | A real SQL database in a single file; no separate server to install |
| Sessions | express-session | Keeps the shopping cart and login state |
| Uploads | multer | Admin uploads product photos |
| Security | scrypt password hashing | Passwords are never stored as plain text |
| Testing | Puppeteer (headless Chrome) | Automated end-to-end test of every page |
| Hosting | Vercel (serverless functions + CDN) | Free, fast hosting with an https link |

## 4. System Design

### 4.1 Users of the system

- **Visitor:** browses and searches products, filters by category/brand/price/rating, uses the cart.
- **Customer:** everything a visitor can do, plus checkout, order tracking, order cancellation, wishlist, reviews and profile.
- **Admin:** manages products, photos, categories, customers, orders and reviews from the dashboard.

### 4.2 Database design

The database file `database/database.sql` creates nine tables and loads the sample data:

| Table | Main columns | Purpose |
|---|---|---|
| `categories` | id, name, description | Product categories |
| `products` | id, category_id, name, brand, description, price, old_price, stock, image, featured, sold_count, warranty, specs | Store catalogue (old_price = price before discount) |
| `product_images` | id, product_id, image, sort_order | Photo gallery for each product |
| `users` | id, name, email, password_hash, phone, address, city, role | Customers and admins |
| `reviews` | id, product_id, user_id, reviewer_name, rating, comment | Ratings and reviews |
| `wishlist` | user_id, product_id | Products a customer saved |
| `orders` | id, user_id, customer details, payment_method, payment_status, status, subtotal, shipping, total | One row per order |
| `order_items` | id, order_id, product_id, product_name, image, price, quantity | Products in each order |
| `order_status_history` | id, order_id, status, note, created_at | Tracking timeline of each order |

**Relationships:** a category has many products; a product has many images and reviews; a user has many orders, reviews and wishlist items; an order has many items and status-history rows. The product name, photo and price are copied into `order_items`, so old orders stay correct even if a product changes later.

### 4.3 Order flow

1. The customer adds products to the cart (works without logging in).
2. At checkout the customer logs in or registers; saved details are filled in.
3. The customer selects Cash on Delivery, Card (demo) or Mobile Wallet (demo) and places the order.
4. The order is saved as **Pending**, stock is reduced and the first tracking entry is added.
5. The admin moves it through **Processing → Shipped → Delivered**, optionally adding a note (for example a courier tracking number). Each change appears on the customer's tracking page.
6. A customer can cancel an order while it is still Pending; cancelled orders return their items to stock.

## 5. Modules and Screenshots

### 5.1 Home page
Logo and business name, search bar, category menu, banner slider, flash sale with countdown timer, categories, top picks (featured products), top brands and "Just For You".

![Home page](screenshots/01-home-page.png)

![Live search suggestions](screenshots/02-live-search-suggestions.png)

### 5.2 Products and categories
62 products in 8 categories, with real product photos. Customers can filter by category, brand, price range and rating, sort by price, popularity, rating or newest, and move between pages.

![All products](screenshots/03-all-products.png)

![Category with brand filter](screenshots/04-category-with-brand-filter.png)

### 5.3 Product details
Photo gallery, price with discount, quantity selector, Buy Now / Add to Cart, delivery and warranty information, seller information, specifications, ratings breakdown and customer reviews.

![Product details](screenshots/05-product-details.png)

![Ratings and reviews](screenshots/13-product-ratings-and-reviews.png)

### 5.4 Shopping cart
Change quantities with the − / + buttons, update or clear the cart, remove items. The cart shows savings and how much more is needed for free delivery (free above Rs. 5,000).

![Shopping cart](screenshots/06-shopping-cart.png)

### 5.5 Customer registration and account
Customers create an account with name, email, phone, address, city and password. The form is checked on the server (valid email and phone, password length, matching passwords, email not already used).

![Customer registration](screenshots/07-customer-registration.png)

![Customer account and orders](screenshots/14-customer-account-orders.png)

![Wishlist](screenshots/12-wishlist.png)

### 5.6 Checkout and payment methods
The checkout shows the shipping address (customer details), payment methods and the order summary with delivery fee and total. Card and Mobile Wallet are demonstrations: their fields are never sent to the server.

![Checkout – Cash on Delivery](screenshots/08-checkout-cash-on-delivery.png)

![Checkout – card payment demo](screenshots/09-checkout-card-payment-demo.png)

![Checkout – mobile wallet demo](screenshots/10-checkout-mobile-wallet-demo.png)

### 5.7 Order confirmation and tracking

![Order confirmation](screenshots/11-order-confirmation-tracking.png)

![Order tracking after the admin shipped it](screenshots/25-customer-order-tracking.png)

### 5.8 Admin dashboard

![Admin login](screenshots/16-login-page.png)

![Admin dashboard](screenshots/17-admin-dashboard.png)

### 5.9 Manage products and categories

![Admin products](screenshots/18-admin-products.png)

![Admin add product](screenshots/19-admin-add-product.png)

![Admin categories](screenshots/20-admin-categories.png)

### 5.10 Manage customers, orders and reviews

![Admin customers](screenshots/21-admin-customers.png)

![Admin orders](screenshots/22-admin-orders.png)

![Admin order details](screenshots/23-admin-order-details.png)

![Admin reviews](screenshots/24-admin-reviews.png)

### 5.11 Mobile view
The layout adapts to phones and tablets.

![Mobile home page](screenshots/26-mobile-home.png)

## 6. Testing

An automated end-to-end test (`scripts/screenshots.js`) drives a real Chrome browser through the whole website and stops with an error if any step fails. All steps pass:

| # | Test | Result |
|---|---|---|
| 1 | Home page shows flash sale, categories, top picks and products | Pass |
| 2 | Live search shows suggestions while typing | Pass |
| 3 | Product list shows all 62 products; category, brand and search filters work | Pass |
| 4 | Product page shows photo gallery, details and reviews | Pass |
| 5 | Add to cart with a chosen quantity | Pass |
| 6 | Update a cart quantity – the correct product changes | Pass |
| 7 | Remove an item from the cart | Pass |
| 8 | Checkout without login redirects to login | Pass |
| 9 | Registering returns the customer to checkout with details filled in | Pass |
| 10 | Place an order with Cash on Delivery | Pass |
| 11 | Save products to the wishlist | Pass |
| 12 | Post a product review; it appears on the product page | Pass |
| 13 | Place an order with the mobile-wallet demo, then cancel it (marked "Refunded (demo)") | Pass |
| 14 | Admin pages are blocked for non-admins | Pass |
| 15 | Admin adds a product with a main photo and 2 gallery photos | Pass |
| 16 | Admin adds a category | Pass |
| 17 | Admin sees the new customer and their orders | Pass |
| 18 | Admin changes an order to Shipped with a note; customer sees it on the tracking page | Pass |
| 19 | Admin sees the new review on the Reviews page | Pass |

During testing a bug was found and fixed: cart quantity fields named `qty[5]` were read by Express as a list instead of product IDs, so updating quantities changed the wrong products. The fields were renamed to `qty_5` and a check was added to the test.

## 7. Deployment

The website is deployed on **Vercel** and is live at **https://haven-goods.vercel.app**.

Vercel runs the Express app as a serverless function (`api/index.js`), while the CSS, JavaScript and product photos in `public/` are served from Vercel's global CDN. Because serverless servers cannot keep files permanently, the SQLite database is created in temporary storage from `database.sql` whenever a new server instance starts, and login sessions are kept in a signed cookie so they work on every instance. The deployment steps were:

1. `npm install -g vercel` – install the Vercel command-line tool.
2. `vercel login` – log in to the Vercel account.
3. `vercel link --yes --project haven-goods` – create the project.
4. Store a random `SESSION_SECRET` as a secret environment variable.
5. `vercel deploy --prod --yes` – upload and publish the site.

After deployment, the live site was checked: all pages return 200 OK, images and CSS are served from the CDN cache, login, cart and logout work with a secure cookie, customers cannot open the admin panel, and a browser loads the home page with no broken images or script errors. Full details are in `DEPLOY_GUIDE.md`.

*Limitation:* orders and accounts created on the live demo are temporary and reset when Vercel starts a new server instance. A production shop would use a hosted database such as Vercel Postgres (Neon) or Turso.

## 8. Security Measures

- Passwords hashed with scrypt and a random salt.
- Login sessions are kept in a signed, HTTP-only cookie (Secure over https).
- All database queries use parameters (protection against SQL injection).
- EJS escapes all output (protection against HTML/script injection).
- Admin pages are protected by a role check.
- Uploads accept only image files up to 2 MB.
- Demo card and wallet details are never submitted or stored.

## 9. Limitations and Future Work

- Connect a real payment gateway (card processor or mobile wallet).
- Email/SMS notifications for order confirmation and status changes.
- Discount vouchers and coupon codes.
- Password reset by email.
- Sales charts and reports in the admin dashboard.
- Multiple sellers (a full marketplace) instead of one store.

## 10. Conclusion

The project meets every assignment requirement: a home page with branding, navigation and featured products; 62 products with real photos, descriptions and prices organised into 8 categories; a working shopping cart; customer registration; a checkout with order summary, total and customer details; Cash on Delivery with example online payment options; and an admin dashboard for managing products, categories, customers and orders. Extra features such as ratings and reviews, wishlist, live search, filters, flash sale and order tracking make it work like a real online shopping site. The website was tested end to end, is deployed live at https://haven-goods.vercel.app, and gives the shop a practical way to start selling online.

## 11. Credits

Product photos come from the free DummyJSON product catalogue (dummyjson.com). Book covers come from Open Library (openlibrary.org).
