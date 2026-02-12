# Security Remediation Plan

Date: 2026-02-11  
Project: Infiuba Alojamientos Web  
Source: Full application security review (current codebase)

## Objectives

1. Remove exploitable vulnerabilities first (stored XSS and auth-abuse bypass risks).
2. Harden auth, media, and deployment controls without regressing UX.
3. Add automated regression coverage so fixes stay in place.
4. Roll out changes in small, reversible increments.

## Scope

This plan covers all findings currently open:

1. Stored XSS in Leaflet tooltip rendering.
2. OTP throttling bypass risk from untrusted forwarded headers.
3. OTP account-enumeration timing side channel.
4. Global OTP request-bucket app-wide DoS risk.
5. Arbitrary external HTTPS review image URLs.
6. Magic-link login CSRF/session-injection pattern.
7. CSP policy still allows unsafe inline script/style.
8. Migration path may not enforce the same DB SSL policy.
9. Emergency visitor contact override remains a production footgun.

## Status Update (2026-02-12)

Implementation progress in repository code as of 2026-02-12:

1. Item 1 (Stored XSS in Leaflet tooltip): `implemented in code`, pending rollout migration.
2. Item 2 (Forwarded-header trust bypass): `implemented in code`, pending env rollout per environment.
3. Item 3 (OTP timing side-channel): `partially implemented` (latency normalization + jitter shipped; async queue path still pending).
4. Item 4 (Global OTP bucket DoS): `partially implemented` (global hard-stop removed; global bucket now telemetry-only; adaptive challenge/backoff still pending).
5. Item 5 (External review image URLs): `partially implemented` (API host allowlist shipped; legacy DB cleanup/backfill still pending).
6. Item 6 (Magic-link session injection): `implemented in code` (state cookie binding shipped), pending production verification.
7. Item 7 (CSP `unsafe-inline`): `implemented in code` (nonce-based CSP in middleware, `unsafe-inline` removed from `script-src`/`style-src`, `script-src-attr 'none'` + `style-src-attr 'none'` enforced, and CSP reports ingested at `/api/security/csp-report`).
8. Item 8 (Migration SSL mismatch): `partially implemented` (shared SSL policy wired into migration preflight + migrate child env; script-level tests/CI assertion still pending).
9. Item 9 (Visitor contact override footgun): `partially implemented` (prod fail-safe, telemetry alert, admin banner, audit emission shipped; formal time-box process docs still pending).

## Detailed Next Steps (Execution Order)

### Step 1: Roll out configuration changes safely

1. Set trusted ingress fingerprinting vars in each environment:
   - `TRUSTED_IP_HEADER` (recommended explicit value per platform).
   - `TRUSTED_PROXY_HOPS` (usually `1`, unless ingress chain requires otherwise).
2. Validate visitor-contact override protection:
   - Keep `VISITOR_CAN_VIEW_OWNER_CONTACTS` unset/false by default.
   - In production, only set `VISITOR_CAN_VIEW_OWNER_CONTACTS_ALLOW_PRODUCTION=true` when emergency override is intentionally enabled.
3. Decide whether `REVIEW_IMAGE_ALLOWED_HOSTS` is needed:
   - If not needed, leave unset and rely on `*.public.blob.vercel-storage.com`.
   - If needed, explicitly provide a strict comma-separated host allowlist.

### Step 2: Apply DB migration and data cleanup

1. Run migration in staging:
   - `npm run db:migrate`
2. Validate migration effects:
   - Confirm `listings_address_no_html_tag_chars` and `listings_neighborhood_no_html_tag_chars` constraints exist.
   - Confirm rows with `<` or `>` in listing text were neutralized.
3. Run the same migration in production during a controlled window.

### Step 3: Verify production behavior (canary)

1. OTP path checks:
   - Request OTP for allowed and disallowed users and compare response shape/timing.
   - Verify per-IP/subnet throttling works while global traffic does not hard-lock all users.
2. Magic-link checks:
   - Confirm links work in the requesting browser.
   - Confirm link open in a different browser/session fails state binding.
3. Media checks:
   - Confirm disallowed image hosts are rejected at API boundary.
   - Confirm allowed Blob-hosted images render correctly.
4. Override checks:
   - If override enabled, confirm admin banner appears and security alert is emitted.

### Step 4: Complete remaining remediation gaps

1. Item 3 completion:
   - Move OTP delivery to async queue/fire-and-forget path.
   - Add timing distribution smoke test in CI (allowed vs not-allowed vs rate-limited).
2. Item 4 completion:
   - Add adaptive backoff/challenge path for abusive fingerprints.
   - Add threshold docs/runbook for OTP saturation conditions.
3. Item 5 completion:
   - Backfill/clean legacy non-allowlisted review image URLs in DB.
   - Add migration/script test coverage for cleanup behavior.
