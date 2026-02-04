# AGENTS.md

This file is the source of truth for coding agents working on this repository.

## Mandatory Rule

On every task that changes behavior, architecture, data flow, APIs, auth, or schema:

1. Update this `AGENTS.md` in the same task.
2. Keep it accurate to current code.
3. If a change is intentionally not documented here, explain why in the PR/commit message.

Do not defer AGENTS updates.

## Project Summary

- Project: Infiuba housing portal for exchange students in Buenos Aires.
- Stack: Next.js App Router + TypeScript + PostgreSQL + Leaflet.
- Languages: `en`, `es`, `fr`, `de`, `pt`, `it`, `no`.
- Theme: light/dark with persisted browser preference.
- Core domain: listings, owner contacts, survey reviews, web reviews with moderation, multilingual review text.

## Runtime and Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Import dataset from CSV: `npm run import:data`
- Geocode listings: `npm run geocode:data`
- Init DB schema: `npm run db:init`
- Seed DB: `npm run db:seed`
- Init + seed: `npm run db:setup`

## Environment Variables

- `DATABASE_URL`: enables PostgreSQL mode.
- `PGSSL=true`: optional SSL for DB pool.
- `WHITELIST_TOKEN` or `WHITELIST_TOKENS`: login codes for whitelisted users.
- `ADMIN_TOKEN` or `ADMIN_TOKENS`: login codes for admin users.
- `AUTH_SECRET`: secret for signing auth role cookie (strongly recommended).

Notes:

- `*_TOKENS` supports multiple values split by comma/newline/semicolon.
- If `AUTH_SECRET` changes, all active sessions are invalidated.

## Access Control Model

Roles:

- `visitor` (default):
  - Can browse public listing/review content.
  - Cannot see owner contacts.
  - Cannot see reviewer contact info.
  - Cannot submit reviews.
  - Cannot access admin moderation.
- `whitelisted`:
  - Full listing/review visibility including contacts (subject to reviewer consent).
  - Can submit reviews.
  - Cannot access admin moderation.
- `admin`:
  - Same as whitelisted.
  - Can access and use moderation panel.

Implementation:

- Role session cookie name: `infiuba_role`.
- Cookie is signed (HMAC SHA-256) in `src/lib/auth.ts`.
- Session API:
  - `POST /api/session` with `accessCode` -> sets signed role cookie.
  - `DELETE /api/session` -> logout (clears cookie).
  - `GET /api/session` -> current resolved role.

## Data Sources

Primary mode (recommended):

- PostgreSQL for listings, contacts, reviews, metadata.

Fallback mode (when `DATABASE_URL` is missing):

- Read listings from `src/data/accommodations.json`.
- Pending/approved web reviews from:
  - `data/reviews.pending.json`
  - `data/reviews.approved.json`

## Database Schema (Current)

Defined in `scripts/db-init.mjs`.

### `dataset_meta`

- `id INTEGER PRIMARY KEY CHECK (id = 1)`
- `generated_at TIMESTAMPTZ`
- `source_file TEXT`
- `total_listings INTEGER NOT NULL DEFAULT 0`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `listings`

- `id TEXT PRIMARY KEY`
- `address TEXT NOT NULL`
- `neighborhood TEXT NOT NULL`
- `latitude DOUBLE PRECISION`
- `longitude DOUBLE PRECISION`
- `price_usd NUMERIC`
- `capacity NUMERIC`
- `average_rating NUMERIC`
- `recommendation_rate NUMERIC`
- `total_reviews INTEGER NOT NULL DEFAULT 0`
- `recent_year INTEGER`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `listing_contacts`

- `id BIGSERIAL PRIMARY KEY`
- `listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE`
- `contact TEXT NOT NULL`
- `UNIQUE (listing_id, contact)`

### `reviews`

- `id TEXT PRIMARY KEY`
- `listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE`
- `source TEXT NOT NULL CHECK (source IN ('survey', 'web'))`
- `status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected'))`
- `year INTEGER`
- `rating NUMERIC`
- `recommended BOOLEAN`
- `comment TEXT` (original comment)
- `comment_en TEXT`
- `comment_es TEXT`
- `comment_fr TEXT`
- `comment_de TEXT`
- `comment_pt TEXT`
- `comment_it TEXT`
- `comment_no TEXT`
- `student_contact TEXT`
- `student_name TEXT`
- `student_email TEXT`
- `allow_contact_sharing BOOLEAN NOT NULL DEFAULT FALSE`
- `semester TEXT`
- `created_at TIMESTAMPTZ NOT NULL`
- `approved_at TIMESTAMPTZ`

Indexes:

- `idx_listings_neighborhood ON listings(neighborhood)`
- `idx_reviews_listing_status ON reviews(listing_id, status, source)`
- `idx_reviews_status_created ON reviews(status, created_at DESC)`

## Review Translation Model

- Original text is always stored in `reviews.comment`.
- Translated variants are stored in fixed columns `comment_<lang>`.
- UI language selection uses the corresponding translation when available.
- Users can toggle between translated/original review text in listing detail views.

## Review and Moderation Flow

Submission:

- Review form supports:
  - Existing listing review (with match confirmation)
  - New listing + review in one flow
- Endpoint: `POST /api/reviews`
- New reviews are inserted as `source='web'`, `status='pending'`
- Permission enforced server-side: only `whitelisted` and `admin`

Moderation:

- Page: `/{lang}/admin/moderation`
- API: `/api/admin/reviews` (`GET`, `POST`)
- Permission enforced server-side: `admin` only

## Contact Privacy Rules

Must remain true:

1. Visitors never see owner contacts.
2. Visitors never see reviewer contact info.
3. Reviewer contact info is shown only if:
   - User role is whitelisted/admin, and
   - Reviewer opted into sharing (`allow_contact_sharing = true`).
4. Owners/lessors must never receive reviewer contact info from the app.

## Important App Paths

- Listing page: `src/app/[lang]/page.tsx`
- Filters + map/cards UI: `src/app/[lang]/place-filters.tsx`
- Listing detail page: `src/app/[lang]/place/[id]/page.tsx`
- Add review flow: `src/app/[lang]/add-stay-review-form.tsx`
- Detail review form: `src/app/[lang]/place/[id]/review-form.tsx`
- Admin moderation page: `src/app/[lang]/admin/moderation/page.tsx`
- Role/auth helpers: `src/lib/auth.ts`
- Data access: `src/lib/data.ts`
- Reviews store: `src/lib/reviews-store.ts`
- Messages/i18n: `src/i18n/messages.ts`

## Agent Best Practices for This Repo

1. Enforce permissions on the server, not only in UI.
2. Preserve multilingual parity: if adding/changing a message key, update all languages.
3. Keep visitor-safe defaults when uncertain.
4. Run checks after significant changes:
   - `npx tsc --noEmit`
   - `npm run build`
5. Prefer DB-backed behavior; keep fallback mode working.
6. Avoid schema drift: update `scripts/db-init.mjs`, `scripts/db-seed.mjs`, and this file together.
7. Never expose secrets/tokens in client code or logs.

## Change Checklist (Use Every Task)

- [ ] Code changes completed.
- [ ] Permissions reviewed for visitor/whitelisted/admin impact.
- [ ] i18n keys updated for all supported languages.
- [ ] DB schema/docs updated if data model changed.
- [ ] `AGENTS.md` updated to reflect the new reality.
- [ ] Type check/build run (or note why not run).

