import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getRagConfig } from "./config";

declare global {
  var __networkCopilotPool: Pool | undefined;
}

export function getPool(): Pool {
  const { databaseUrl } = getRagConfig();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.__networkCopilotPool) {
    globalThis.__networkCopilotPool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return globalThis.__networkCopilotPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
