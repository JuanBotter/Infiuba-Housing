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
- Typography: Stitch-aligned sans stacks are loaded via `next/font` in `src/app/layout.tsx` (`Plus Jakarta Sans` baseline, with `Work Sans` for admin-heavy surfaces and `Inter` for security telemetry modules; `Avenir Next` remains fallback in CSS token stacks). Font variable classes are applied at the `<html>` root, and CSS font vars include explicit fallback font names so typography remains sane even if `next/font` variables are temporarily unavailable.
- Visual system: Stitch-aligned editorial look across explorer/detail/review/auth/admin with warm ivory surfaces, dark cocoa dark-mode base (`#221510`), rounded cards, image-forward listing/media blocks, and high-contrast pill controls.
- Dark-mode contrast guardrails are enforced in the global theme layer so top-bar popovers, filters/cards/map panels, listing-detail metric chips, and admin/security surfaces switch to dark high-contrast backgrounds with readable text/field contrast; rent histogram sliders also override dark global input styles to keep transparent tracks and readable bars/thumbs.
- Base page gradients use three non-repeating fixed-height layers (`100% 320vh` each) rendered as `background-image` over a solid fallback color, with direction enforced as brighter at the top and darker as users scroll down; fallback color matches the darkest ramp end to prevent inversion/seams when filtering reduces content height.
- Core domain: listings, owner contacts, survey reviews, web reviews with moderation, multilingual review text, and review-level rent history.
- Listings and reviews support photo galleries backed by Vercel Blob uploads. Review-level images (`reviews.image_urls`) are canonical, while listing-level gallery display is derived from approved review images and can be admin-ordered via listing image-order metadata (`listings.image_urls`).
- Listing cards in list mode render image overlays for neighborhood + rent + rating and include a heart favorite control; favorites persist per logged-in user, while visitor clicks show a sign-in hint and do not save.
- Listing detail/admin galleries and review-form upload previews use an in-page image viewer (body-portal modal/lightbox with keyboard + thumbnail navigation) instead of opening images in a new tab; property galleries use a uniform same-size tile layout, and gallery/viewer frames use fixed-size layouts so image display size is consistent regardless of source resolution. The viewer supports fit/fill mode toggle, zoom controls (buttons, keyboard, wheel, double-click reset/toggle), swipe navigation on touch, and Home/End keyboard shortcuts.
- Auth/login: email OTP in top-bar access menu; only active users present in `users` can sign in; login email field is required (label does not say optional).
- Review submission requires a semester string in the format `1C-YYYY`/`2C-YYYY` from 2022–2030. UI uses a required text input with suggestions; API validates against the fixed list.
- `AUTH_SECRET` is required in production for auth signing; production rejects missing/weak values (minimum length and non-placeholder).
- OTP login includes an optional "Remember me" checkbox; trusted sessions persist for 30 days, otherwise cookie lifetime is browser-session only.
- OTP delivery supports a console-only email override for local testing (`mock@email.com` by default outside production).
- OTP mailer logs provider availability and send failures (redacted recipient) to server logs for troubleshooting.
- Testing: Vitest unit tests mock DB/email/Next cache for API routes and auth helpers.
- API route test coverage includes session/session-magic, reviews, favorites, review-images, admin users/reviews/publications, contact-edits, admin contact-edits, and admin security endpoints.
- OTP request/verify API responses are intentionally enumeration-safe: request responses are generic for allowed/not-allowed/rate-limited outcomes, and verify failures return a generic invalid-code response for auth failures.
- OTP abuse controls are DB-backed and layered: OTP requests are rate limited by IP/subnet/global windows, and OTP verify failures are rate limited by IP and email+IP windows.
- OTP emails are localized using the user-selected UI language (`requestOtp` payload `lang`) and include branded HTML (two-column layout with logo panel + styled content), a one-click magic login link, and the numeric OTP code as fallback.
- Structured security audit events are recorded for OTP request/verify and admin-sensitive actions (user access changes, review moderation + review edits, publication edits including image reordering/removal, contact edit moderation, and contact edit submissions).
- Sensitive auth/admin API responses explicitly send `Cache-Control: no-store` headers.
- Stateful `POST`/`DELETE` API endpoints enforce same-origin checks (Origin/Referer must match request host) to reduce CSRF risk; `GET /api/session/magic` is a token-authenticated email-link exception.
- Same-origin validation failures now return structured payloads (`code`, `message`) with legacy `error` alias (`request_origin_validation_failed`, `request_origin_invalid`, `request_origin_missing`) for client-safe error mapping.
- API request parsing/normalization is centralized in `src/lib/request-validation.ts` and reused across session/reviews/admin endpoints.
- Route guard/wrapper checks are centralized in `src/lib/api-route-helpers.ts` (`requireSameOrigin`, `requireAdminSession`, `requireDb`, `jsonError`) and reused across session/favorites/reviews/admin API handlers to reduce duplicated security and error-response boilerplate.
- Client-side API calls for admin/auth UI flows are standardized via `src/lib/api-client.ts` (`apiGetJson`, `apiPostJson`, typed `ApiClientError`, and reusable status/code error mapping).
- Shared listing/reviewer domain constraints and normalizers are centralized in `src/lib/domain-constraints.ts` (contacts/capacity limits, contact parsing+normalization, reviewer email-like normalization, and optional-number normalization) and reused across review/contact-edit/publication APIs plus listing/review data mappers.
- In production, app-wide browser hardening headers are configured (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) via `next.config.mjs`.
- Reviewer contact email handling is hardened: `/api/reviews` validates strict email format for `studentEmail` and email-like `studentContact`, and listing detail renders `mailto:` only for strict emails using URI-encoded hrefs.
- DB migrations are managed with node-pg-migrate (`migrations/` directory).
- Survey import tooling now generates deterministic/stable survey review IDs from review content (instead of row order).
- Admin UX: split views for reviews, contact edit requests, access management, security telemetry, and publication editing under `/{lang}/admin/*`; access view supports search, role changes, deletion, and bulk user creation.
- Admin users browsing the regular listings UI now see "Edit publication" links (cards, map sidebar/selected panel, and listing detail) that deep-link into `/{lang}/admin/publications?listingId=<id>`.
- Admin header copy is tab-aware: reviews/contact-edits/access/security/publications each show contextual title/description instead of a single reviews-only subtitle.
- Admin security telemetry view is presented as a dashboard with KPI cards, alert cards, per-window outcome summaries, and a recent audit-events table (still fed by `getSecurityTelemetrySnapshot` and no-store APIs); security dashboard uses a local blue/green alert palette distinct from the orange public theme, matching Stitch references.
- Security telemetry dashboard labels/descriptions are localized for all supported languages.
- Client components avoid importing `getMessages` directly; server boundaries pass selected-language message props (including scoped slices for small clients like `ThemeToggle` and `ListingsMap`) into client UIs such as review forms, admin panels, and auth/theme controls.
- Admin reviews pending cards surface structured moderation context (submitted-at timestamp, rating/recommendation/rent/semester/photo count facts, full comment block, inline listing/review image galleries when present, and submitter contact/share-consent fields); when no reviewer phone/email is provided, cards show an explicit "no contact information provided" state.
- Admin reviews moderation data is paginated for approved reviews: `GET /api/admin/reviews` accepts `approvedLimit`/`approvedOffset` (bounded), returns `approvedTotal`, and the reviews panel uses previous/next pagination controls instead of client-side slicing over full approved-review payloads.
- Admin reviews page resolves listing labels through a lightweight `getListingAddressMap` query (`id`, `address`, `neighborhood`) instead of loading full listing payloads.
- Listings hero helper copy now emphasizes comparing neighborhoods, rent ranges, and recent student experiences (instead of implementation-oriented wording).
- Non-admin UX copy is standardized across listings/detail/review/auth flows: map/list hints, empty states, owner-contact prompts, OTP guidance/errors, and add-review matching prompts now use user-task language in all supported locales.
- Review forms use a dedicated rent-input label (reported rent paid), while list/map/detail cards keep estimated rent wording for aggregated ranges.
- Monthly-rent labels in list/map/detail cards use `Monthly rent (USD)` wording (localized by locale); displayed values omit both repeated `/month` suffixes and redundant USD currency symbols in those labeled contexts, and plain USD-number rendering in those contexts uses `en-US` grouping separators for consistency.
- Listing/detail/map review metadata uses localized review-source labels (`web`/`survey`), shows a review year derived from `year`, then `semester`, then `createdAt`, and includes per-review reported rent when available.
- Shared image gallery/lightbox controls and labels are localized by UI language (fit/fill, zoom, open-original, close, previous/next, thumbnails, and fallback remove text).
- Admin bulk user upsert uses set-based SQL (`DELETE ... WHERE email = ANY(...)` + `INSERT ... SELECT FROM UNNEST(...)`) in one transaction.
- Add-review and detail-review flows now share a unified review-form core: centralized validation/submission/upload helpers in `src/lib/review-form.ts`, shared client hook state in `src/lib/use-review-form-core.ts`, and shared field rendering via `src/components/review-core-fields.tsx`; client-side review error mapping still resolves localized UI copy with generic fallback for unknown server errors.
- New listing fields in the add-review flow omit coordinates; latitude/longitude are not collected from users.
- Add-review flow uses neighborhood autocomplete suggestions from known neighborhood values.
- Main listings UI uses a view toggle: `Map` (default), `List`, and (for whitelisted/admin) `Add review`.
- Cards/Map filters include search, neighborhood, recommendation, a dataset-driven dual-handle rent range slider (bounded to current review-rent min/max values) with histogram bars derived from review-rent distribution and active-range highlighting, minimum rating, sorting (default: newest), and a logged-in `Favorites` slider toggle rendered as the last filter control; the rent slider spans two filter columns on desktop and reverts to full-width on narrow screens. The range inputs suppress the global input focus halo and keep focus affordance on slider thumbs. Active filter chips support one-click removal plus clear-all and render inline with result count in a shared summary row that always reserves the inline-filters footprint (hidden when empty) to avoid layout shift when filters are toggled.
- Rent-slider persistence uses a versioned key in filter localStorage so pre-slider numeric min/max values are ignored on migration; first load after migration defaults to the full dataset price range.
- Desktop filter-grid arrangement is fixed to two rows: row 1 ends with minimum rating in the top-right slot, row 2 places rent-range slider on the left (two columns), sort in the next slot, and favorites in the last slot.
- Rent filtering includes listings without review-rent data whenever the slider minimum is at the dataset floor; when the floored lower bound has no exact listing price, the first real slider step is still treated as an unfiltered minimum. Slider stepping uses `1` so the max handle can always reach the exact dataset ceiling value.
- When min/max rent handles overlap, drag direction is preserved from the merged thumb for the duration of the current drag gesture: dragging down moves the minimum handle, dragging up moves the maximum handle.
- Price filtering is review-history based: with a min/max rent filter active, a listing matches only when at least one approved review `price_usd` falls within the selected bounds.
- `price_asc` sorting uses the listing's lowest approved-review rent value (listings without review rents sort after priced listings).
- Listing-level `price_usd` is treated as legacy/deprecated at runtime; list/detail/map rent display no longer falls back to listing-level values.
- Place-filters/map UI is modularized with dedicated helpers/hooks/components (`place-filters-price.ts`, `use-place-filters-state.ts`, `use-favorites.ts`, `use-price-filter.ts`, `map-listing-sidebar-item.tsx`), and map styles are split into `globals-map.css` imported from `globals.css`.
- Global stylesheet architecture is split by feature: `globals.css` imports `styles/theme-tokens.css`, `styles/foundation.css`, and `styles/top-bar.css` plus `globals-map.css`.
- Cards/Map filter state (including selected view mode) is persisted in browser `localStorage` using shared key `infiuba:filters:v2` so navigation/reloads and language switches keep the same filters/view; legacy per-language keys are auto-migrated on read.
- Filter persistence loading is gated so initial render defaults never overwrite stored filters before hydration applies them.
- Visitor-safe listing/detail reads use short-lived server cache (`unstable_cache`); cache tags are revalidated when public listing data changes (new listing creation, review approval).
- Listing aggregate fields (`average_rating`, `recommendation_rate`, `total_reviews`, `recent_year`) are recomputed from approved reviews whenever a pending web review is approved.
- Map panel shows up to 3 latest approved review comments for the selected listing (translated to current UI language when available), with the same "show original/translation" toggle used in listing detail reviews.
- Map view includes full selected-listing details (stats, owner contacts when visible by role, details link); historical reviews render before the inline per-listing review form for whitelisted/admin users.
- Map mode has favorites parity with list mode: sidebar cards and selected-listing details include favorite controls (visitor clicks show a sign-in hint and do not save), and map sidebar image overlays/rail summaries show quick neighborhood + rating visibility.
- When owner contacts are hidden by permissions, listing detail and map-selected panels show a small colored hint prompting login to view contact info.
- Owner contact strings are linkified in UI (email/phone/url detection) for detail pages, map view, and review form context.
- Contact rich-text rendering for owner contacts is centralized in `src/components/contact-rich-text.tsx` and reused by listing detail, map-selected details, add-review matched-listing context, and contact-edit request UI.
- Admin access/reviews/contact-edits panels share localized date+time formatting through `formatDateTime` in `src/lib/format.ts` (instead of local per-panel formatters).
- Whitelisted/admin users can request owner-contact and max-students updates from listing views; requests are reviewed in the admin contact edits view before applying changes.
- Reviewer contact info is shown under map comments when available/consented, linkifying each email and phone separately (phones open WhatsApp; emails use mailto).
- Review rating inputs use a 5-star control with whole-star increments and start unselected (0) until the user picks a value; recommendation radio buttons also start unselected and must be chosen. Review forms use client-side validation (no native browser validation) and highlight missing required fields with inline error text plus a shared error summary. Reported rent paid is required for all reviews; new listings also require owner contact info and max students. Contact fields are grouped under a contact section in review forms.
- Review forms use a searchable country-code phone picker (flag + localized country name + dial code) for reviewer phone input in both add-review and detail-review flows; stored reviewer phone values are normalized to `+<country-code> <number>`. Default country is Argentina (`+54`) for English and Spanish UI.
- Review translation columns (`comment_en` … `comment_no`) are centralized via `REVIEW_TRANSLATION_COLUMNS` and SQL builders in `src/lib/review-translations.ts`, and reused by listing/review data queries plus seeding scripts to avoid hardcoded per-query column lists.
- On mobile/narrow layouts (`<=1100px`), map mode is map-first: a horizontal property rail sits under the map, and the full results list opens as a bottom-sheet drawer with backdrop.
- In map mode, selected listing details (stats + owner contacts when visible to role + details link) render under the map panel content; on mobile/narrow layouts they appear under the horizontal rail.
- Selecting a listing from map markers keeps list/rail selection in sync and auto-scrolls the corresponding item into view when visible; when sort order changes in map mode, selection resets to the first result in the new order.
- On desktop map layout, the left listing column uses viewport-capped internal scrolling (`max-height`), while the right panel keeps a matching viewport-based minimum height.
- Map sidebar listing cards include extra inner spacing/insets so media badges, wrapped titles, stats text, and CTA links do not sit flush against card edges.
- Map sidebar listing selection uses semantic `<button>` controls (instead of `div[role=button]`) while keeping a separate favorite button control on each card.
- List-mode cards use equal-height stacks with two-line title clamping so long addresses do not break grid rhythm or misalign adjacent admin action links.
- Header menus (language/access) are layered above map controls/popups to avoid overlap while using map view.
- Top-bar menus (`language-menu`, `role-menu`) close when users click outside the open menu via shared hook `src/lib/use-details-outside-close.ts`.
- In the OTP login popover, the "Remember me" checkbox and label stay aligned on a single row.

