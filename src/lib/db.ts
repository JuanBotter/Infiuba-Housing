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

  return new Pool({
    connectionString,
    ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
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
