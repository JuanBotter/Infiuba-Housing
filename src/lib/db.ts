import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __infiubaPool: Pool | undefined;
}

function buildPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const ssl = resolvePgSslConfig();

  return new Pool({
    connectionString,
    ssl,
  });
}

function parseBooleanEnvFlag(raw: string | undefined) {
  if (!raw) {
    return false;
  }

  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeCaCert(raw: string | undefined) {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\\n/g, "\n");
}

function resolvePgSslConfig() {
  if (!parseBooleanEnvFlag(process.env.PGSSL)) {
    return undefined;
  }

  const allowInsecure = parseBooleanEnvFlag(process.env.PGSSL_ALLOW_INSECURE);
  if (allowInsecure) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PGSSL_ALLOW_INSECURE cannot be enabled in production.");
    }

    console.warn(
      "[DB] PGSSL_ALLOW_INSECURE=true disables TLS certificate verification. Use only for local development.",
    );
    return { rejectUnauthorized: false };
  }

  const ca = normalizeCaCert(process.env.PGSSL_CA_CERT);
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

export function isDatabaseEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!global.__infiubaPool) {
    global.__infiubaPool = buildPool();
  }
  return global.__infiubaPool;
}

export async function dbQuery<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