## Runtime and Commands

- Install deps: `npm install`
- Test suite: `npm run test`
- Test coverage: `npm run test:coverage`
- Test watch: `npm run test:watch`
- Lint (typecheck gate): `npm run lint`
- Format check (tracked-file whitespace/newline gate): `npm run format:check`
- Integration tests (Docker Postgres): `npm run test:integration:docker`
- Integration tests (existing DB): set `DATABASE_URL` then `npm run test:integration`
- Dev server: `npm run dev`
- Test suite: `npm test`
- Production build: `npm run build`
- Vercel deploy uses `vercel-build` to run tests + migrations before build: `npm run test && npm run db:migrate && npm run build`
- Next.js type-check excludes `tests/` and `vitest*.config.ts` via `tsconfig.json` to avoid build-time config/type conflicts.
- Import dataset from CSV: `npm run import:data`
- `npm run import:data` writes local seed dataset `src/data/accommodations.json` (gitignored).
- Geocode listings: `npm run geocode:data`
- Init/migrate DB schema: `npm run db:migrate` (runs with `--verbose false` to avoid per-SQL logs; pass `--verbose` via node-pg-migrate for debug).
- Roll back the latest migration (when reversible): `npm run db:migrate:down` (also non-verbose).
- `db:migrate` reads `DATABASE_URL` (node-pg-migrate `-d` expects the env var name).
- Migration CLI discovery is scoped to JS entry files (`migrations/*.js` with `--use-glob`) so helper `.sql`/docs are not imported as migrations.
- Migration scripts run with `--check-order false` (legacy setting); migrations now use timestamp-style prefixes.
- `scripts/db-migrate.mjs` rewrites legacy `pgmigrations.name` entries (from `001_` style) to the new timestamped names before running node-pg-migrate.
- Legacy alias: `npm run db:init`
- Seed DB: `npm run db:seed`
- Init/migrate + seed: `npm run db:setup`
- Upsert auth user: `npm run user:upsert -- --email user@example.com --role whitelisted`

