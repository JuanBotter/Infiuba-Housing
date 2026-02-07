DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'contact_edit_status_enum'
  ) THEN
    CREATE TYPE contact_edit_status_enum AS ENUM ('pending', 'approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS listing_contact_edit_requests (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  requester_email TEXT NOT NULL,
  requested_contacts TEXT[] NOT NULL,
  current_contacts TEXT[] NOT NULL,
  status contact_edit_status_enum NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_email TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_requester_email_not_blank'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      ADD CONSTRAINT contact_edit_requests_requester_email_not_blank
      CHECK (LENGTH(BTRIM(requester_email)) > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contact_edit_requests_requested_contacts_not_empty'
  ) THEN
    ALTER TABLE listing_contact_edit_requests
      ADD CONSTRAINT contact_edit_requests_requested_contacts_not_empty
      CHECK (array_length(requested_contacts, 1) > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contact_edit_requests_status_created
  ON listing_contact_edit_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_edit_requests_listing_id
  ON listing_contact_edit_requests(listing_id);

CREATE INDEX IF NOT EXISTS idx_contact_edit_requests_requester_email
  ON listing_contact_edit_requests(LOWER(requester_email));

CREATE INDEX IF NOT EXISTS idx_contact_edit_requests_reviewed_at
  ON listing_contact_edit_requests(reviewed_at DESC);
