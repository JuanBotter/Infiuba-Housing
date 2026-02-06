import { dbQuery } from "@/lib/db";

export async function resetIntegrationDatabase() {
  await dbQuery(
    `
      TRUNCATE TABLE
        security_audit_events,
        auth_rate_limit_buckets,
        auth_email_otps,
        reviews,
        listing_contacts,
        listings,
        users,
        deleted_users,
        dataset_meta
      RESTART IDENTITY CASCADE
    `,
  );

  await dbQuery(
    `
      INSERT INTO dataset_meta (id, generated_at, source_file, total_listings, updated_at)
      VALUES (1, NOW(), NULL, 0, NOW())
      ON CONFLICT (id) DO NOTHING
    `,
  );
}

export async function seedUser(email: string, role: "whitelisted" | "admin") {
  await dbQuery(
    `
      INSERT INTO users (email, role, password_hash, is_active, created_at, updated_at)
      VALUES ($1, $2, 'otp-only', TRUE, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET role = EXCLUDED.role,
          is_active = TRUE,
          updated_at = NOW()
    `,
    [email.toLowerCase(), role],
  );
}