## Environment Variables

- `DATABASE_URL`: required for runtime and DB scripts.
- `PGSSL=true`: optional SSL for DB pool (strict certificate verification by default).
- `PGSSL_CA_CERT`: optional PostgreSQL CA certificate in PEM format (supports escaped `\n`).
- `PGSSL_ALLOW_INSECURE=true`: development-only override to disable certificate verification; forbidden in production.
- `AUTH_SECRET`: secret for signing auth role cookie; required in production, minimum 32 characters, and must not be a known placeholder value.
- `VISITOR_CAN_VIEW_OWNER_CONTACTS=true`: emergency read-only fallback to expose owner contacts to visitors (reviewer/student contacts remain protected).
- `OTP_EMAIL_PROVIDER`: OTP delivery provider (`brevo`, `resend`, or `console`; defaults to `console` in non-production when unset).
- `OTP_CONSOLE_ONLY_EMAIL`: optional single email forced to console OTP delivery (skips provider send); defaults to `mock@email.com` in non-production when unset.
- `OTP_FROM_EMAIL`: optional provider-agnostic sender identity fallback (`Name <email@domain>`).
- `OTP_LOGO_URL`: optional absolute public URL for OTP email logo rendering (recommended when using deployment protection/proxies); if unset, app uses `${origin}/infiuba-logo.png`.
- `BLOB_READ_WRITE_TOKEN`: required for `@vercel/blob` server uploads used by `/api/review-images`.
- `BLOB_UPLOAD_PREFIX`: optional path prefix for Blob uploads (sanitized lowercase slug path). When set, uploads are stored under `${BLOB_UPLOAD_PREFIX}/reviews/...`; when unset, uploads use `reviews/...`.
- `BREVO_API_KEY`: required when `OTP_EMAIL_PROVIDER=brevo`.
- `BREVO_FROM_EMAIL`: sender identity for Brevo OTP emails.
- `RESEND_API_KEY`: required when `OTP_EMAIL_PROVIDER=resend`.
- `RESEND_FROM_EMAIL`: sender identity for Resend OTP emails.

