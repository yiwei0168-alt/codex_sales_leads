import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getRagConfig } from "./config";
import {
  databaseConnectionString,
  databaseSslConfiguration,
  isRemoteDatabase,
} from "./database-ssl";

declare global {
  var __networkCopilotPool: Pool | undefined;
  var __networkCopilotDatabaseSecurity: Promise<void> | undefined;
}

export type AppDatabaseRole = "admin" | "member";

function applicationRole(): string {
  const role = process.env.DATABASE_APPLICATION_ROLE?.trim() || "network_copilot_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(role)) throw new Error("DATABASE_APPLICATION_ROLE 格式无效");
  return role;
}

async function setApplicationRole(client: PoolClient): Promise<void> {
  await client.query(`set local role "${applicationRole()}"`);
}

export function getPool(): Pool {
  const { databaseUrl } = getRagConfig();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.__networkCopilotPool) {
    globalThis.__networkCopilotPool = new Pool({
      connectionString: databaseConnectionString(databaseUrl),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: databaseSslConfiguration(databaseUrl),
    });
  }
  return globalThis.__networkCopilotPool;
}

async function ensureDatabaseSecurity(): Promise<void> {
  if (!globalThis.__networkCopilotDatabaseSecurity) {
    globalThis.__networkCopilotDatabaseSecurity = (async () => {
      const client = await getPool().connect();
      let state: { ssl: boolean; rolsuper: boolean; rolbypassrls: boolean; session_super: boolean; session_bypassrls: boolean } | undefined;
      try {
        await client.query("begin");
        const result = await client.query<typeof state & QueryResultRow>(
          `select coalesce(s.ssl, false) as ssl, r.rolsuper, r.rolbypassrls,
                  sr.rolsuper as session_super, sr.rolbypassrls as session_bypassrls
           from pg_roles r
           join pg_roles sr on sr.rolname = session_user
           left join pg_stat_ssl s on s.pid = pg_backend_pid()
           where r.rolname = $1`,
          [applicationRole()],
        );
        state = result.rows[0];
        // Verify role membership after inspecting pg_stat_ssl. The restricted
        // application role cannot see the session's pg_stat_ssl row on RDS.
        await setApplicationRole(client);
        await client.query("rollback");
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      if (!state) throw new Error("无法验证数据库连接安全属性");
      const { databaseUrl } = getRagConfig();
      const unsafeRemote = Boolean(databaseUrl && isRemoteDatabase(databaseUrl) && !state.ssl);
      const unsafeRole = state.rolsuper || state.rolbypassrls;
      const unsafeSessionRole = state.session_super || state.session_bypassrls;
      if (process.env.NODE_ENV === "production" && unsafeRemote) {
        throw new Error("生产环境拒绝使用未加密的远程 PostgreSQL 连接");
      }
      if (process.env.NODE_ENV === "production" && unsafeRole) {
        throw new Error("生产应用数据库账号不得拥有 SUPERUSER 或 BYPASSRLS 权限");
      }
      if (process.env.NODE_ENV === "production" && unsafeSessionRole) {
        throw new Error("生产连接的原始数据库账号不得拥有 SUPERUSER 或 BYPASSRLS 权限");
      }
      if (process.env.NODE_ENV !== "production" && (unsafeRemote || unsafeRole || unsafeSessionRole)) {
        console.warn("[security] 开发数据库连接未满足生产要求：请启用 TLS 并改用不含 BYPASSRLS 的应用角色。");
      }
    })().catch((error) => {
      globalThis.__networkCopilotDatabaseSecurity = undefined;
      throw error;
    });
  }
  return globalThis.__networkCopilotDatabaseSecurity;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  return transaction(async (client) => (await client.query<T>(text, values)).rows);
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureDatabaseSecurity();
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await setApplicationRole(client);
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

export async function tenantTransaction<T>(
  userId: string,
  run: (client: PoolClient) => Promise<T>,
  role: AppDatabaseRole = "member",
): Promise<T> {
  return transaction(async (client) => {
    await client.query("select set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)", [userId, role]);
    return run(client);
  });
}

export async function tenantQuery<T extends QueryResultRow>(
  userId: string,
  text: string,
  values: unknown[] = [],
  role: AppDatabaseRole = "member",
): Promise<T[]> {
  return tenantTransaction(userId, async (client) => (await client.query<T>(text, values)).rows, role);
}
