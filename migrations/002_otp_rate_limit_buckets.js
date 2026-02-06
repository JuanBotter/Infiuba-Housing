const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "002_otp_rate_limit_buckets.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_auth_rate_limit_buckets_scope_key;
    DROP INDEX IF EXISTS idx_auth_rate_limit_buckets_updated_at;
    DROP TABLE IF EXISTS auth_rate_limit_buckets;
  `);
};
