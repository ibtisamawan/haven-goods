# How Haven Goods Was Deployed on Vercel

**Live website:** <https://haven-goods.vercel.app>

Vercel is a cloud hosting platform. It runs the website for free on its servers so anyone can open it with a link, without your computer being on.

## 1. How the app works on Vercel

On your computer the app runs as one normal web server (`npm start`). Vercel instead runs it as a **serverless function**: a copy of the app starts automatically when someone visits, and stops after a while when nobody is using it. A few small changes make the same code work in both places:

| File | What it does |
|---|---|
| `api/index.js` | Vercel's entry point. It just loads the Express app from `server.js`. |
| `vercel.json` | Sends every page request to `api/index.js`, serves the `public/` folder (CSS, JS, photos) from Vercel's fast CDN, and packages the `views/` and `database/` folders with the function. |
| `server.js` | Exports the app, and only starts its own server when run locally with `npm start`. |
| `db.js` | On Vercel the project folder is read-only, so the SQLite database is created in `/tmp` from `database/database.sql`. |
| Login sessions | Stored in a **signed cookie** (`cookie-session`) instead of server memory, so a login works on every copy of the app. The cookie is signed with the secret `SESSION_SECRET`. |
| `.vercelignore` | Files that are never uploaded (`node_modules`, secrets in `.env*`, the local database, screenshots). |

> **Note about data:** each new copy of the app starts again from `database.sql`. Accounts, orders and reviews created on the live site are therefore temporary demo data and reset from time to time. The local version (`npm start`) keeps all data. A real shop would connect a hosted database (for example Vercel Postgres/Neon or Turso).

## 2. The commands that were run

All commands were run in a terminal inside the `haven-goods` folder.

**Step 1 – Install the Vercel command-line tool**

```
npm install -g vercel
vercel --version
```

**Step 2 – Log in** (opens a link; approve it in the browser with your Vercel account)

```
vercel login
```

Output: `✓ Logged in as <your-username>`

**Step 3 – Create the Vercel project and link this folder to it**

```
vercel link --yes --project haven-goods
```

Output: `✓ Created <your-team>/haven-goods`

**Step 4 – Store the session secret** (a random value, never printed on screen)

```
.\scripts\vercel-set-secret.ps1
```

Output: `✓ Overrode SESSION_SECRET … Environments Production … Type Secret`

**Step 5 – Deploy to production**

```
vercel deploy --prod --yes
```

Output:

```
Production      https://haven-goods-xxxxxxxxx-<your-team>.vercel.app
▲ Aliased       https://haven-goods.vercel.app
✓ Ready in 17s
```

That's it: the site is live at **https://haven-goods.vercel.app**.

## 3. Checks after deploying

- Home page, product list, filters, product page, help page and search API return `200 OK`.
- CSS and product photos are served from Vercel's CDN cache (`x-vercel-cache: HIT`).
- Customer login, cart, account page and logout work; the session cookie is marked `Secure`.
- A customer is redirected away from `/admin`; unknown pages show the 404 page.
- A real browser loads the home page with no broken images and no JavaScript errors.

## 4. Source code on GitHub + automatic deploys

**GitHub repository:** <https://github.com/ibtisamawan/haven-goods>

**Step 6 – Put the code on GitHub**

```
git init -b main
git add -A
git commit -m "Haven Goods e-commerce website"
winget install --id GitHub.cli -e          # install the GitHub command-line tool
gh auth login --web                         # approve the one-time code at github.com/login/device
gh repo create haven-goods --public --source . --remote origin --push
```

The `.gitignore` file keeps `node_modules`, the local database and secret files (`.env*`, `.vercel`) out of GitHub.

**Step 7 – Connect GitHub to Vercel**

```
vercel git connect https://github.com/ibtisamawan/haven-goods.git --yes
```

Output: `> Connected`

## 5. Updating the live site later

Now every push to GitHub deploys automatically. Pushes to the `main` branch go straight to <https://haven-goods.vercel.app>:

```
git add -A
git commit -m "Describe your change"
git push
```

Open the project in the Vercel dashboard to watch the deployment. It takes about 20 seconds. You can still deploy by hand from your computer at any time:

```
vercel deploy --prod --yes
```

Useful extras:

| Command | What it does |
|---|---|
| `vercel ls` | List your deployments |
| `vercel logs haven-goods.vercel.app` | See the live server logs |
| `vercel inspect <deployment-url> --logs` | See the build logs of a deployment |
| `vercel rollback` | Go back to the previous deployment |

You can also manage everything in the Vercel dashboard: <https://vercel.com/dashboard>.

## 6. Demo accounts on the live site

| Role | Email | Password |
|---|---|---|
| Admin | admin@havengoods.test | admin123 |
| Customer | ayesha@example.com | customer123 |

These are public demo passwords, which is fine for a student project. For a real shop they must be changed.
