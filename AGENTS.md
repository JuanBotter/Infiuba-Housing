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
- Default landing language is Spanish (`/` redirects to `/es`).
- Theme: light/dark with persisted browser preference.
- Typography: unified sans-serif stack for headings and body (`Avenir Next` fallback stack).
- Core domain: listings, owner contacts, survey reviews, web reviews with moderation, multilingual review text, and review-level rent history.
- Admin UX: split views for reviews, invites, and access management under `/{lang}/admin/*`; access view supports client-side search by email/role.
- Main listings UI uses a view toggle: `Map` (default), `List`, and (for whitelisted/admin) `Add review`.
- Cards/Map filters include search, neighborhood, recommendation, min/max price, minimum rating, sorting (default: newest), and active filter chips that support one-click removal plus clear-all.
- Cards/Map filter state (including selected view mode) is persisted in browser `localStorage` using shared key `infiuba:filters:v2` so navigation/reloads and language switches keep the same filters/view; legacy per-language keys are auto-migrated on read.
- Filter persistence loading is gated so initial render defaults never overwrite stored filters before hydration applies them.
- Map panel shows up to 3 latest approved review comments for the selected listing (translated to current UI language when available), with the same "show original/translation" toggle used in listing detail reviews.
- Map view includes full selected-listing details (stats, owner contacts when visible by role, details link); historical reviews render before the inline per-listing review form for whitelisted/admin users.
- On mobile/narrow layouts (`<=1100px`), map mode is map-first: a horizontal property rail sits under the map, and the full results list opens as a bottom-sheet drawer with backdrop.
- In map mode, selected listing details (stats + owner contacts when visible to role + details link) render under the map panel content; on mobile/narrow layouts they appear under the horizontal rail.
- Selecting a listing from map markers keeps list/rail selection in sync and auto-scrolls the corresponding item into view when visible; when sort order changes in map mode, selection resets to the first result in the new order.
- On desktop map layout, the left listing column uses viewport-capped internal scrolling (`max-height`), while the right panel keeps a matching viewport-based minimum height.
- Header menus (language/access) are layered above map controls/popups to avoid overlap while using map view.

## Runtime and Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Import dataset from CSV: `npm run import:data`
- Geocode listings: `npm run geocode:data`
- Init DB schema: `npm run db:init`
- Seed DB: `npm run db:seed`
- Init + seed: `npm run db:setup`
- Upsert auth user: `npm run user:upsert -- --email user@example.com --role whitelisted --password "StrongPass123!"`

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
  - Can access admin pages for reviews, invites, and user access.
  - Can revoke DB user access from the admin access page.

Implementation:

- Role session cookie name: `infiuba_role`.
- Cookie is signed (HMAC SHA-256) in `src/lib/auth.ts`.
- Session cookie payload includes role plus auth metadata (`authMethod`, optional email).
- For `password`/`invite` sessions, role is revalidated against `users` on read; missing/inactive users resolve to `visitor`.
- Session API:
  - `POST /api/session` with either:
    - `email` + `password` (DB users), or
    - `accessCode` (fallback/manual codes).
    - Both paths set signed role cookie.
  - `DELETE /api/session` -> logout (clears cookie).
  - `GET /api/session` -> current resolved role (DB-validated for `password`/`invite` sessions).
  - `POST /api/session/invite` with `token` + `password` activates invite and sets session.

Invite onboarding:

- Admin creates invite link from moderation page/API.
- Admin can create one or many invites at once (comma/newline/semicolon-separated emails).
- When a new invite is created for an email, any existing open invite for that same email is invalidated (shown as `replaced` in history).
- Invite link points to `/{lang}/activate?token=...`.
- Activation page pre-validates invite token on load; if token is invalid/expired it shows a dedicated error view (no password form) titled "Invite expired" with the generic message "This invite is no longer available."
- In the invite-expired view, contact guidance is rendered as four lines: intro message, first admin email, second admin email, and closing text; admin emails are clickable `mailto:` links.
- On valid invite links, activation form shows the target invite email so users can verify which account they are setting a password for.
- Student sets password once; invite is consumed; user is created/updated in `users`.

User access management:

