import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Client } from "pg";
import { resolvePgSslConfig } from "./pg-ssl.mjs";

const MIGRATION_RENAMES = new Map([
  ["001_initial_schema", "20260206090000000_initial_schema"],
  ["002_otp_rate_limit_buckets", "20260206090100000_otp_rate_limit_buckets"],
  ["003_listing_contact_length_limit", "20260206090200000_listing_contact_length_limit"],
  ["004_dataset_meta_bootstrap", "20260206090300000_dataset_meta_bootstrap"],
  ["005_drop_legacy_invites", "20260206090400000_drop_legacy_invites"],
  ["006_security_audit_events", "20260206090500000_security_audit_events"],
]);

async function renameMigrationHistory() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const client = new Client({ connectionString, ssl: resolvePgSslConfig() });
  await client.connect();

  try {
    const tableCheck = await client.query(
      `SELECT to_regclass('public.pgmigrations') AS table_name`,
    );
    if (!tableCheck.rows[0]?.table_name) {
      return;
    }

    for (const [legacyName, newName] of MIGRATION_RENAMES.entries()) {
      await client.query(
        `
          UPDATE pgmigrations
          SET name = $2
          WHERE name = $1
            AND NOT EXISTS (
              SELECT 1 FROM pgmigrations WHERE name = $2
            )
        `,
        [legacyName, newName],
      );
    }
  } finally {
    await client.end();
  }
}

async function buildMigrationChildEnv() {
  const childEnv = { ...process.env };
  const sslConfig = resolvePgSslConfig();

  if (!sslConfig) {
    childEnv.PGSSLMODE = "disable";
    delete childEnv.PGSSLROOTCERT;
    return { childEnv, cleanup: async () => {} };
  }

  if (sslConfig.rejectUnauthorized === false) {
    childEnv.PGSSLMODE = "no-verify";
    delete childEnv.PGSSLROOTCERT;
    return { childEnv, cleanup: async () => {} };
  }

  childEnv.PGSSLMODE = "verify-full";
  if (typeof sslConfig.ca === "string" && sslConfig.ca.trim()) {
    const certDirectory = await mkdtemp(path.join(os.tmpdir(), "infiuba-pgssl-"));
    const certPath = path.join(certDirectory, "ca.pem");
    await writeFile(certPath, sslConfig.ca, "utf8");
    childEnv.PGSSLROOTCERT = certPath;
    return {
      childEnv,
      cleanup: async () => {
        await rm(certDirectory, { recursive: true, force: true });
      },
    };
  }

  delete childEnv.PGSSLROOTCERT;
  return { childEnv, cleanup: async () => {} };
}

async function runMigrations() {
  const action = process.argv[2] ?? "up";
  if (!["up", "down"].includes(action)) {
    throw new Error(`Unsupported migration action: ${action}`);
  }

  await renameMigrationHistory();

  const binPath = path.resolve(
    "node_modules",
    "node-pg-migrate",
    "bin",
    "node-pg-migrate.js",
  );
  const args = [
    binPath,
    action,
    "-m",
    "migrations/*.js",
    "--use-glob",
    "--check-order",
    "false",
    "--verbose",
    "false",
    "-d",
    "DATABASE_URL",
  ];

  const { childEnv, cleanup } = await buildMigrationChildEnv();
  try {
    const child = spawn(process.execPath, args, {
      stdio: "inherit",
      env: childEnv,
    });

    await new Promise((resolve, reject) => {
      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`db:migrate failed with exit code ${code ?? "unknown"}`));
      });
      child.on("error", reject);
    });
  } finally {
    await cleanup();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});
