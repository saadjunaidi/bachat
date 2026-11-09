# Bachat Money Planner

Import bank statements, see where your money goes, and plan savings goals. Installable on phones, works offline, and **private by design**: statements are read and stored in the user's own browser. There is no backend and no database.

- **Overview**: money in vs. out (12 months) with savings rate, spending by category, biggest payees, total balance trend, automatic insights
- **Spending**: categories vs. 3-month average, searchable transactions, tap to re-categorise (optionally for every payment to that payee)
- **Goals**: target + date → monthly saving needed, on-track status, projected date; financial-freedom number and years to reach it
- **Statements**: Excel/CSV upload or paste, automatic header and column detection, remembers each bank's layout, skips already-imported transactions, backup file / share / code with restore and merge

## Tech

| | |
|---|---|
| UI | React 19, TypeScript (strict) |
| Build | Vite 6 |
| Charts | Chart.js 4 via react-chartjs-2 |
| Excel | SheetJS (lazy-loaded only when an Excel file is opened) |
| Offline / install | vite-plugin-pwa (Workbox service worker + web manifest) |
| Tests | Vitest: parsing, categorisation, de-duplication, backup round-trip, savings maths |
| Serving | nginx in a container (Cloud Run) or Firebase Hosting, with a strict Content-Security-Policy |

Fonts are bundled locally (Fontsource). The only request it ever makes is for exchange rates, and only if you add an account in a second currency. That request contains currency codes and dates, never your data.

```
src/
  lib/          pure logic, no React (easy to test)
    parse.ts        statement reading, header + column detection, dates and amounts
    categories.ts   categories, keyword rules, payee extraction
    importer.ts     adding rows with de-duplication
    model.ts        monthly totals, balances, insights
    finance.ts      goal maths
    backup.ts       backup code / file, restore, merge
    sample.ts       demo data shown on first visit
  components/   charts, transaction sheet, small UI pieces, install prompt
  views/        Overview, Spending, Goals, Statements
  store.tsx     app state (persisted to localStorage)
```

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # production build in dist/
npm run preview    # serve the build on http://localhost:8080
```

## Deploy to Google Cloud Run (recommended)

Cloud Run builds the `Dockerfile` for you, scales to zero when idle and gives you an HTTPS URL.

```bash
# one-time setup
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# deploy (run from this folder)
gcloud run deploy bachat \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 256Mi --cpu 1 \
  --min-instances 0 --max-instances 5
```

The command prints the service URL (`https://bachat-xxxxx-el.a.run.app`). Run the same command again to ship updates. Users get the new version automatically on their next visit.

The container build runs the tests first, so a failing test stops a bad deploy.

**Custom domain** (e.g. `bachat.yourdomain.com`): either
- use Cloud Run domain mappings, if your region supports them: `gcloud beta run domain-mappings create --service bachat --domain bachat.yourdomain.com --region asia-south1`, then add the DNS records it prints; or
- put a global external HTTPS load balancer with a serverless network endpoint group in front of the service (works in every region, adds Cloud CDN and Cloud Armor); or
- use Firebase Hosting (below) and point your domain at it.

**Cost**: the app is static, so each visit only serves a few files. With `min-instances 0`, light traffic usually stays within Cloud Run's free tier.

## Alternative: Firebase Hosting (static, global CDN)

Because there is no server code, the built `dist/` folder can also be hosted directly. `firebase.json` already sets the same security headers and caching.

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your GCP project
npm run build
firebase deploy --only hosting
```

## Security and privacy

- **Content-Security-Policy** allows only the app's own scripts, styles and fonts. No inline scripts, no third-party hosts, and the page can't be framed.
- No analytics, cookies or trackers. The server only sees normal web access logs.
- Data lives in the browser's `localStorage`. The app asks the browser to keep it persistent, and nudges users to back up every 30 days.
- A backup is a gzip-compressed, base64-encoded text file or code. It is **not encrypted**, so anyone holding it can read the transactions. The app warns users about this.
- `public/privacy.html` explains this in plain language. Review it before going public.

### SheetJS version note

The npm registry only carries SheetJS (`xlsx`) up to 0.18.5, which has known advisories (prototype pollution and ReDoS when parsing crafted files). Risk here is low because users only open their own bank statements in their own browser. Still, before a public launch, switch to the maintained build from SheetJS's CDN:

```bash
npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm test && npm run build
```

## Adding a bank

Most Indian statements work with no changes: the header row is detected automatically, and users can fix any column in the preview step before importing. To improve automatic category detection, add keywords to `RAW_RULES` in `src/lib/categories.ts` (the first match wins) and add a test case in `src/lib/__tests__/core.test.ts`.

## Ideas for later

- Optional encrypted cloud sync (e.g. Firebase Auth + Firestore storing an end-to-end encrypted blob), so data follows users across devices without backup codes
- PDF statement import (pdf.js text extraction per bank)
- Shared household view
- Hindi and other Indian language UI

*Bachat shows estimates from the user's own numbers. It is not financial advice.*
