# DealSense — Smart Shopping

DealSense is a responsive price-tracking prototype. It is not an online store: it helps you inspect product prices, view dated price observations, and make a history-based buy/wait decision.

## Run locally

Requirements: Node.js 22.13 or newer.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). The development command starts the React app and its server-side API together.

## Real Rewalto data

Add your API key to the root `.env` file:

```env
REWALTO_API_KEY=your_rewalto_api_key
PORT=8787
```

Restart the app and choose **Real API Mode** in the header or Settings. The key is read only by `server/index.ts`, sent to Rewalto as a Bearer token, and is never embedded in the frontend.

This integration follows Rewalto's [Myntra listings](https://rewalto.com/developers/docs/api/myntra/products) and [price history](https://rewalto.com/developers/docs/api/myntra/price-history) documentation:

- A Myntra URL must contain a retailer product ID (SKU), or use **Have a Myntra product ID?** to enter it directly.
- The server calls `GET /v1/data/listings` with `retailer=myntra` and the exact `retailerSku`, then fetches actual `GET /v1/data/observations` records for that SKU.
- The app does not search by free text, scrape retailer pages, or infer a match from a product name.
- Rewalto coverage in this prototype is Myntra only. Amazon and Flipkart links are not looked up in Real API Mode.
- The home page can browse the live Rewalto Myntra catalog in pages of 20. Loading a page costs 1 credit per 10 delivered listings (up to 2 credits per page); rereading the same records within 7 days is free. The app does not load the catalog automatically.
- Opening one catalog product's history makes a separate listing lookup and observation request. The chart request is capped at the newest 100 observations; observations cost 1 credit per 10 delivered records, and repeated reads within 7 days are free.
- Empty results, missing observations, invalid credentials, provider limits, and other API failures are reported. The app does not substitute sample values for a failed real lookup.
- If Rewalto has more than 100 observations for a product, the detail page discloses that the chart only shows the newest 100.

## Demo Mode

Demo Mode works without an API key. Products and prices are sample data and visibly labeled **DEMO DATA**. Submitting a URL in Demo Mode opens a sample product; it does not fetch or match the submitted URL. Demo observations are not mixed with Rewalto observations.

## Storage and production

Tracked products, recent searches, and the selected mode are stored in the current browser's `localStorage`; they are private to that browser and are not synced across devices. The API key remains server-side. To build and serve the production app:

```powershell
npm run build
npm start
```

The server serves `dist/` and the `/api` endpoints. Configure `REWALTO_API_KEY` in the server environment for real data. The production build includes an installable PWA shell; API calls are never cached and price lookups need an internet connection.

## Deploy and share on WhatsApp

The local address (`localhost`) only works on your computer. To make a link that your teacher and classmates can open:

1. Create a private GitHub repository and upload this project. Do not upload `.env`; it is excluded by `.gitignore`.
2. Create a web service on Render from that repository and use the included `render.yaml` settings (build: `npm install && npm run build`; start: `npm start`).
3. In the Render service's Environment settings, add `REWALTO_API_KEY` as a secret value. Never put it in `VITE_` variables or source files.
4. After the service deploys, open its HTTPS URL and use the **Share** button to send it through WhatsApp.
5. To install on Android, open that HTTPS link in Chrome, open the three-dot menu, and choose **Install app** or **Add to Home screen**. On iPhone, open the link in Safari, tap **Share**, then **Add to Home Screen**.

The app's Share button intentionally will not share a `localhost` link. Publishing the site requires your own hosting account; this project does not upload your code or API key to a hosting provider.

## Checks

```powershell
npm test
npm run typecheck
npm run build
```