Notes:

- If `AUTH_SECRET` changes, all active sessions are invalidated.
- In production, missing or weak `AUTH_SECRET` causes auth signing operations to fail fast.

## Access Control Model

Roles:

- `visitor` (default):
  - Can browse public listing/review content.
  - Cannot see owner contacts unless `VISITOR_CAN_VIEW_OWNER_CONTACTS=true`.
  - Cannot see reviewer contact info.
  - Cannot submit reviews.
  - Cannot save listing favorites.
  - Cannot access admin moderation.
- `whitelisted`:
  - Full listing/review visibility including contacts (subject to reviewer consent).
  - Can submit reviews.
  - Can save listing favorites.
  - Cannot access admin moderation.
- `admin`:
  - Same as whitelisted.
  - Can save listing favorites.
  - Can access admin pages for reviews, contact edits, user access, security telemetry, and publication editing.

Implementation:

- Role session cookie name: `infiuba_role`.
- Cookie is signed (HMAC SHA-256) in `src/lib/auth.ts`.
- Session cookie payload includes role plus auth metadata (`authMethod`, optional email).
- For `otp` sessions, role is revalidated against `users` on read; missing users resolve to `visitor`.
- Session API:
  - `POST /api/session` with:
    - `{ action: "requestOtp", email, lang? }` to send OTP, then
    - `{ action: "verifyOtp", email, otpCode, trustDevice }` to sign in.
    - Verify path sets signed role cookie.
    - `requestOtp` intentionally returns a generic success payload for most auth-related outcomes to reduce account enumeration.
    - `verifyOtp` intentionally returns generic invalid-code failures for non-success auth outcomes (`not_allowed`, invalid/expired codes, etc.).
    - OTP abuse throttling uses request network fingerprints derived from proxy headers (`x-forwarded-for`, `cf-connecting-ip`, `x-real-ip`, `forwarded`).
    - OTP request/verify outcomes are logged to `security_audit_events` (with redacted email display and hashed network keys).
    - Session API responses are returned with `Cache-Control: no-store`.
  - `GET /api/session/magic?token=<otp-link-token>&lang=<lang>` verifies one-click OTP link tokens, sets the signed role cookie on success, records OTP verify audit events, and redirects to `/{lang}`.
  - `DELETE /api/session` -> logout (clears cookie).
  - `GET /api/session` -> current resolved role (DB-validated for cookie-backed sessions).
  - Sign-in paths are OTP-only: `POST /api/session` (`verifyOtp`) and one-click OTP magic links via `GET /api/session/magic`.

