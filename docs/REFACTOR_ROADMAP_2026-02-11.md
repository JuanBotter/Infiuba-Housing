# Refactor Roadmap (Code Repetition + Best Practices)

Date: 2026-02-11  
Scope: repository-wide refactors focused on reducing duplication, improving maintainability, and standardizing engineering patterns.

## Estimation Model

- `S` = 1-2 dev days
- `M` = 3-5 dev days
- `L` = 6-10 dev days
- `XL` = 10+ dev days

## Dependency Graph (High Level)

- `R01 -> R03 -> R06 -> R10`
- `R02 -> R03 -> R04`
- `R02 -> R05`
- `R09` supports `R03`, `R10`, `R14`
- `R15` runs continuously, then expands after `R03/R04/R05/R10`

## Task Backlog

### R01 - API Route Guard/Wrapper Layer
- Priority: `P0`
- Effort: `M`
- Depends on: none
- Goal: remove repeated same-origin/auth/admin/db/no-store checks from route handlers.
- Status: `Done` (2026-02-11) - Added shared route guards in `src/lib/api-route-helpers.ts` and migrated `session`, `favorites`, `reviews`, and `admin/*` routes to reuse same-origin/admin/db/error checks. Validation now passes (`npm test`, `npm run build`) after reinstalling dependencies (`npm install`) to resolve missing local `libphonenumber-js` package files.
- Primary files:
  - `src/app/api/session/route.ts`
  - `src/app/api/favorites/route.ts`
  - `src/app/api/reviews/route.ts`
  - `src/app/api/admin/*/route.ts`
- Deliverable:
  - shared route helpers (`requireSameOrigin`, `requireAdminSession`, `requireDb`, `jsonError`).

### R02 - Shared Domain Constraints + Normalizers
- Priority: `P0`
- Effort: `S`
- Depends on: none
- Goal: centralize duplicated limits/parsing (`contacts`, `capacity`, email checks, numeric conversion).
- Status: `Done` (2026-02-11) - Added `src/lib/domain-constraints.ts` as the shared source for listing/reviewer constraints and normalizers; migrated reviews/contact-edits/admin publications routes plus `data.ts`, `reviews-store.ts`, and `admin-listing-images.ts` to reuse shared rules.
- Primary files:
  - `src/app/api/reviews/route.ts`
  - `src/app/api/contact-edits/route.ts`
  - `src/app/api/admin/listing-images/route.ts`
  - `src/lib/data.ts`
  - `src/lib/reviews-store.ts`
  - `src/lib/admin-listing-images.ts`
- Deliverable:
  - single source of truth module for constraints and normalizers.

### R03 - Structured API Error Codes
- Priority: `P0`
- Effort: `M`
- Depends on: `R01`, `R02`
- Goal: replace string-comparison error handling with typed `code` payloads.
- Status: `Done` (2026-02-11) - `POST /api/reviews` now returns structured `{ code, message }` errors (plus legacy `error` alias), and client review-form error mapping now resolves by `code` with backward-compatible message fallback.
- Primary files:
  - `src/app/api/reviews/route.ts`
  - `src/lib/review-form.ts`
  - `src/app/[lang]/add-stay-review-form.tsx`
  - `src/app/[lang]/place/[id]/review-form.tsx`
- Deliverable:
  - API responses return `{ code, message }`, UI maps by `code`.

### R04 - Unified Review Form Core
- Priority: `P0`
- Effort: `L`
- Depends on: `R02`, `R03`
- Goal: deduplicate submission, validation, and upload logic across add-review/detail-review flows.
- Primary files:
  - `src/app/[lang]/add-stay-review-form.tsx`
  - `src/app/[lang]/place/[id]/review-form.tsx`
  - `src/lib/review-form.ts`
  - `src/lib/review-image-upload.ts`
- Deliverable:
  - shared hook + shared form sections/components.

