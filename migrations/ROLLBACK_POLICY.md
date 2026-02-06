# Migration Rollback Policy

This project uses a mixed rollback strategy:

- Baseline schema migrations that include data normalization/backfills are considered irreversible.
- Incremental hardening migrations should include reversible `down` handlers when rollback is safe.
- Destructive migrations should define explicit recovery behavior in `down` (for example, recreating legacy artifacts).

## Current migration rollback behavior

1. `001_initial_schema`: irreversible baseline.
   - `down` throws with an explicit error.
   - Recovery strategy is restore-from-backup.
2. `002_otp_rate_limit_buckets`: reversible.
   - `down` drops table and related indexes.
3. `003_listing_contact_length_limit`: reversible.
   - `down` removes `listing_contacts_contact_max_length_check`.
4. `004_dataset_meta_bootstrap`: conditionally reversible.
   - `down` removes the bootstrap row only when it still looks like the migration-introduced default.
5. `005_drop_legacy_invites`: reversible.
   - `down` recreates legacy invite enum/table/indexes.

## Operational guidance

- Always take a database backup before running destructive migrations in production.
- Treat `down` in production as an emergency action; prefer forward fixes and new migrations.
- For baseline rollback needs, restore backup and re-run forward migrations to the desired state.
