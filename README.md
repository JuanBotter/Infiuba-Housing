# Infiuba Alojamientos Web

Multilingual MVP (English, Spanish, French, German, Portuguese, Italian, Norwegian) to share accommodation history from exchange students in Buenos Aires.

## What is included

- Next.js app with responsive listings and detail pages.
- Filters by address, neighborhood, and recommendation status.
- Card view + map view toggle for browsing listings.
- Light/dark theme toggle (saved per browser).
- Historical reviews imported from your survey CSV.
- PostgreSQL-backed listings and reviews (with file fallback if `DATABASE_URL` is not set).
- Original review comments + translated versions saved in PostgreSQL (`comment` + `comment_<lang>` columns).
- Public review submission flow with address suggestions; existing properties get a new review, new ones are created automatically.
- Role-based access: `visitor` (default), `whitelisted` (student full access), `admin`.
- Invite-link onboarding: admins generate expiring one-time links to activate email/password access.
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

3. (Recommended) Geocode listings for accurate map markers:

```bash
npm run geocode:data
```

4. Configure Postgres in `.env.local`:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/infiuba_alojamientos
```

5. Initialize schema and seed data:

```bash
npm run db:setup
```

6. Start development server:

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
- Local review fallback files:
  - `data/reviews.pending.json`
  - `data/reviews.approved.json`
  - `data/geocoding.cache.json`

## Database

When `DATABASE_URL` is set, the app uses PostgreSQL for:

- listings
- contacts
- survey reviews
- web reviews (pending/approved/rejected)
- dataset metadata
- auth users
- auth invites

Useful commands:

```bash
npm run db:init
npm run db:seed
npm run db:setup
npm run user:upsert -- --email student@example.com --role whitelisted --password "StrongPass123!"
```

`npm run db:init` is idempotent and also applies schema hardening (enum-backed finite states, integrity checks, legacy data normalization, and case-insensitive user email uniqueness).

## Review translations

The app can display translated review comments per UI language and lets users toggle back to the original text.

Translations are stored in language columns (`comment_en`, `comment_es`, `comment_fr`, `comment_de`, `comment_pt`, `comment_it`, `comment_no`), while the original text is always kept in `reviews.comment`.

## Moderation workflow

New student reviews are written to PostgreSQL (`reviews` table, `status='pending'`) and can be moderated from:

- `http://localhost:3000/en/admin/moderation`
- `http://localhost:3000/es/admin/moderation`

## Access roles

```bash
WHITELIST_TOKEN=student-access-code
ADMIN_TOKEN=admin-access-code
# Optional (recommended):
AUTH_SECRET=replace-with-a-long-random-secret
```

Optional database users (email + password):

```bash
npm run user:upsert -- --email student@example.com --role whitelisted --password "StrongPass123!"
npm run user:upsert -- --email admin@example.com --role admin --password "StrongPass123!"
```

- Default role is `visitor`:
  - can browse listings/reviews
  - cannot see owner/reviewer contact info
  - cannot submit reviews
- `whitelisted` role:
  - full listing/review/contact visibility
  - can submit reviews
- `admin` role:
  - everything from whitelisted
  - can access `/{lang}/admin/moderation` and moderate reviews

Use the access icon in the top bar to:

- sign in with approved email + password (requires database)
- or use access codes as fallback

## Invite links

- Admins can generate invite links from the moderation page.
- Bulk creation is supported (comma/newline/semicolon-separated emails).
- Invite links open `/{lang}/activate?token=...`.
- Students set a password once, account is created/updated in `users`, and they are logged in.
- Invite tokens are one-time and expire based on the selected duration.
- Creating a new invite for the same email automatically invalidates previous open invites for that email.
- Admin moderation now includes invite history with open/activated/replaced/expired status and timestamps.
- After pulling schema/auth updates, run `npm run db:init` to add any missing invite columns.