### R05 - Modularize `PlaceFilters` (Major Decomposition)
- Priority: `P0`
- Effort: `XL`
- Depends on: `R02` (recommended)
- Goal: split state, persistence, filtering, sorting, favorites, and map selection into focused units.
- Primary files:
  - `src/app/[lang]/place-filters.tsx`
  - `src/app/[lang]/map-listing-sidebar-item.tsx`
- Deliverable:
  - `usePlaceFiltersState`, `useFavorites`, `usePriceFilter`, extracted view components.

### R06 - Frontend API Client Layer
- Priority: `P1`
- Effort: `M`
- Depends on: `R03`
- Goal: standardize fetch behavior and HTTP status mapping in client components.
- Status: `Done` (2026-02-11) - Added typed `src/lib/api-client.ts` with reusable request/error mapping helpers and migrated admin access/reviews/contact-edits/publications panels plus role switcher auth actions to use it.
- Primary files:
  - `src/app/[lang]/admin/access/access-panel.tsx`
  - `src/app/[lang]/admin/reviews/reviews-panel.tsx`
  - `src/app/[lang]/admin/contact-edits/contact-edits-panel.tsx`
  - `src/app/[lang]/admin/publications/publications-panel.tsx`
  - `src/components/role-switcher.tsx`
- Deliverable:
  - typed client (`apiClient`) with reusable error mapping.

### R07 - i18n Payload Slicing for Client Components
- Priority: `P1`
- Effort: `M`
- Depends on: none
- Goal: stop importing full `messages` object into client components.
- Primary files:
  - `src/lib/i18n.ts`
  - client components currently calling `getMessages(...)`
- Deliverable:
  - server passes scoped message props to clients.

### R08 - Shared UI Utilities: Contact Rich Text + Date Formatter
- Priority: `P1`
- Effort: `S`
- Depends on: none
- Goal: remove repeated `renderContactValue` and `formatDate` implementations.
- Status: `Done` (2026-02-11) - Added reusable `ContactRichText` plus shared `formatDateTime`, and migrated place/add-review/map/contact-edit/admin panels to the shared utilities with new unit coverage.
- Primary files:
  - `src/app/[lang]/place/[id]/page.tsx`
  - `src/app/[lang]/add-stay-review-form.tsx`
  - `src/app/[lang]/place-filters.tsx`
  - `src/components/contact-edit-request-form.tsx`
  - admin panels
- Deliverable:
  - reusable contact-render component and shared date-time formatter.

### R09 - Cache Tag Invalidation Helper
- Priority: `P1`
- Effort: `S`
- Depends on: none
- Goal: centralize revalidation tag names and invalidate patterns.
- Status: `Done` (2026-02-11) - Added `src/lib/cache-tags.ts` with shared tag constants/invalidation helpers and migrated review/admin moderation/contact-edit/publication APIs to use it instead of inline `revalidateTag(...)` calls.
- Primary files:
  - `src/app/api/reviews/route.ts`
  - `src/app/api/admin/reviews/route.ts`
  - `src/app/api/admin/contact-edits/route.ts`
  - `src/app/api/admin/listing-images/route.ts`
- Deliverable:
  - `cache-tags.ts` and helper functions for listing/reviews/public metadata.

### R10 - Admin Data Query Optimization + Pagination
- Priority: `P1`
- Effort: `M`
- Depends on: `R06` (recommended), `R09` (recommended)
- Goal: reduce over-fetching and add pagination where lists can grow.
- Primary files:
  - `src/app/[lang]/admin/reviews/page.tsx`
  - `src/lib/data.ts`
  - `src/lib/reviews-store.ts`
  - admin panel API calls
- Deliverable:
  - lightweight listing map query + paged admin endpoints/UI.

### R11 - DRY Translation Column Handling
- Priority: `P1`
- Effort: `M`
- Depends on: none
- Goal: reduce repeated `comment_en/.../comment_no` SQL lists and row typing duplication.
- Primary files:
  - `src/lib/data.ts`
  - `src/lib/reviews-store.ts`
  - `scripts/db-seed.mjs`
