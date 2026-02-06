# Infiuba Alojamientos Web

Multilingual MVP (English, Spanish, French, German, Portuguese, Italian, Norwegian) to share accommodation history from exchange students in Buenos Aires.

## What is included

- Next.js app with responsive listings and detail pages.
- Filters by address, neighborhood, and recommendation status.
- Card view + map view toggle for browsing listings.
- Light/dark theme toggle (saved per browser).
- Historical reviews imported from your survey CSV.
- PostgreSQL-backed listings and reviews (`DATABASE_URL` required at runtime).
- Original review comments + translated versions saved in PostgreSQL (`comment` + `comment_<lang>` columns).
- Public review submission flow with address suggestions; existing properties get a new review, new ones are created automatically.
- New listing contact inputs are capped (max 20 entries, max 180 chars per contact).
- Reviewer contact emails are validated server-side; `mailto:` links are rendered only for strict valid email values.
- Role-based access: `visitor` (default), `whitelisted` (student full access), `admin`.
- Email OTP login for approved users stored in PostgreSQL (`users` table).
- Layered OTP abuse throttling (request limits by IP/subnet/global and verify-failure limits by IP and email+IP).
- Sensitive auth/admin API responses include explicit `Cache-Control: no-store` headers.
- Production browser hardening headers via `next.config.mjs` (CSP, HSTS, frame/content-type/referrer/permissions policies).
- Admin reviews and user access UI at `/{lang}/admin/reviews` and `/{lang}/admin/access`.

## Run locally

Note: On Vercel, the `vercel-build` script runs `npm run db:migrate` before `npm run build` so migrations apply automatically.

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
# Optional TLS:
# PGSSL=true
# Optional custom CA (PEM):
# PGSSL_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
# Development only (never production):
# PGSSL_ALLOW_INSECURE=true
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
- Generated dataset for seeding:
  - `src/data/accommodations.json`
- `src/data/accommodations.json` and cache/review JSON artifacts are local generated files (gitignored).
- Local geocoding cache (optional):
  - `data/geocoding.cache.json`

## Database

The app requires PostgreSQL (`DATABASE_URL`) and uses it for:

- listings
- contacts
- survey reviews
- web reviews (pending/approved/rejected)
- dataset metadata
- auth users
- deleted user emails
- auth email OTP codes
- OTP rate-limit buckets (abuse protection counters)

If `PGSSL=true`, certificate verification is strict by default (`rejectUnauthorized=true`).
Only local development should use `PGSSL_ALLOW_INSECURE=true`.
In production, `AUTH_SECRET` is required for auth signing and must be at least 32 characters (non-placeholder).

Useful commands:

```bash
npm run db:migrate
npm run db:seed
npm run db:setup
npm run user:upsert -- --email student@example.com --role whitelisted
```

`npm run db:init` is an alias for `db:migrate`. Migrations are managed with node-pg-migrate in the `migrations/` directory.
`db:migrate` reads the `DATABASE_URL` environment variable (node-pg-migrate's `-d` flag expects the env var name, not the URL).

`npm run db:migrate` is idempotent and also applies schema hardening (enum-backed finite states, integrity checks, legacy data normalization, and case-insensitive user email uniqueness).

## Review translations

The app can display translated review comments per UI language and lets users toggle back to the original text.

Translations are stored in language columns (`comment_en`, `comment_es`, `comment_fr`, `comment_de`, `comment_pt`, `comment_it`, `comment_no`), while the original text is always kept in `reviews.comment`.

## Moderation workflow

New student reviews are written to PostgreSQL (`reviews` table, `status='pending'`) and can be moderated from:

- `http://localhost:3000/en/admin/reviews`
- `http://localhost:3000/es/admin/reviews`

## Access roles

```bash
# Required in production, minimum 32 chars, non-placeholder:
AUTH_SECRET=replace-with-a-long-random-secret-value-32chars
PGSSL=true
# Optional custom CA for strict TLS verification:
# PGSSL_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
# Development only; disables certificate verification:
# PGSSL_ALLOW_INSECURE=true
OTP_EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxxxxxx
BREVO_FROM_EMAIL="Infiuba Housing <your@email.com>"
# Optional: force one email to always print OTP in server logs (no provider send).
# Defaults to mock@email.com in non-production when unset:
# OTP_CONSOLE_ONLY_EMAIL=mock@email.com
# Emergency read-only fallback if login is down:
# VISITOR_CAN_VIEW_OWNER_CONTACTS=true
# Optional fallback sender key used by all providers:
# OTP_FROM_EMAIL="Infiuba Housing <your@email.com>"
# Optional alternative provider:
# OTP_EMAIL_PROVIDER=resend
# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
# RESEND_FROM_EMAIL="Infiuba Housing <no-reply@your-domain.com>"
```

Approved database users (email + role):

```bash
npm run user:upsert -- --email student@example.com --role whitelisted
npm run user:upsert -- --email admin@example.com --role admin
```

- Default role is `visitor`:
  - can browse listings/reviews
  - cannot see reviewer contact info
  - owner contacts stay hidden unless `VISITOR_CAN_VIEW_OWNER_CONTACTS=true` is enabled
  - cannot submit reviews
- `whitelisted` role:
  - full listing/review/contact visibility
  - can submit reviews
- `admin` role:
  - everything from whitelisted
  - can access `/{lang}/admin/reviews` and `/{lang}/admin/access`

Use the access icon in the top bar to:

- request a one-time password code to the approved email
- verify the OTP code and start a signed session
- optionally check "Remember me" to keep that session for 30 days (otherwise it ends when the browser session ends)
- in local dev, `mock@email.com` always delivers OTP to server console logs instead of email provider
- OTP endpoints apply layered network-based throttling to reduce abuse
