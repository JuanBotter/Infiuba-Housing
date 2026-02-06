# Security and Quality Review

Date: 2026-02-06
Scope: Full repository review, starting from `README.md`, then backend/API/auth, DB/migrations, scripts, frontend surfaces, and data files.
Method: Static code review + build/type checks + dependency audit.

## What was checked

- Documentation and configuration: `README.md`, `.env.example`, `next.config.mjs`, `AGENTS.md`
- Auth/session and OTP flow: `src/lib/auth.ts`, `src/lib/otp-mailer.ts`, `src/app/api/session/route.ts`
- API endpoints and authorization: `src/app/api/reviews/route.ts`, `src/app/api/admin/reviews/route.ts`, `src/app/api/admin/users/route.ts`
- Data layer and storage modes: `src/lib/data.ts`, `src/lib/reviews-store.ts`, `src/lib/db.ts`
- Privacy-sensitive datasets/seeding: `src/data/accommodations.json`, `scripts/db-seed.mjs`, migrations
- Frontend rendering and navigation entry points
- Dependency and build health (`npm audit --json --omit=dev`, `npx tsc --noEmit`, `npm run build`)

---

## Remediation status (updated 2026-02-06)

- #2 PII committed in tracked dataset: resolved.
  - Runtime moved to DB-only (`src/lib/data.ts`, `src/lib/reviews-store.ts`).
  - Sensitive/generated data files are now gitignored (`.gitignore`).
  - Sensitive file paths were removed from local reachable history.
- #11 File fallback race-prone storage: resolved by architecture change to DB-only runtime.
- #1 Postgres TLS certificate verification disabled: resolved.
  - Default TLS verification is now strict when `PGSSL=true`.
  - `PGSSL_ALLOW_INSECURE=true` is supported only for non-production development.
  - Optional custom CA is supported via `PGSSL_CA_CERT`.
- Next active item: #3 OTP account enumeration via response semantics.

---

## Findings (by severity)

### 1) High - Postgres TLS certificate verification disabled (Resolved 2026-02-06)

- Evidence:
  - `src/lib/db.ts:16`
  - `scripts/db-seed.mjs:19`
  - `scripts/user-upsert.mjs:59`
- Issue:
  - SSL is enabled with `rejectUnauthorized: false`, which disables certificate validation.
- Risk:
  - Enables man-in-the-middle interception/tampering when DB traffic crosses untrusted networks.
- Recommendation:
  - Default to strict TLS verification.
  - Support CA bundle pinning via env (for example `PG_CA_CERT`/`ssl.ca`) and keep `rejectUnauthorized: true`.
- Resolution:
  - Implemented strict TLS verification by default for DB connections when `PGSSL=true`.
  - Added dev-only insecure override (`PGSSL_ALLOW_INSECURE=true`) with production guard.
  - Added optional CA certificate support (`PGSSL_CA_CERT`) for custom trust chains.

### 2) High - PII committed in tracked dataset (Resolved 2026-02-06)

- Evidence:
  - `src/data/accommodations.json:13`
  - `src/data/accommodations.json:32`
  - `src/data/accommodations.json:43`
  - `src/data/accommodations.json:111`
- Issue:
  - Tracked source data includes emails/phone numbers in owner and student contact fields.
- Risk:
  - If repository access is broad/public, this is direct privacy/compliance exposure.
- Recommendation:
  - Remove or anonymize PII in tracked files.
  - Move raw PII ingestion to secured private storage and seed from protected sources only.
- Resolution:
  - Addressed by DB-only runtime + untracking/ignoring local artifacts + history rewrite.

### 3) Medium - OTP account enumeration via response semantics

- Evidence:
  - `src/lib/auth.ts:376`
  - `src/lib/auth.ts:382`
  - `src/app/api/session/route.ts:71`
  - `src/app/api/session/route.ts:72`
  - `src/app/api/session/route.ts:105`
- Issue:
  - Unknown/not-approved emails return explicit `403 Email not allowed`, while valid ones return success/rate-limit patterns.
- Risk:
  - Attackers can enumerate approved accounts for targeting/phishing.
- Recommendation:
  - Return uniform success/failure messages/status for OTP request/verify paths.
  - Log true reason server-side only.

### 4) Medium - CSRF defenses rely only on SameSite cookies

- Evidence:
  - Cookie policy: `src/lib/auth.ts:842`
  - Stateful endpoints:
    - `src/app/api/session/route.ts:44`
    - `src/app/api/session/route.ts:128`
    - `src/app/api/reviews/route.ts:32`
    - `src/app/api/admin/reviews/route.ts:22`
    - `src/app/api/admin/users/route.ts:76`
- Issue:
  - No CSRF token or strict origin/referer validation on state-changing routes.
- Risk:
  - `SameSite=Lax` mitigates many cases but not all edge cases (same-site/subdomain vectors, browser exceptions).
- Recommendation:
  - Add CSRF token validation or strict `Origin` checks on all mutating endpoints.
  - Consider `SameSite=Strict` for admin-sensitive actions.

### 5) Medium - OTP abuse controls are basic (no IP/global throttling)

- Evidence:
  - Resend interval and attempts:
    - `src/lib/auth.ts:16`
    - `src/lib/auth.ts:17`
    - `src/lib/auth.ts:385`
    - `src/lib/auth.ts:557`
