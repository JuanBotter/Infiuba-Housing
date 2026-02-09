const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(
    path.join(__dirname, "20260208090000000_contact_edit_capacity.sql"),
    "utf8",
  );
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE listing_contact_edit_requests
      DROP CONSTRAINT IF EXISTS contact_edit_requests_current_capacity_positive;
    ALTER TABLE listing_contact_edit_requests
      DROP CONSTRAINT IF EXISTS contact_edit_requests_requested_capacity_positive;
    ALTER TABLE listing_contact_edit_requests
      DROP CONSTRAINT IF EXISTS contact_edit_requests_has_payload;
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
    ALTER TABLE listing_contact_edit_requests
      DROP COLUMN IF EXISTS requested_capacity;
    ALTER TABLE listing_contact_edit_requests
      DROP COLUMN IF EXISTS current_capacity;
  `);
};
