import { Pool } from "pg";
import "./load-env.mjs";

const OTP_ONLY_PASSWORD_HASH = "otp-only";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }
  return args;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isAllowedRole(value) {
  return value === "whitelisted" || value === "admin";
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/user-upsert.mjs --email student@example.com --role whitelisted");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to manage users.");
}

const args = parseArgs(process.argv.slice(2));
const email = normalizeEmail(String(args.email || ""));
const role = String(args.role || "").trim().toLowerCase();
if (!isLikelyEmail(email) || !isAllowedRole(role)) {
  printUsage();
  throw new Error("Invalid arguments.");
}

const passwordHash = OTP_ONLY_PASSWORD_HASH;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  await pool.query(
    `
      INSERT INTO users (email, role, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET role = EXCLUDED.role,
          password_hash = EXCLUDED.password_hash,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
    `,
    [email, role, passwordHash, true],
  );

  console.log(`User upserted: ${email} (${role}, active=true)`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
