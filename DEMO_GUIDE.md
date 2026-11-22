# Live Demonstration Guide (about 8–10 minutes)

## Before the demo

1. Open a terminal in the project folder.
2. Run `npm run reset-db` so the database has clean sample data.
3. Run `npm start` and open <http://localhost:3000> in Chrome or Edge.
4. Keep a second browser window (or a private window) ready for the admin.

## Part 1 – Customer side (5 minutes)

| Step | What to do | What to say |
|---|---|---|
| 1 | Show the **home page** – let the banner slide, scroll past Flash Sale, Categories, Top Picks, Top Brands | "Home page with business name, logo, navigation menu and featured products." |
| 2 | Type `sam` in the search bar | "Live search suggestions, like on real shopping sites." |
| 3 | Click **Electronics**, tick the **Samsung** brand, change **Sort by** to *Price: low to high* | "Products are organised into categories and can be filtered by brand, price and rating." |
| 4 | Open **iPhone 13 Pro** – hover the small photos, show price/discount, delivery box, specifications and reviews | "Each product has photos, description, price, stock, warranty and customer reviews." |
| 5 | Click **Add to Cart**; add one more product; open the **cart**; change a quantity with + and click **Update cart**; remove an item | "The cart supports add, remove and update quantity." |
| 6 | Click **Proceed to Checkout** – you are asked to log in. Click **Sign up** and register a new customer | "Customer registration with basic information." |
| 7 | On checkout show the address, order summary and total. Click **Card** and **Mobile Wallet** to show the demo forms, then choose **Cash on Delivery** and **Place Order** | "Checkout shows the order summary, total and customer details. Cash on Delivery plus an example online payment option." |
| 8 | Show the **order confirmation** with the tracking timeline | "Customers can track their order." |
| 9 | Click ♥ **Save** on a product and open **Wishlist**; leave a ★ review on a product | "Wishlist and ratings make it work like a real marketplace." |
| 10 | Open **My Account** to show the order history | |

## Part 2 – Admin side (4 minutes)

| Step | What to do | What to say |
|---|---|---|
| 1 | Go to <http://localhost:3000/admin> and log in as `admin@havengoods.test` / `admin123` | "Only admin accounts can open the admin panel." |
| 2 | Show the **Dashboard** – revenue, orders, best sellers, low stock | "Admin dashboard overview." |
| 3 | **Products** → **Add product** – fill in the form, upload a photo, save. Then **Edit** a product's price | "Admin manages products and their photos." |
| 4 | **Categories** – add a new category | "Admin manages categories." |
| 5 | **Customers** – open the customer you registered in Part 1 | "Admin can view customers and their orders." |
| 6 | **Orders** – open the order you placed in Part 1, change status to **Shipped** and add a note | "Admin views customer orders and updates their status." |
| 7 | Switch back to the customer window and refresh the order page – the new status and note appear | "The customer sees the update immediately." |
| 8 | **Reviews** – show the review you wrote | "Admin can moderate reviews." |

## If something goes wrong

- *Port 3000 is in use:* run `set PORT=3001` (Command Prompt) or `$env:PORT=3001` (PowerShell), then `npm start` and open http://localhost:3001.
- *You want to start again with clean data:* stop the server (Ctrl + C), run `npm run reset-db`, then `npm start`.
