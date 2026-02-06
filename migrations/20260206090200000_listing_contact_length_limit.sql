DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listing_contacts_contact_max_length_check'
  ) THEN
    ALTER TABLE listing_contacts
      ADD CONSTRAINT listing_contacts_contact_max_length_check
      CHECK (LENGTH(BTRIM(contact)) <= 180) NOT VALID;
  END IF;
END $$;