- Issue:
  - Throttle is per email only; no IP/device/global guardrails, no CAPTCHA/challenge.
- Risk:
  - OTP spam/abuse, resource pressure, and easier brute-force attempts across accounts.
- Recommendation:
  - Add layered rate limits (IP + account + subnet) and optional challenge for repeated failures.

### 6) Medium - `AUTH_SECRET` is optional at runtime

- Evidence:
  - `src/lib/auth.ts:147`
  - `src/lib/auth.ts:153`
- Issue:
  - Missing secret falls back to in-memory random secret.
- Risk:
  - Session/OTP hash behavior changes on restart or across instances; unreliable auth behavior and possible lockouts.
- Recommendation:
  - Fail fast in production if `AUTH_SECRET` is missing or weak.
  - Enforce minimum entropy/length checks.

### 7) Medium - Emergency flag can expose owner contacts to all visitors

- Evidence:
  - `src/lib/auth.ts:809`
  - `src/lib/auth.ts:814`
- Issue:
  - `VISITOR_CAN_VIEW_OWNER_CONTACTS=true` bypasses normal privacy boundary for unauthenticated users.
- Risk:
  - Accidental enablement causes broad PII disclosure.
- Recommendation:
  - Add startup warning/error gates for production.
  - Require explicit time-boxed override process and audit log when enabled.

### 8) Medium - Consent model may be too permissive for survey contacts

- Evidence:
  - `scripts/db-seed.mjs:210`
- Issue:
  - `allow_contact_sharing` is auto-derived from contact presence (`Boolean(review.studentContact)`), not explicit consent metadata.
- Risk:
  - Reviewer contact visibility may violate intended consent policy.
- Recommendation:
  - Store explicit consent in source data and default to `false` when unknown.

### 9) Low - No explicit no-store caching headers on sensitive API responses

- Evidence:
  - `src/app/api/session/route.ts:39`
  - `src/app/api/admin/users/route.ts:51`
  - `src/app/api/admin/reviews/route.ts:10`
- Issue:
  - Sensitive JSON responses do not explicitly set `Cache-Control: no-store`.
- Risk:
  - Potential browser/proxy caching of auth/admin data.
- Recommendation:
  - Set explicit anti-cache headers on auth/admin endpoints.

### 10) Low - Contact input length controls are incomplete for new listing contacts

- Evidence:
  - Contact parsing without per-item limit: `src/app/api/reviews/route.ts:22`
  - Insert to unbounded text column: `src/lib/data.ts:443`
- Issue:
  - Number of contacts is capped, but each contact string has no max length enforcement.
- Risk:
  - Data bloat or UI degradation by oversized values.
- Recommendation:
  - Enforce per-contact length and normalization on API and DB constraints.

### 11) Low - File fallback storage is race-prone (read-modify-write) (Resolved 2026-02-06)

- Evidence:
  - Historical evidence from pre-remediation code in `src/lib/reviews-store.ts` (file fallback paths removed in current codebase).
- Issue:
  - No file locking or atomic write strategy for concurrent updates.
- Risk:
  - Lost updates/corrupted JSON under concurrent writes.
- Recommendation:
  - Use atomic temp-file writes + rename and/or migrate all write paths to DB-only mode.
- Resolution:
  - Addressed by migrating runtime read/write paths to PostgreSQL only.

### 12) Low - Browser hardening headers not configured

- Evidence:
  - `next.config.mjs:2`
  - Inline script exists in `src/app/layout.tsx:32`
- Issue:
  - No explicit CSP, HSTS, frame-ancestors, or content-type hardening headers.
- Risk:
  - Lower defense-in-depth against XSS/clickjacking/MIME issues.
- Recommendation:
  - Add a strict header policy and CSP (hash/nonce for the theme inline script).

### 13) Low - `mailto:` link built from unvalidated user content

- Evidence:
  - Render: `src/app/[lang]/place/[id]/page.tsx:177`
  - Input acceptance: `src/app/api/reviews/route.ts:47`
- Issue:
  - `studentContact` is rendered into `mailto:` when it contains `@`, without strict email validation/encoding.
- Risk:
  - Malformed link behavior or header/query injection in mail client handlers.
- Recommendation:
  - Validate strict email format server-side and encode URI components when building mailto links.

---

## Additional improvement opportunities

- Add structured audit logs for sensitive admin actions:
  - user role changes/deletes, review approvals/rejections, OTP request/verify failures.
- Add abuse telemetry dashboards/alerts for OTP and review submission endpoints.
- Add security regression tests:
  - authorization matrix tests for visitor/whitelisted/admin
  - OTP rate limit and lockout tests
  - CSRF/origin policy tests
  - privacy tests for contact visibility.
- Consider removing legacy unused objects from schema to reduce maintenance risk (`auth_invites` is still created in migration: `migrations/001_initial_schema.sql:102`).

---

## Verification results

- Dependency audit (`npm audit --json --omit=dev`): no known vulnerabilities reported at scan time.
- Type check (`npx tsc --noEmit`): passed.
- Production build (`npm run build`): passed.

## Notes

- This review is static and code-focused; it does not replace runtime penetration testing, infrastructure review, or secrets management review outside the repository.
