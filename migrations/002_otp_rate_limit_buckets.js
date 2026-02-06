const { readFileSync } = require("node:fs");
const path = require("node:path");

exports.up = (pgm) => {
  const sql = readFileSync(path.join(__dirname, "002_otp_rate_limit_buckets.sql"), "utf8");
  pgm.sql(sql);
};

exports.down = () => {};