- Admin access view includes active and revoked users.
- API: `GET /api/admin/users` returns active/revoked user lists.
- API: `POST /api/admin/users` with `{ action: "revoke", email }` revokes access.
- Revocation sets `users.is_active = FALSE`; revoked users lose DB-backed access immediately on next server-side auth check.
- Admin cannot revoke their own currently authenticated email session.

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

Finite-state fields use PostgreSQL enums:

- `user_role_enum`: `whitelisted`, `admin`
- `review_source_enum`: `survey`, `web`
- `review_status_enum`: `pending`, `approved`, `rejected`
- `invite_consumed_reason_enum`: `activated`, `superseded`

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
- `password_hash TEXT NOT NULL` (scrypt encoded string)
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `auth_invites`

- `id BIGSERIAL PRIMARY KEY`
- `email TEXT NOT NULL`
- `role user_role_enum NOT NULL`
- `token_hash TEXT NOT NULL UNIQUE`
- `expires_at TIMESTAMPTZ NOT NULL`
- `consumed_at TIMESTAMPTZ`
- `consumed_reason invite_consumed_reason_enum` (`activated` when used, `superseded` when replaced by a newer invite)
- `created_by_email TEXT`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Compatibility note:

- App code tolerates legacy DBs missing `auth_invites.consumed_reason` (no 500s), but run `npm run db:init` to apply full schema and keep precise invite status history.

Indexes:

- `idx_listings_neighborhood ON listings(neighborhood)`
- `idx_users_email_unique ON users(email)` (unique)
- `idx_users_email_lower_unique ON users(lower(email))` (unique, case-insensitive)
- `idx_users_role_active ON users(role, is_active)`
- `idx_auth_invites_token_hash_unique ON auth_invites(token_hash)` (unique)
- `idx_auth_invites_email_pending ON auth_invites(email, consumed_at, expires_at)`
- `idx_auth_invites_email_lower ON auth_invites(lower(email))`
- `idx_reviews_listing_status ON reviews(listing_id, status, source)`
- `idx_reviews_status_created ON reviews(status, created_at DESC)`

Integrity hardening (enforced in `scripts/db-init.mjs`):

- Non-empty checks for core text identifiers (`users.email`, `auth_invites.email`, listing address/neighborhood, listing contact).
- Numeric range checks for ratings, recommendation rates, coordinates, and year fields.
- Review approval consistency (`approved_at` must be present only when `status='approved'`).
- Review rent consistency (`reviews.price_usd` must be null or > 0).
- Invite consumption consistency (`consumed_at`/`consumed_reason` must be set together; consumed timestamp cannot be before creation).
- Legacy-row normalization before constraints are applied (trim/canonicalize emails, null-out invalid ranges, dedupe users by case-insensitive email).
- `db:init` is idempotent across both pre-enum and post-enum states for `reviews.source`/`reviews.status`.

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
- Admin layout + navigation: `src/app/[lang]/admin/layout.tsx`, `src/app/[lang]/admin/admin-nav.tsx`
- Admin reviews page: `src/app/[lang]/admin/reviews/page.tsx`
- Admin invites page: `src/app/[lang]/admin/invites/page.tsx`
- Admin access page: `src/app/[lang]/admin/access/page.tsx`
- Legacy moderation path redirect: `src/app/[lang]/admin/moderation/page.tsx` -> `/{lang}/admin/reviews`
- Invite activation page: `src/app/[lang]/activate/page.tsx`
- Invite activation form: `src/app/[lang]/activate/activate-form.tsx`
- Admin invite API: `src/app/api/admin/invites/route.ts`
  - `POST` create single/bulk invites
  - `GET` invite history (`open` + `activated` + `replaced` + `expired`)
- Admin users API: `src/app/api/admin/users/route.ts`
  - `GET` managed users (`active` + `revoked`)
  - `POST` revoke user access
- Invite activation API: `src/app/api/session/invite/route.ts`
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
8. Any auth change must preserve both paths unless explicitly removed:
   - DB email/password login
   - access-code fallback login
9. Keep invite flow one-time and expiring; never store raw invite tokens in DB.

## Change Checklist (Use Every Task)

- [ ] Code changes completed.
- [ ] Permissions reviewed for visitor/whitelisted/admin impact.
- [ ] i18n keys updated for all supported languages.
- [ ] DB schema/docs updated if data model changed.
- [ ] `AGENTS.md` updated to reflect the new reality.
- [ ] Type check/build run (or note why not run).
