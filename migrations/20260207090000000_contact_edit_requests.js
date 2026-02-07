const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(
    path.join(__dirname, "20260207090000000_contact_edit_requests.sql"),
    "utf8",
  );
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_contact_edit_requests_reviewed_at;
    DROP INDEX IF EXISTS idx_contact_edit_requests_requester_email;
    DROP INDEX IF EXISTS idx_contact_edit_requests_listing_id;
    DROP INDEX IF EXISTS idx_contact_edit_requests_status_created;
    DROP TABLE IF EXISTS listing_contact_edit_requests;
    DROP TYPE IF EXISTS contact_edit_status_enum;
  `);
};
