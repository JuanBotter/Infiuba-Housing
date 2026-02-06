const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "005_drop_legacy_invites.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {};