4. Item 7 rollout verification:
   - Keep nonce-based CSP (`style-src-attr 'none'`) enabled and monitor CSP violation reports during staged rollout.
   - Validate map/list/admin/review flows in production-like canary with CSP enforcement.
5. Item 8 completion:
   - Add explicit tests/CI check to prevent migration TLS downgrade regressions.
6. Item 9 completion:
   - Document formal time-boxed emergency override process in runbook.

### Step 5: Exit criteria verification

1. Mark each of the 9 findings as fixed or explicitly accepted with documented rationale.
2. Ensure regression tests exist for each fixed item.
3. Verify 7 consecutive days of production telemetry without severe auth abuse regressions.
4. Keep `AGENTS.md` and this plan synchronized after each security change.

## Delivery Phases

## Phase 0: Immediate Risk Reduction (same day)

1. Add temporary WAF/rate-limit guardrails at edge for `/api/session` request bursts.
2. Disable any nonessential public map tooltip exposure if emergency mitigation is required.
3. Confirm production ingress strips/spoofs no client IP headers before app.
4. Freeze release windows until Phase 1 critical fixes are merged and verified.

## Phase 1: Critical Fixes (P0, 1-3 days)

### Item 1: Stored XSS in map tooltip (High)

#### Implementation tasks

1. Replace string-based tooltip content with escaped text nodes or fully sanitized content.
2. Avoid passing raw concatenated user strings into Leaflet HTML sinks.
3. Add server-side allowlist validation for listing `address` and `neighborhood` characters.
4. Add DB cleanup migration/script for existing records containing dangerous HTML payloads.
5. Re-run map rendering checks for all locales and listing creation/edit flows.

#### Test tasks

1. Add unit test proving tooltip content escapes `<script>` and event-handler payloads.
2. Add integration test for malicious listing submission and map render non-execution.
3. Add regression test for admin publication edit path with HTML payload input.

#### Acceptance criteria

1. No untrusted HTML is injected into Leaflet tooltip/popups.
2. Malicious payloads render as inert text.
3. Existing polluted rows are neutralized in production DB.

### Item 2: OTP abuse bypass via forwarded-header trust (High)

#### Implementation tasks

1. Introduce trusted-proxy-aware IP extraction policy.
2. Use platform-trusted IP source (for example, strict single canonical header path).
3. Ignore/strip untrusted `x-forwarded-for` data beyond configured trusted hops.
4. Document deployment-specific header trust model in technical docs.
5. Add startup validation/warning when trusted-proxy config is missing.

#### Test tasks

1. Add unit tests for spoofed `x-forwarded-for` chains and malformed forwarding headers.
2. Add integration tests confirming stable fingerprint under trusted ingress behavior.
3. Add telemetry assertion test for consistent hashed network key behavior.

#### Acceptance criteria

1. IP/subnet fingerprint cannot be attacker-selected in normal deployment paths.
2. OTP throttling behavior is stable and enforceable across ingress environments.

### Item 3: OTP timing side-channel enumeration (Medium, P0 because auth)

#### Implementation tasks

1. Move OTP email send to async background queue or fire-and-forget worker path.
2. Return uniform response as soon as request is accepted for processing.
3. Add bounded jitter/latency normalization for disallowed vs allowed paths.
4. Preserve server-side audit detail while keeping client timing indistinguishable.

#### Test tasks

1. Add API tests for uniform payload/status across allowed/disallowed outcomes.
2. Add performance smoke test comparing response-time distributions per outcome.

#### Acceptance criteria

1. No observable timing gap sufficient for practical account discovery.
2. OTP request API behavior is constant-shape and near-constant-time.

## Phase 2: Auth and Abuse Model Hardening (P1, 3-7 days)

### Item 4: Global OTP bucket app-wide DoS risk (Medium)

#### Implementation tasks

1. Redesign global limiter so unauthenticated floods cannot lock out all users.
2. Split protections into:
   - per-IP and subnet hard limits,
   - soft global anomaly alerts,
   - optional challenge/captcha before strict blocking.
3. Add adaptive backoff for abusive fingerprints instead of system-wide hard-stop.
4. Add operational alert thresholds for pre-saturation conditions.

#### Test tasks

1. Add integration tests for high-volume unauth requests without global lockout.
2. Add load test scenario validating legitimate OTP traffic continuity.

#### Acceptance criteria

1. Abuse cannot fully disable OTP login for all legitimate users.
2. Security telemetry captures spikes without forcing global outage.

### Item 6: Magic-link login CSRF/session injection (Medium)

#### Implementation tasks

1. Add anti-CSRF/state binding for magic-link completion:
   - pre-issued nonce cookie + token claim verification, or
   - intermediate confirmation page + POST finalize.
