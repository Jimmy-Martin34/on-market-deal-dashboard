# Subdivide Deal Dashboard

Embeddable Next.js dashboard for newly listed vacant land properties that may be subdivision opportunities.

## What It Does

- Shows imported properties in status tabs: Needs review, Sent to CRM, Completed, and Discarded.
- Imports records from ActivePieces when new leads are posted to the dashboard webhook.
- Deduplicates imported records before saving them.
- Lets reviewers send a property to a CRM webhook, complete it, or discard it.
- Refreshes the visible dashboard every 15 minutes.

## Live Import

ActivePieces should send each new lead directly to:

```text
Method: POST
URL: https://on-market-deal-dashboard.vercel.app/api/import
Header: Content-Type: application/json
```

The dashboard no longer uses a scheduled Vercel Cron import. New properties appear after ActivePieces posts them, and the iframe refreshes its data every 15 minutes.

## Required Vercel Environment Variables

```bash
CRM_WEBHOOK_URL=""
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

Use the Upstash Redis integration from the Vercel Marketplace for durable production storage. Without Redis env vars, the app falls back to `local-data/properties.json`, which is only suitable for local development.

## ActivePieces Payloads

The body can be a single property object, a property array, or a wrapper object:

```json
{
  "date": "2026-05-16 16:43:30",
  "propertyId": "201859330",
  "address": "480 Brown Rd, Spartanburg, SC 29302",
  "price": "$165,000",
  "acreage": "8.2",
  "zipCode": "29302",
  "propertyLink": "https://www.redfin.com/SC/Spartanburg/480-Brown-Rd-29302/home/201859330",
  "landVuLink": "",
  "countSold": "33",
  "subdivideEstimate": "$231,798",
  "status": "NEW",
  "County, St": "Spartanburg, SC"
}
```

Accepted payload keys include `body`, `properties`, `records`, `data`, `items`, or `listings`.

Deduplication prefers `parcelId`, then `listingUrl`, then normalized address/city/state/zip.

## Local Commands

```bash
npm install
npm run dev
npm run build
```

Open `http://localhost:3000` for the iframe-ready dashboard.

## Website Embed

Paste this into your website where the dashboard should appear:

```html
<div style="width: 100%; height: 900px; overflow: hidden;">
  <iframe
    src="https://on-market-deal-dashboard.vercel.app"
    title="On Market Deal Dashboard"
    style="width: 100%; height: 100%; border: 0;"
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  ></iframe>
</div>
```

If Vercel gives the project a different production URL, replace the `src` value with that URL.
