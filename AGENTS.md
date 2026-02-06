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
- Runtime data source: PostgreSQL only (no file-based fallback mode).
- Languages: `en`, `es`, `fr`, `de`, `pt`, `it`, `no`.
- Default landing language is Spanish (`/` redirects to `/es`).
- Theme: light/dark with persisted browser preference.
- Typography: unified sans-serif stack for headings and body (`Avenir Next` fallback stack).
- Core domain: listings, owner contacts, survey reviews, web reviews with moderation, multilingual review text, and review-level rent history.
- Auth/login: email OTP in top-bar access menu; only active users present in `users` can sign in.
- OTP login includes an optional "Remember me" checkbox; trusted sessions persist for 30 days, otherwise cookie lifetime is browser-session only.
- OTP delivery supports a console-only email override for local testing (`mock@email.com` by default outside production).
- OTP mailer logs provider availability and send failures (redacted recipient) to server logs for troubleshooting.
- OTP request/verify API responses are intentionally enumeration-safe: request responses are generic for allowed/not-allowed/rate-limited outcomes, and verify failures return a generic invalid-code response for auth failures.
- DB migrations are managed with node-pg-migrate (`migrations/` directory).
- Admin UX: split views for reviews and access management under `/{lang}/admin/*`; access view supports search, role changes, deletion, and bulk user creation.
- Main listings UI uses a view toggle: `Map` (default), `List`, and (for whitelisted/admin) `Add review`.
- Cards/Map filters include search, neighborhood, recommendation, min/max price, minimum rating, sorting (default: newest), and active filter chips that support one-click removal plus clear-all.
- Cards/Map filter state (including selected view mode) is persisted in browser `localStorage` using shared key `infiuba:filters:v2` so navigation/reloads and language switches keep the same filters/view; legacy per-language keys are auto-migrated on read.
- Filter persistence loading is gated so initial render defaults never overwrite stored filters before hydration applies them.
- Listing aggregate fields (`average_rating`, `recommendation_rate`, `total_reviews`, `recent_year`) are recomputed from approved reviews whenever a pending web review is approved.
- Map panel shows up to 3 latest approved review comments for the selected listing (translated to current UI language when available), with the same "show original/translation" toggle used in listing detail reviews.
- Map view includes full selected-listing details (stats, owner contacts when visible by role, details link); historical reviews render before the inline per-listing review form for whitelisted/admin users.
- When owner contacts are hidden by permissions, listing detail and map-selected panels show a small colored hint prompting login to view contact info.
- On mobile/narrow layouts (`<=1100px`), map mode is map-first: a horizontal property rail sits under the map, and the full results list opens as a bottom-sheet drawer with backdrop.
- In map mode, selected listing details (stats + owner contacts when visible to role + details link) render under the map panel content; on mobile/narrow layouts they appear under the horizontal rail.
- Selecting a listing from map markers keeps list/rail selection in sync and auto-scrolls the corresponding item into view when visible; when sort order changes in map mode, selection resets to the first result in the new order.
- On desktop map layout, the left listing column uses viewport-capped internal scrolling (`max-height`), while the right panel keeps a matching viewport-based minimum height.
- Header menus (language/access) are layered above map controls/popups to avoid overlap while using map view.
- Top-bar menus (`language-menu`, `role-menu`) close when users click outside the open menu.
- In the OTP login popover, the "Remember me" checkbox and label stay aligned on a single row.

## Runtime and Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Vercel deploy uses `vercel-build` to run migrations before build: `npm run db:migrate && npm run build`
- Import dataset from CSV: `npm run import:data`
- `npm run import:data` writes local seed dataset `src/data/accommodations.json` (gitignored).
- Geocode listings: `npm run geocode:data`
- Init/migrate DB schema: `npm run db:migrate`
- `db:migrate` reads `DATABASE_URL` (node-pg-migrate `-d` expects the env var name).
- Legacy alias: `npm run db:init`
- Seed DB: `npm run db:seed`
- Init/migrate + seed: `npm run db:setup`
- Upsert auth user: `npm run user:upsert -- --email user@example.com --role whitelisted`

## Environment Variables

