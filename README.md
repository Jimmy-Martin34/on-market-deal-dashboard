# Subdivide Deal Dashboard

Embeddable Next.js dashboard for newly listed vacant land properties that may be subdivision opportunities.

## What It Does

- Shows imported properties in status tabs: Needs review, Sent to CRM, Completed, and Discarded.
- Imports records from ActivePieces on a Vercel Cron schedule.
- Deduplicates imported records before saving them.
- Lets reviewers send a property to a CRM webhook, complete it, or discard it.

## Import Schedule

`vercel.json` schedules `/api/cron/import-properties` at:

```json
"0 11 * * *"
```

That is 6:00 a.m. fixed Eastern Standard Time, expressed in UTC. If you want clock-time Eastern with daylight saving time, change this seasonally because Vercel Cron uses UTC.

## Required Vercel Environment Variables

```bash
CRON_SECRET="replace-with-a-long-random-secret"
ACTIVEPIECES_WEBHOOK_URL="replace-with-your-activepieces-webhook-url"
CRM_WEBHOOK_URL=""
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
```

Use the Upstash Redis integration from the Vercel Marketplace for durable production storage. Without Redis env vars, the app falls back to `local-data/properties.json`, which is only suitable for local development.

## ActivePieces Payloads

The cron route triggers the ActivePieces webhook. If that webhook returns JSON records, the app imports them directly.

You can also configure ActivePieces to POST records to:

```text
/api/import
```

Accepted payload shapes include an array directly or an object with `properties`, `records`, `data`, `items`, or `listings`.

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
