DROP TABLE IF EXISTS auth_invites;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'invite_consumed_reason_enum'
  ) THEN
    DROP TYPE invite_consumed_reason_enum;
  END IF;
END $$;