- `DATABASE_URL`: required for runtime and DB scripts.
- `PGSSL=true`: optional SSL for DB pool (strict certificate verification by default).
- `PGSSL_CA_CERT`: optional PostgreSQL CA certificate in PEM format (supports escaped `\n`).
- `PGSSL_ALLOW_INSECURE=true`: development-only override to disable certificate verification; forbidden in production.
- `AUTH_SECRET`: secret for signing auth role cookie (strongly recommended).
- `VISITOR_CAN_VIEW_OWNER_CONTACTS=true`: emergency read-only fallback to expose owner contacts to visitors (reviewer/student contacts remain protected).
- `OTP_EMAIL_PROVIDER`: OTP delivery provider (`brevo`, `resend`, or `console`; defaults to `console` in non-production when unset).
- `OTP_CONSOLE_ONLY_EMAIL`: optional single email forced to console OTP delivery (skips provider send); defaults to `mock@email.com` in non-production when unset.
- `OTP_FROM_EMAIL`: optional provider-agnostic sender identity fallback (`Name <email@domain>`).
- `BREVO_API_KEY`: required when `OTP_EMAIL_PROVIDER=brevo`.
- `BREVO_FROM_EMAIL`: sender identity for Brevo OTP emails.
- `RESEND_API_KEY`: required when `OTP_EMAIL_PROVIDER=resend`.
- `RESEND_FROM_EMAIL`: sender identity for Resend OTP emails.

Notes:

- If `AUTH_SECRET` changes, all active sessions are invalidated.

## Access Control Model

Roles:

- `visitor` (default):
  - Can browse public listing/review content.
  - Cannot see owner contacts unless `VISITOR_CAN_VIEW_OWNER_CONTACTS=true`.
  - Cannot see reviewer contact info.
  - Cannot submit reviews.
  - Cannot access admin moderation.
- `whitelisted`:
  - Full listing/review visibility including contacts (subject to reviewer consent).
  - Can submit reviews.
  - Cannot access admin moderation.
- `admin`:
  - Same as whitelisted.
  - Can access admin pages for reviews and user access.

Implementation:

- Role session cookie name: `infiuba_role`.
- Cookie is signed (HMAC SHA-256) in `src/lib/auth.ts`.
- Session cookie payload includes role plus auth metadata (`authMethod`, optional email).
- For `otp` sessions, role is revalidated against `users` on read; missing users resolve to `visitor`.
- Session API:
  - `POST /api/session` with:
    - `{ action: "requestOtp", email }` to send OTP, then
    - `{ action: "verifyOtp", email, otpCode, trustDevice }` to sign in.
    - Verify path sets signed role cookie.
    - `requestOtp` intentionally returns a generic success payload for most auth-related outcomes to reduce account enumeration.
    - `verifyOtp` intentionally returns generic invalid-code failures for non-success auth outcomes (`not_allowed`, invalid/expired codes, etc.).
  - `DELETE /api/session` -> logout (clears cookie).
  - `GET /api/session` -> current resolved role (DB-validated for cookie-backed sessions).
  - `POST /api/session` is the only sign-in path (OTP).

User access management:

- Admin access view includes active and deleted users.
- API: `GET /api/admin/users` returns active/deleted user lists.
- API: `POST /api/admin/users` supports:
  - `{ action: "updateRole", email, role }` to change role
  - `{ action: "delete", email }` to delete a user (stores email in `deleted_users`)
  - `{ action: "upsert", emails, role }` to bulk create/reactivate users
- Admin cannot modify or delete their own currently authenticated email session.

## Data Sources

Runtime:

- PostgreSQL for listings, contacts, reviews, metadata.
- App/API behavior assumes DB availability; there is no JSON/file fallback at runtime.

Seed/import tooling:

- `scripts/build-dataset.mjs` generates `src/data/accommodations.json` locally for `scripts/db-seed.mjs`.
- Optional local seed inputs (if present): `data/reviews.pending.json`, `data/reviews.approved.json`.
- `data/geocoding.cache.json` is a local cache used by `scripts/geocode-listings.mjs`.

## Database Schema (Current)

Defined in `migrations/001_initial_schema.sql` (applied via node-pg-migrate).

Finite-state fields use PostgreSQL enums:

- `user_role_enum`: `whitelisted`, `admin`
- `review_source_enum`: `survey`, `web`
- `review_status_enum`: `pending`, `approved`, `rejected`
- `otp_consumed_reason_enum`: `verified`, `replaced`, `too_many_attempts`

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
- `source review_source_enum NOT NULL`
- `status review_status_enum NOT NULL`
- `year INTEGER`
- `rating NUMERIC`
- `price_usd NUMERIC` (rent reported in that specific review, optional)
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

### `users`

- `id BIGSERIAL PRIMARY KEY`
- `email TEXT NOT NULL UNIQUE` (store lowercased)
- `role user_role_enum NOT NULL`
- `password_hash TEXT NOT NULL` (placeholder value `otp-only`; passwords are not used)
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `deleted_users`

- `email TEXT PRIMARY KEY` (lowercased)
- `deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `auth_email_otps`

- `id BIGSERIAL PRIMARY KEY`
- `email TEXT NOT NULL` (lowercased)
- `code_hash TEXT NOT NULL` (HMAC hash of OTP code + email; raw code is never stored)
- `expires_at TIMESTAMPTZ NOT NULL`
- `consumed_at TIMESTAMPTZ`
- `consumed_reason otp_consumed_reason_enum` (`verified`, `replaced`, `too_many_attempts`)
- `attempts INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Legacy (unused by app):

