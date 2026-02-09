ALTER TABLE listing_contact_edit_requests
  ADD COLUMN IF NOT EXISTS current_capacity NUMERIC,
  ADD COLUMN IF NOT EXISTS requested_capacity NUMERIC;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_requested_contacts_not_empty'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      DROP CONSTRAINT contact_edit_requests_requested_contacts_not_empty;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_has_payload'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      ADD CONSTRAINT contact_edit_requests_has_payload
      CHECK (
        array_length(requested_contacts, 1) > 0
        OR requested_capacity IS NOT NULL
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_requested_capacity_positive'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      ADD CONSTRAINT contact_edit_requests_requested_capacity_positive
      CHECK (requested_capacity IS NULL OR requested_capacity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_current_capacity_positive'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      ADD CONSTRAINT contact_edit_requests_current_capacity_positive
      CHECK (current_capacity IS NULL OR current_capacity > 0);
  END IF;
END $$;