User access management:

- Admin access view includes active and deleted users.
- API: `GET /api/admin/users` returns active/deleted user lists.
- API: `POST /api/admin/users` supports:
  - `{ action: "updateRole", email, role }` to change role
  - `{ action: "delete", email }` to delete a user (stores email in `deleted_users`)
  - `{ action: "upsert", emails, role }` to bulk create/reactivate users
- Admin cannot modify or delete their own currently authenticated email session.
- Admin user-management actions/outcomes are logged to `security_audit_events`.
- Security telemetry API: `GET /api/admin/security` (admin-only, no-store) returns audit/rate-limit windows, recent redacted events, and threshold alerts.

## Data Sources

Runtime:

- PostgreSQL for listings, contacts, reviews, metadata.
- App/API behavior assumes DB availability; there is no JSON/file fallback at runtime.

Seed/import tooling:

- `scripts/build-dataset.mjs` generates `src/data/accommodations.json` locally for `scripts/db-seed.mjs`.
- Optional local seed inputs (if present): `data/reviews.pending.json`, `data/reviews.approved.json`.
- `data/geocoding.cache.json` is a local cache used by `scripts/geocode-listings.mjs`.

## Database Schema (Current)

Defined in `migrations/20260206090000000_initial_schema.sql`, `migrations/20260206090100000_otp_rate_limit_buckets.sql`, `migrations/20260206090200000_listing_contact_length_limit.sql`, `migrations/20260206090300000_dataset_meta_bootstrap.sql`, `migrations/20260206090400000_drop_legacy_invites.sql`, `migrations/20260206090500000_security_audit_events.sql`, `migrations/20260207090000000_contact_edit_requests.sql`, `migrations/20260208090000000_contact_edit_capacity.sql`, `migrations/20260209100000000_listing_review_images.sql`, `migrations/20260210130000000_listing_image_order_metadata.sql`, and `migrations/20260210170000000_listing_favorites.sql` (applied via node-pg-migrate; rollback behavior documented in `migrations/ROLLBACK_POLICY.md`).

Finite-state fields use PostgreSQL enums:

- `user_role_enum`: `whitelisted`, `admin`
- `review_source_enum`: `survey`, `web`
- `review_status_enum`: `pending`, `approved`, `rejected`
- `otp_consumed_reason_enum`: `verified`, `replaced`, `too_many_attempts`
- `contact_edit_status_enum`: `pending`, `approved`, `rejected`

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
- `price_usd NUMERIC` (legacy/deprecated runtime field; review-level prices are canonical)
- `capacity NUMERIC`
- `average_rating NUMERIC`
- `recommendation_rate NUMERIC`
- `total_reviews INTEGER NOT NULL DEFAULT 0`
- `recent_year INTEGER`
- `image_urls TEXT[] NOT NULL DEFAULT '{}'::text[]` (admin ordering metadata for review-derived listing gallery; no fixed count cap)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `listing_contacts`

- `id BIGSERIAL PRIMARY KEY`
- `listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE`
- `contact TEXT NOT NULL`
- `contact` length is capped at 180 characters for new/updated rows.
- `UNIQUE (listing_id, contact)`

### `listing_contact_edit_requests`

- `id BIGSERIAL PRIMARY KEY`
- `listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE`
- `requester_email TEXT NOT NULL`
- `requested_contacts TEXT[] NOT NULL`
- `current_contacts TEXT[] NOT NULL`
- `requested_capacity NUMERIC`
- `current_capacity NUMERIC`
- `status contact_edit_status_enum NOT NULL DEFAULT 'pending'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `reviewed_at TIMESTAMPTZ`
- `reviewed_by_email TEXT`

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
- `image_urls TEXT[] NOT NULL DEFAULT '{}'::text[]` (max 6)
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

### `listing_favorites`

- `user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE`
- `listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `PRIMARY KEY (user_email, listing_id)`

### `auth_email_otps`

