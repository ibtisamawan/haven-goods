# Live Demonstration Guide (about 10 minutes)

**Website:** <https://haven-goods.vercel.app>  
**Source code:** <https://github.com/ibtisamawan/haven-goods>

| Role | Email | Password |
|---|---|---|
| Admin | admin@havengoods.test | admin123 |
| Customer | ayesha@example.com | customer123 |

## Before the demo (2 minutes)

**Option A – live website (recommended, nothing to install).** Open <https://haven-goods.vercel.app> in Chrome or Edge. Open a second **private/incognito window** for the admin, so the customer and admin can be logged in at the same time.

**Option B – on your own computer (if there is no internet).** Open a terminal in the project folder, run `npm install` (first time only), then `npm run reset-db` and `npm start`, and open <http://localhost:3000>.

Tip: on the live site, orders and new accounts are demo data and reset from time to time. That is normal.

## Part 1 – Customer side (5 minutes)

| Step | What to do | What to say |
|---|---|---|
| 1 | Show the **home page**: let the banner slide (it pauses when you point at it), scroll past Flash Sale, Categories, Top Picks, Top Brands | "Home page with business name, logo, navigation menu and featured products." |
| 2 | Type `sam` in the search bar | "Live search suggestions, like on real shopping sites." |
| 3 | Click **Electronics**, tick the **Samsung** brand, change **Sort by** to *Price: low to high* | "Products are organised into categories and can be filtered by brand, price and rating." |
| 4 | Open **iPhone 13 Pro**: point at the small photos, show price/discount, delivery box, specifications and reviews | "Each product has photos, description, price, stock, warranty and customer reviews." |
| 5 | Click **Add to Cart**; add one more product; open the **cart**; change a quantity with **+** and click **Update cart**; remove an item | "The cart supports add, remove and update quantity." |
| 6 | Click **Proceed to Checkout** – you are asked to log in. Click **Sign up** and register a new customer (password of at least 8 characters) | "Customer registration with basic information." |
| 7 | On checkout show the address, order summary and total. Click **Card** and **Mobile Wallet** to show the demo forms, then choose **Cash on Delivery** and **Place Order** | "Checkout shows the order summary, total and customer details. Cash on Delivery plus an example online payment option – no real payment is taken." |
| 8 | Show the **order confirmation** with the tracking timeline | "Customers can track their order." |
| 9 | Click ♥ **Save** on a product and open **Wishlist**; leave a ★ review on the product you ordered – it shows **Verified Purchase** | "Wishlist and ratings make it work like a real marketplace." |
| 10 | Open **My Account**: order history, profile and **Change Password** | |
| 11 | *(Optional)* Open the site on your **phone** | "The website is responsive – it works on phones, tablets and computers." |

## Part 2 – Admin side (4 minutes)

Use the **private window**.

| Step | What to do | What to say |
|---|---|---|
| 1 | Go to <https://haven-goods.vercel.app/admin> and log in as `admin@havengoods.test` / `admin123` | "Only admin accounts can open the admin panel." |
| 2 | Show the **Dashboard**: revenue, orders, best sellers, low stock | "Admin dashboard overview." |
| 3 | **Products** → **Add product**: fill in the form, upload a photo, save. Then **Edit** a product's price | "Admin manages products and their photos." |
| 4 | **Categories**: add a new category | "Admin manages categories." |
| 5 | **Customers**: open the customer you registered in Part 1 | "Admin can view customers and their orders." |
| 6 | **Orders**: open the order you placed in Part 1, change the status to **Shipped** and add a note | "Admin views customer orders and updates their status." |
| 7 | Switch back to the customer window and refresh the order page – the new status and note appear | "The customer sees the update immediately." |
| 8 | **Reviews**: show the review you wrote | "Admin can moderate reviews." |

## Part 3 – Technical points (1 minute, if asked)

- **Technologies:** Node.js, Express, EJS, SQLite (`database/database.sql`), deployed on Vercel; code on GitHub.
- **Security:** hashed passwords, protection against cross-site attacks (CSRF), login rate limiting, security headers, only admins can open the admin panel.
- **Testing:** automated browser tests, a 35-check security test, and a full audit (`WEBSITE_AUDIT_REPORT.md`).

## If something goes wrong

- *Live site logged you out:* the demo data was refreshed – just log in again (or sign up again).
- *No internet:* use Option B (local) above.
- *Local: port 3000 in use:* run `$env:PORT=3001` (PowerShell) or `set PORT=3001` (Command Prompt), then `npm start` and open http://localhost:3001.
- *Local: start again with clean data:* stop the server (Ctrl + C), run `npm run reset-db`, then `npm start`.