- Deliverable:
  - shared translation-column constants/builders.

### R12 - CSS Architecture Cleanup + `next/font`
- Priority: `P2`
- Effort: `L`
- Depends on: `R04`, `R05` (recommended)
- Goal: reduce monolithic global stylesheet risk and improve design token consistency.
- Primary files:
  - `src/app/globals.css`
  - `src/app/globals-map.css`
  - `src/app/layout.tsx`
- Deliverable:
  - split CSS by feature, move fonts to `next/font`, reduce hardcoded color literals.

### R13 - Accessibility + Reusable Menu Behavior
- Priority: `P2`
- Effort: `S`
- Depends on: none
- Goal: improve semantics and remove repeated outside-click menu logic.
- Status: `Done` (2026-02-11) - Added shared `useDetailsOutsideClose` hook for language/access menus and converted map sidebar listing selection from `div[role=button]` to semantic button-based structure while keeping favorite interaction behavior.
- Primary files:
  - `src/app/[lang]/map-listing-sidebar-item.tsx`
  - `src/components/role-switcher.tsx`
  - `src/components/language-switcher.tsx`
- Deliverable:
  - semantic button conversion and shared popover/menu-close hook.

### R14 - Remove Legacy Route Aliases
- Priority: `P2`
- Effort: `S`
- Depends on: `R09`
- Goal: simplify routing and remove unnecessary indirections once clients are migrated.
- Primary files:
  - `src/app/api/admin/publications/route.ts`
  - `src/app/[lang]/admin/images/page.tsx`
  - `src/app/[lang]/admin/moderation/page.tsx`
- Deliverable:
  - canonical route names only (`publications`, `reviews`).

### R15 - Quality Gates + Coverage Expansion
- Priority: `P2`
- Effort: `M`
- Depends on: start now; expand after `R03/R04/R05/R10`
- Goal: enforce code quality and close test gaps on key API surfaces.
- Primary files:
  - `.github/workflows/ci.yml`
  - `package.json`
  - `tests/api/*`
- Deliverable:
  - lint/format CI step + tests for missing route families (`contact-edits`, `admin/contact-edits`, `admin/listing-images/publications`, `admin/security`).

### R16 - Structured Same-Origin Guard Errors
- Priority: `P1`
- Effort: `S`
- Depends on: `R01`, `R03`
- Goal: ensure shared origin-validation failures return typed `code` payloads so clients can map them without string matching.
- Status: `Done` (2026-02-11) - `validateSameOriginRequest` now returns structured `{ code, message }` payloads with legacy `error` alias; covered by updated request-origin tests.
- Primary files:
  - `src/lib/request-origin.ts`
  - `src/lib/api-route-helpers.ts`
  - `tests/lib/request-origin.test.ts`
- Deliverable:
  - origin validation emits typed error codes (`request_origin_validation_failed`, `request_origin_invalid`, `request_origin_missing`).

## Suggested Sprint Order

### Sprint 1 (Stabilize Foundation)
- `R01`, `R02`, `R09`, `R13`

### Sprint 2 (API Contract + Client Integration)
- `R03`, `R06`, `R08`

### Sprint 3 (Main UI Debt)
- `R04`, `R05` (phase 1 decomposition)

### Sprint 4 (Scale + Hardening)
- `R05` (phase 2 completion), `R10`, `R11`, `R15`

### Sprint 5 (Polish + Cleanup)
- `R12`, `R14`, residual `R15`

## Execution Notes

- Keep refactors behavior-preserving by default; use feature flags only if needed for large UI decompositions (`R05`, `R12`).
- For each task: require before/after tests and module-level ownership update.
- Track all tasks by `Rxx` IDs in PR titles to preserve dependency order and traceability.