- `id BIGSERIAL PRIMARY KEY`
- `email TEXT NOT NULL` (lowercased)
- `code_hash TEXT NOT NULL` (HMAC hash of OTP code + email; raw code is never stored)
- `expires_at TIMESTAMPTZ NOT NULL`
- `consumed_at TIMESTAMPTZ`
- `consumed_reason otp_consumed_reason_enum` (`verified`, `replaced`, `too_many_attempts`)
- `attempts INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### `auth_rate_limit_buckets`

- `scope TEXT NOT NULL` (rate-limit scope id)
- `bucket_key_hash TEXT NOT NULL` (HMAC hash of network/global bucket key; raw IP/subnet is never stored)
- `window_seconds INTEGER NOT NULL` (window size per scope)
- `bucket_start TIMESTAMPTZ NOT NULL` (fixed-window bucket start)
- `hits INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `PRIMARY KEY (scope, bucket_key_hash, window_seconds, bucket_start)`

### `security_audit_events`

- `id BIGSERIAL PRIMARY KEY`
- `event_type TEXT NOT NULL`
- `actor_email TEXT`
- `target_email TEXT`
- `ip_key_hash TEXT` (HMAC hash; raw network key is never stored)
- `subnet_key_hash TEXT` (HMAC hash; raw network key is never stored)
- `outcome TEXT NOT NULL`
- `metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Legacy (unused by app):

- Invite flows remain removed from the application.

Indexes:

- `idx_listings_neighborhood ON listings(neighborhood)`
- `idx_users_email_unique ON users(email)` (unique)
- `idx_users_email_lower_unique ON users(lower(email))` (unique, case-insensitive)
- `idx_users_role_active ON users(role, is_active)`
- `idx_deleted_users_email_lower_unique ON deleted_users(lower(email))` (unique, case-insensitive)
- `idx_deleted_users_deleted_at ON deleted_users(deleted_at DESC)`
- `idx_listing_favorites_user_created ON listing_favorites(user_email, created_at DESC)`
- `idx_listing_favorites_listing_id ON listing_favorites(listing_id)`
- `idx_auth_email_otps_email_open ON auth_email_otps(email, consumed_at, expires_at DESC)`
- `idx_auth_email_otps_email_lower ON auth_email_otps(lower(email))`
- `idx_auth_rate_limit_buckets_updated_at ON auth_rate_limit_buckets(updated_at DESC)`
- `idx_auth_rate_limit_buckets_scope_key ON auth_rate_limit_buckets(scope, bucket_key_hash, updated_at DESC)`
- `idx_contact_edit_requests_status_created ON listing_contact_edit_requests(status, created_at DESC)`
- `idx_contact_edit_requests_listing_id ON listing_contact_edit_requests(listing_id)`
- `idx_contact_edit_requests_requester_email ON listing_contact_edit_requests(lower(requester_email))`
- `idx_contact_edit_requests_reviewed_at ON listing_contact_edit_requests(reviewed_at DESC)`
- `idx_security_audit_events_created_at ON security_audit_events(created_at DESC)`
- `idx_security_audit_events_event_type_created ON security_audit_events(event_type, created_at DESC)`
- `idx_security_audit_events_outcome_created ON security_audit_events(outcome, created_at DESC)`
- `idx_reviews_listing_status ON reviews(listing_id, status, source)`
- `idx_reviews_status_created ON reviews(status, created_at DESC)`

Integrity hardening (enforced in `migrations/20260206090000000_initial_schema.sql`, `migrations/20260206090100000_otp_rate_limit_buckets.sql`, `migrations/20260206090200000_listing_contact_length_limit.sql`, `migrations/20260206090300000_dataset_meta_bootstrap.sql`, `migrations/20260206090400000_drop_legacy_invites.sql`, `migrations/20260206090500000_security_audit_events.sql`, `migrations/20260207090000000_contact_edit_requests.sql`, `migrations/20260208090000000_contact_edit_capacity.sql`, `migrations/20260209100000000_listing_review_images.sql`, `migrations/20260210130000000_listing_image_order_metadata.sql`, and `migrations/20260210170000000_listing_favorites.sql`):

- Non-empty checks for core text identifiers (`users.email`, `deleted_users.email`, `auth_email_otps.email`, listing address/neighborhood, listing contact).
- Numeric range checks for ratings, recommendation rates, coordinates, and year fields.
- Review approval consistency (`approved_at` must be present only when `status='approved'`).
- Review rent consistency (`reviews.price_usd` must be null or > 0).
- OTP consistency (`consumed_at`/`consumed_reason` coupled, attempts non-negative, expires/consumed not before creation).
- Rate-limit bucket consistency (`scope`/`bucket_key_hash` non-empty, `window_seconds > 0`, `hits >= 0`).
- Security audit event consistency (`event_type`/`outcome` non-empty).
- Listing contact length control (`listing_contacts.contact` <= 180 for new/updated rows).
- Contact edit requests enforce non-empty requester emails and at least one requested field (contacts or max students); requested/current capacity values must be null or > 0.
- Listing favorites enforce non-empty user email and listing id.
- Review image arrays enforce count caps (`reviews.image_urls <= 6`); listing image-order metadata is intentionally uncapped.
- `dataset_meta` bootstrap row (`id=1`) is created if missing via migration.
- Legacy invite DB artifacts (`auth_invites`, `invite_consumed_reason_enum`) are dropped by migration.
- Legacy-row normalization before constraints are applied (trim/canonicalize emails, null-out invalid ranges, dedupe users by case-insensitive email).
- Initial migration handles both pre-enum and post-enum states for `reviews.source`/`reviews.status`.

## Review Translation Model

- Original text is always stored in `reviews.comment`.
- Translated variants are stored in fixed columns `comment_<lang>`.
- UI language selection uses the corresponding translation when available.
- Users can toggle between translated/original review text in listing detail views.

## Rent Data Model

- Canonical rent history lives in `reviews.price_usd` (one value per review when provided).
- `listings.price_usd` remains in schema as a legacy/deprecated column but is not used for runtime rent filtering/sorting/display fallback.
- Cards/map preview and detail stats use approved-review min/max rent range only (when review rent data exists).
- Cards/map min/max rent filters operate on approved review rent history (`reviews.price_usd`) and require at least one review rent in-range for a listing to match.
- Seed path now writes `listings.price_usd` as `NULL` for imported listings.
- Per-review rent remains visible in review metadata when present.

## Image Data Model

- Review-level images are stored in `reviews.image_urls` (up to 6 URLs) and are the canonical source of listing/gallery media.
- Listing-level gallery display is derived from approved review images (survey + web).
- `listings.image_urls` stores admin-managed ordering metadata for the derived gallery; the first ordered image is the listing cover image in cards.
- Upload endpoint `POST /api/review-images` is role-gated to `whitelisted`/`admin`, same-origin protected, and accepts only `jpeg`/`png`/`webp`/`gif`/`avif` with a per-file 5MB limit and max 6 files per request.
- Blob upload path supports environment separation via optional `BLOB_UPLOAD_PREFIX` (for example `prod`, `preview`, `local`).
- Review submit payload supports optional `reviewImageUrls` only.
- Admin publication edit APIs:
  - `GET /api/admin/publications` lists listings + review-image counts.
  - `GET /api/admin/publications?listingId=<id>` returns publication details (address/neighborhood/capacity/contacts + ordered images).
  - `POST /api/admin/publications` supports publication updates (`updatePublication`), image reorder (`saveImageOrder`), and image deletion (`deleteImage`).
- Legacy alias routes were removed: do not reintroduce `/api/admin/listing-images`, `/{lang}/admin/images`, or `/{lang}/admin/moderation`.

## Favorites Data Model

- Favorites are stored in `listing_favorites` and keyed by `(user_email, listing_id)`.
- Favorites can be saved/removed only for authenticated OTP sessions tied to active users.
- API:
  - `GET /api/favorites` returns current user favorite listing IDs (or an empty list for visitors).
  - `POST /api/favorites` with `{ action: "add" | "remove", listingId }` updates favorites (same-origin protected, no-store).
  - When favorites schema is missing (migration not applied), API returns `503` with a migration-required error.
- List/map favorite heart controls show a sign-in hint when visitors click, and show inline error feedback instead of silently failing when favorite reads/writes fail.
- Listings filters include a `Favorites` slider toggle that is available for logged-in users and persisted with the same shared filter storage key; the slider uses a neutral track in both states and indicates state by knob position.

## Review and Moderation Flow

Submission:

- Review form supports:
  - Existing listing review (with match confirmation)
  - New listing + review in one flow
- Endpoint: `POST /api/reviews`
- New reviews are inserted as `source='web'`, `status='pending'`
- New-listing contact ingestion (`contacts`) enforces at most 20 entries and rejects any item longer than 180 characters.
- New review payload supports optional `reviewImageUrls`.
- Listing image URLs are not accepted from review submissions; listing/gallery media comes from approved review images only.
- Creating a new listing through review submission revalidates public listing/dataset cache tags.
- Review submission validates `studentEmail` and any email-like `studentContact` with strict email rules; invalid email input is rejected.
- Cache-tag names and revalidation patterns are centralized in `src/lib/cache-tags.ts` and reused by reviews/admin moderation/contact-edit/publication APIs.
- Review submission API errors are structured as `{ code, message }` (with legacy `error` alias for compatibility), and client-side review forms map errors by `code` with message fallback in `src/lib/review-form.ts`.
- Permission enforced server-side: only `whitelisted` and `admin`

Moderation:

- Page: `/{lang}/admin/reviews`
- API: `/api/admin/reviews` (`GET`, `POST`)
- Permission enforced server-side: `admin` only
- Admin review edits are available from review cards in listing detail and map-selected historical-reviews views for admins, and edit saves are submitted through `POST /api/admin/reviews` with `action: \"edit\"`.
- Admin review edits can update approved reviews (web + survey), including review text/metadata and review image URLs; image uploads reuse `POST /api/review-images` before save.
- On approve action, listing aggregates are refreshed in `listings` from all approved reviews for that listing.
- On approve action, public listing/review cache tags are revalidated (`public-listings`, `public-listing:<id>`, `public-approved-reviews`).
- Moderation/edit actions and outcomes are recorded in `security_audit_events`.

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
- Price filter/sort helper module: `src/app/[lang]/place-filters-price.ts`
- Place filter persisted-state hook: `src/app/[lang]/use-place-filters-state.ts`
- Place favorites hook: `src/app/[lang]/use-favorites.ts`
- Place price-filter hook: `src/app/[lang]/use-price-filter.ts`
- Map sidebar item component: `src/app/[lang]/map-listing-sidebar-item.tsx`
- Listing detail page: `src/app/[lang]/place/[id]/page.tsx`
- Add review flow: `src/app/[lang]/add-stay-review-form.tsx`
- Detail review form: `src/app/[lang]/place/[id]/review-form.tsx`
- Admin layout + header/navigation: `src/app/[lang]/admin/layout.tsx`, `src/app/[lang]/admin/admin-header.tsx`, `src/app/[lang]/admin/admin-nav.tsx`
- Admin reviews page: `src/app/[lang]/admin/reviews/page.tsx`
- Admin contact edits page: `src/app/[lang]/admin/contact-edits/page.tsx`
- Admin contact edits panel: `src/app/[lang]/admin/contact-edits/contact-edits-panel.tsx`
- Admin access page: `src/app/[lang]/admin/access/page.tsx`
- Admin security telemetry page: `src/app/[lang]/admin/security/page.tsx`
- Admin publication editor page/panel: `src/app/[lang]/admin/publications/page.tsx`, `src/app/[lang]/admin/publications/publications-panel.tsx`
- Admin users API: `src/app/api/admin/users/route.ts`
  - `GET` managed users (`active` + `deleted`)
  - `POST` update roles, delete, or bulk upsert users
