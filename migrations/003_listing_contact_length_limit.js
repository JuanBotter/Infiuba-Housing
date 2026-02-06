const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "003_listing_contact_length_limit.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE listing_contacts
      DROP CONSTRAINT IF EXISTS listing_contacts_contact_max_length_check;
  `);
};