2. Optionally bind magic-link use to same browser that requested OTP (if product allows).
3. Enforce one-time token use (already present through OTP consume) and add explicit replay checks in tests.
4. Review session-cookie policy and tighten for auth callback flow where feasible.

#### Test tasks

1. Add tests for unsolicited callback opening a session without local auth intent.
2. Add replay and cross-browser negative tests.
3. Add UX tests for successful legitimate magic-link login.

#### Acceptance criteria

1. Attacker cannot force another browser into attacker-controlled session.
2. Magic-link remains functional for valid user flow.

## Phase 3: Data and Content Integrity Hardening (P1/P2, 4-8 days)

### Item 5: Arbitrary external review image URLs (Medium)

#### Implementation tasks

1. Restrict accepted review image URLs to trusted upload origin(s) only.
2. Replace raw URL persistence with canonical media IDs where possible.
3. Reject non-uploaded hosts at API boundary.
4. Backfill/clean existing DB image URLs not matching allowlist.
5. Update UI messaging for rejected external links.

#### Test tasks

1. Add API tests for host allowlist enforcement.
2. Add migration test validating cleanup of legacy disallowed URLs.
3. Add UI regression tests for gallery rendering with allowed host only.

#### Acceptance criteria

1. Only trusted-host media can be stored and rendered.
2. Third-party tracking images are blocked.

## Phase 4: Platform and Defense-in-Depth (P2, 2-5 days)

### Item 7: CSP contains `unsafe-inline` (Low)

Current state (2026-02-12):

1. Nonce-based CSP is active in `middleware.ts`.
2. `script-src-attr 'none'` and `style-src-attr 'none'` are enforced.
3. Remaining work is rollout validation/monitoring (not code changes).

#### Implementation tasks

1. Introduce nonce-based CSP for scripts and styles.
2. Remove `unsafe-inline` from `script-src` and `style-src`.
3. Keep required third-party directives minimal and explicit.
4. Add CSP report endpoint and monitor violations during staged rollout.

#### Test tasks

1. Validate app boot, theme init, map UI, and admin pages under strict CSP.
2. Add E2E smoke with CSP enabled.

#### Acceptance criteria

1. App runs without inline exemptions.
2. CSP reports show no major functional breakage.

### Item 8: Migration DB SSL policy mismatch (Low)

#### Implementation tasks

1. Apply shared SSL resolver to migration pre-step client.
2. Ensure all scripts (`db-migrate`, `db-seed`, `user-upsert`) use one SSL policy module.
3. Add explicit docs for production-required SSL settings.

#### Test tasks

1. Add script-level tests for PGSSL/CA/insecure flag behavior.
2. Add CI check ensuring migration path does not silently downgrade TLS.

#### Acceptance criteria

1. Runtime and migration DB clients enforce consistent TLS policy.

### Item 9: Emergency contact override footgun (Low)

#### Implementation tasks

1. Add startup warning/fail-safe for production when override is enabled.
2. Require explicit time-boxed change management process for this flag.
3. Emit audit event and telemetry alert whenever override is active.
4. Add admin-visible banner indicating override status.

#### Test tasks

1. Add config tests for production startup behavior with override enabled.
2. Add telemetry test verifying alert emission.

#### Acceptance criteria

1. Accidental override enablement becomes highly visible and controlled.

## Cross-Cutting Work

## Documentation

1. Update `AGENTS.md` after each behavior/security architecture change.
2. Update `TECHNICAL_README.md` sections for auth, headers, media policy, and ingress trust.
3. Add `docs/` runbook for incident response on OTP abuse and contact override.

## Observability

1. Add metrics dashboard panels for:
   - OTP request volume by outcome,
   - OTP verification failures by fingerprint bucket,
   - global limiter saturation risk,
   - magic-link invalid/replay attempts.
2. Add alert routing and on-call thresholds.

## QA and Release

1. Add security regression test suite gate in CI.
2. Stage rollout in canary environment before full production.
3. Prepare rollback instructions per item.

## Suggested Sprint Breakdown

## Sprint A (Critical)

1. Item 1 (XSS) complete.
2. Item 2 (header trust) complete.
3. Item 3 (timing side-channel) complete.
4. Phase 0 mitigations removed only after verification.

## Sprint B (Auth hardening)

1. Item 4 (global limiter redesign) complete.
2. Item 6 (magic-link CSRF/session-injection) complete.
3. Observability additions for auth abuse live.

## Sprint C (Content + platform hardening)

1. Item 5 (image host allowlist) complete.
2. Item 7 (strict CSP) complete.
3. Item 8 (migration TLS consistency) complete.
4. Item 9 (override safeguards) complete.

## Exit Criteria

1. All nine findings are marked fixed or explicitly accepted with documented rationale.
2. Regression tests exist for each fixed issue.
3. Production telemetry confirms no severe auth abuse regressions for 7 consecutive days.
4. Documentation reflects final behavior and configuration.