- Admin publications API: `src/app/api/admin/publications/route.ts`
- Favorites API: `src/app/api/favorites/route.ts`
- Contact edit request API: `src/app/api/contact-edits/route.ts`
- Admin contact edits API: `src/app/api/admin/contact-edits/route.ts`
- Admin security telemetry API: `src/app/api/admin/security/route.ts`
- Review image upload API: `src/app/api/review-images/route.ts`
- App security headers config: `next.config.mjs`
- Root layout + theme bootstrap script loader: `src/app/layout.tsx`
- Theme bootstrap script (static, beforeInteractive): `public/theme-init.js`
- Request validation helpers: `src/lib/request-validation.ts`
- Frontend API client helpers: `src/lib/api-client.ts`
- Cache-tag invalidation helpers: `src/lib/cache-tags.ts`
- Shared review payload helpers: `src/lib/review-form.ts`
- Shared review-form state hook: `src/lib/use-review-form-core.ts`
- Shared review form field sections component: `src/components/review-core-fields.tsx`
- Review API error codes/constants: `src/lib/review-api-errors.ts`
- Review translation-column helpers: `src/lib/review-translations.ts`
- Review year helper: `src/lib/review-year.ts`
- Phone input with country picker: `src/components/phone-input-with-country.tsx`
- Shared contact rich-text renderer: `src/components/contact-rich-text.tsx`
- Contact edit request UI: `src/components/contact-edit-request-form.tsx`
- Shared image gallery/lightbox UI: `src/components/image-gallery-viewer.tsx`
- Role/auth helpers: `src/lib/auth.ts`
- Email/contact helpers: `src/lib/email.ts`
- No-store response helper: `src/lib/http-cache.ts`
- Request network fingerprint helper: `src/lib/request-network.ts`
- Security audit event writer: `src/lib/security-audit.ts`
- Security telemetry snapshot builder: `src/lib/security-telemetry.ts`
- OTP mail delivery helper: `src/lib/otp-mailer.ts`
- OTP magic-link verifier route: `src/app/api/session/magic/route.ts`
- OTP email logo asset: `public/infiuba-logo.png` (sourced from `assets/infiuba color 1.png`; PNG is used for broad email-client compatibility). OTP logo URL can be overridden with `OTP_LOGO_URL`.
- Review image helpers: `src/lib/review-images.ts`, `src/lib/review-image-upload.ts`
- Review-image ordering helpers: `src/lib/review-image-order.ts`, `src/lib/admin-listing-images.ts`
- Shared details-menu outside-close hook: `src/lib/use-details-outside-close.ts`
- Favorites helpers: `src/lib/favorites.ts`
- Shared date/time formatter helper: `src/lib/format.ts`
- Data access: `src/lib/data.ts`
- Reviews store: `src/lib/reviews-store.ts`
- Messages/i18n: `src/i18n/messages.ts`, `src/lib/i18n.ts`, `src/lib/i18n-config.ts`
- CI checks workflow: `.github/workflows/ci.yml`
- Global style entrypoint: `src/app/globals.css`
- Global style partials: `src/app/styles/theme-tokens.css`, `src/app/styles/foundation.css`, `src/app/styles/top-bar.css`
- Global map styles partial: `src/app/globals-map.css`

## Agent Best Practices for This Repo

1. Enforce permissions on the server, not only in UI.
2. Preserve multilingual parity: if adding/changing a message key, update all languages.
3. Keep visitor-safe defaults when uncertain.
4. Run checks after significant changes:
   - `npm run lint`
   - `npm run format:check`
   - `npm test`
   - `npm run build`
5. Keep runtime DB-only behavior; do not reintroduce file fallback paths.
6. Avoid schema drift: update `migrations/` (and any future migrations), `scripts/db-seed.mjs`, and this file together.
7. Never expose secrets/tokens in client code or logs.
8. Keep login OTP-only for top-bar auth; only active users already present in `users` should be able to complete sign-in.
9. Keep OTP login as the only sign-in method unless explicitly changed.
10. Follow `migrations/ROLLBACK_POLICY.md`: baseline migration is irreversible, incremental migrations should provide reversible downs when safe.

## Change Checklist (Use Every Task)

- [ ] Code changes completed.
- [ ] Permissions reviewed for visitor/whitelisted/admin impact.
- [ ] i18n keys updated for all supported languages.
- [ ] DB schema/docs updated if data model changed.
- [ ] `AGENTS.md` updated to reflect the new reality.
- [ ] Type check/build run (or note why not run).