- `auth_invites` table and `invite_consumed_reason_enum` type remain in some DBs for backward compatibility, but invite flows are removed.

Indexes:

- `idx_listings_neighborhood ON listings(neighborhood)`
- `idx_users_email_unique ON users(email)` (unique)
- `idx_users_email_lower_unique ON users(lower(email))` (unique, case-insensitive)
- `idx_users_role_active ON users(role, is_active)`
- `idx_deleted_users_email_lower_unique ON deleted_users(lower(email))` (unique, case-insensitive)
- `idx_deleted_users_deleted_at ON deleted_users(deleted_at DESC)`
- `idx_auth_email_otps_email_open ON auth_email_otps(email, consumed_at, expires_at DESC)`
- `idx_auth_email_otps_email_lower ON auth_email_otps(lower(email))`
- `idx_reviews_listing_status ON reviews(listing_id, status, source)`
- `idx_reviews_status_created ON reviews(status, created_at DESC)`

Integrity hardening (enforced in `migrations/001_initial_schema.sql`):

- Non-empty checks for core text identifiers (`users.email`, `deleted_users.email`, `auth_email_otps.email`, listing address/neighborhood, listing contact).
- Numeric range checks for ratings, recommendation rates, coordinates, and year fields.
- Review approval consistency (`approved_at` must be present only when `status='approved'`).
- Review rent consistency (`reviews.price_usd` must be null or > 0).
- OTP consistency (`consumed_at`/`consumed_reason` coupled, attempts non-negative, expires/consumed not before creation).
- Legacy-row normalization before constraints are applied (trim/canonicalize emails, null-out invalid ranges, dedupe users by case-insensitive email).
- Initial migration handles both pre-enum and post-enum states for `reviews.source`/`reviews.status`.

## Review Translation Model

- Original text is always stored in `reviews.comment`.
- Translated variants are stored in fixed columns `comment_<lang>`.
- UI language selection uses the corresponding translation when available.
- Users can toggle between translated/original review text in listing detail views.

## Rent Data Model

- Listing row keeps a representative `listings.price_usd` (legacy/compat and fallback value).
- Canonical rent history lives in `reviews.price_usd` (one value per review when provided).
- Cards/map preview uses approved-review min/max rent range when available; falls back to `listings.price_usd`.
- Detail page shows the same range in stats and includes per-review rent in review metadata when present.

## Review and Moderation Flow

Submission:

- Review form supports:
  - Existing listing review (with match confirmation)
  - New listing + review in one flow
- Endpoint: `POST /api/reviews`
- New reviews are inserted as `source='web'`, `status='pending'`
- Permission enforced server-side: only `whitelisted` and `admin`

Moderation:

- Page: `/{lang}/admin/reviews`
- API: `/api/admin/reviews` (`GET`, `POST`)
- Permission enforced server-side: `admin` only
- On approve action, listing aggregates are refreshed in `listings` from all approved reviews for that listing.

## Contact Privacy Rules

Must remain true:

1. Visitors never see reviewer contact info.
2. Owner contacts are visible only to whitelisted/admin, except when emergency fallback `VISITOR_CAN_VIEW_OWNER_CONTACTS=true` is explicitly enabled.
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
- Admin layout + navigation: `src/app/[lang]/admin/layout.tsx`, `src/app/[lang]/admin/admin-nav.tsx`
- Admin reviews page: `src/app/[lang]/admin/reviews/page.tsx`
- Admin access page: `src/app/[lang]/admin/access/page.tsx`
- Legacy moderation path redirect: `src/app/[lang]/admin/moderation/page.tsx` -> `/{lang}/admin/reviews`
- Admin users API: `src/app/api/admin/users/route.ts`
  - `GET` managed users (`active` + `deleted`)
  - `POST` update roles, delete, or bulk upsert users
- Role/auth helpers: `src/lib/auth.ts`
- OTP mail delivery helper: `src/lib/otp-mailer.ts`
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
5. Keep runtime DB-only behavior; do not reintroduce file fallback paths.
6. Avoid schema drift: update `migrations/` (and any future migrations), `scripts/db-seed.mjs`, and this file together.
7. Never expose secrets/tokens in client code or logs.
8. Keep login OTP-only for top-bar auth; only active users already present in `users` should be able to complete sign-in.
9. Keep OTP login as the only sign-in method unless explicitly changed.

## Change Checklist (Use Every Task)

- [ ] Code changes completed.
- [ ] Permissions reviewed for visitor/whitelisted/admin impact.
- [ ] i18n keys updated for all supported languages.
- [ ] DB schema/docs updated if data model changed.
- [ ] `AGENTS.md` updated to reflect the new reality.
- [ ] Type check/build run (or note why not run).
