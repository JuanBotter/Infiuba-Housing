const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "003_listing_contact_length_limit.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {};
