# Infiuba Alojamientos Web

Bilingual MVP (English + Spanish) to share accommodation history from exchange students in Buenos Aires.

## What is included

- Next.js app with responsive listings and detail pages.
- Filters by address, neighborhood, and recommendation status.
- Card view + map view toggle for browsing listings.
- Light/dark theme toggle (saved per browser).
- Historical reviews imported from your survey CSV.
- New review form with moderation queue (`data/reviews.pending.json`).
- Admin moderation UI at `/{lang}/admin/moderation`.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Build normalized data from the survey CSV:

```bash
npm run import:data
```

3. Start development server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Data files

- Source survey data:
  - `data/Alojamientos Recomendados Infiuba.xlsx - Hoja 1.csv`
  - `data/Alojamientos Recomendados Infiuba.xlsx`
- Generated dataset:
  - `src/data/accommodations.json`
- Review moderation files:
  - `data/reviews.pending.json`
  - `data/reviews.approved.json`

## Moderation workflow

New student reviews are written to `data/reviews.pending.json` and can be moderated from:

- `http://localhost:3000/en/admin/moderation`
- `http://localhost:3000/es/admin/moderation`

Optional auth:

```bash
ADMIN_TOKEN=your-secret-token npm run dev
```

If `ADMIN_TOKEN` is set, the admin page/API requires this token.
