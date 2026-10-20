import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {AsyncLocalStorage} from 'node:async_hooks';
import {assertDatabaseDeadline,awaitDatabaseDeadline,databaseDeadlineError,type DatabaseDeadline} from './database-deadline';
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
const boundTenantTransaction=new AsyncLocalStorage<{client:PoolClient;userId:string;role:AppDatabaseRole;active:boolean}>();

/** Trusted internal composition only. Reuse an already-open tenant transaction;
 * validate account/role and transaction identity before and after the callback. */
export async function withBoundTenantTransaction<T>(client:PoolClient,userId:string,run:()=>Promise<T>):Promise<T>{
 const prior=boundTenantTransaction.getStore();
 if(prior&&(!prior.active||prior.client!==client||prior.userId!==userId))throw new Error('Bound tenant transaction scope changed');
 const state=async()=>(await client.query<{user_id:string;role:string;database_role:string;transaction_id:string}>(
  "select current_setting('app.current_user_id',true) as user_id,current_setting('app.current_user_role',true) as role,current_user as database_role,pg_current_xact_id()::text as transaction_id")).rows[0];
 const before=await state();
 if(!before||!userId||before.user_id!==userId||!['admin','member'].includes(before.role)||before.database_role!==applicationRole())
  throw new Error('Bound tenant transaction account or role invalid');
 if(prior&&prior.role!==before.role)throw new Error('Bound tenant transaction scope changed');
 const check=async()=>{const after=await state();if(!after||after.transaction_id!==before.transaction_id||after.user_id!==before.user_id
  ||after.role!==before.role||after.database_role!==before.database_role)throw new Error('Bound tenant transaction identity changed');};
 // An autocommit client gets a new transaction ID and is rejected before work.
 await check();
 const scope={client,userId,role:before.role as AppDatabaseRole,active:true};
 try{const value=await boundTenantTransaction.run(scope,run);await check();return value;}
 finally{scope.active=false;}
}

function applicationRole(): string {
  const role = process.env.DATABASE_APPLICATION_ROLE?.trim() || "network_copilot_app";
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(role)) throw new Error("DATABASE_APPLICATION_ROLE 格式无效");
  return role;
}

async function setApplicationRole(client: PoolClient): Promise<void> {
  await client.query(`set local role "${applicationRole()}"`);
}

/** Own checked-out connection errors until release. Never retry the callback:
 * a disconnected COMMIT can have an unknown result. */
function trackClientErrors(client: PoolClient,deadline?:DatabaseDeadline) {
  const pool = globalThis.__networkCopilotPool;
  let failure: Error | undefined;
  let released=false,active=true;
  const onError = (error: Error) => { failure ??= error; };
  client.on("error", onError);
  const release=(broken:boolean)=>{
    if(released)return;released=true;
    if(broken&&globalThis.__networkCopilotPool===pool)globalThis.__networkCopilotDatabaseSecurity=undefined;
    client.release(broken);
  };
  const abort=()=>{failure??=databaseDeadlineError();release(true);};
  deadline?.signal.addEventListener('abort',abort,{once:true});
  if(deadline?.signal.aborted)abort();
  const guarded=deadline?new Proxy(client,{get(target,key){
    if(key==='query')return (...args:unknown[])=>{
      if(!active||failure)return Promise.reject(failure??databaseDeadlineError());
      try{assertDatabaseDeadline(deadline);}catch(error){return Promise.reject(error);}
      return awaitDatabaseDeadline(Reflect.apply(target.query,target,args),deadline);
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }}):client;
  return {
    client:guarded,
    get failure() { return failure; },
    release(discard = false) {
      active=false;deadline?.signal.removeEventListener('abort',abort);
      const broken = discard || Boolean(failure);
      client.removeListener("error", onError);
      release(broken);
    },
  };
}

export function getPool(): Pool {
  const { databaseUrl } = getRagConfig();
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
  if (!globalThis.__networkCopilotPool) {
    const pool = new Pool({
      connectionString: databaseConnectionString(databaseUrl),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: databaseSslConfiguration(databaseUrl),
    });
    pool.on("error", (error: Error & { code?: string }) => {
      // pg-pool has already removed this idle client. The next caller reconnects
      // and checks role/TLS policy again; log no client, SQL, URL or message text.
      if (globalThis.__networkCopilotPool === pool) globalThis.__networkCopilotDatabaseSecurity = undefined;
      const code = typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "unknown";
      console.warn("[database] Idle PostgreSQL connection closed", { code });
    });
    globalThis.__networkCopilotPool = pool;
  }
  return globalThis.__networkCopilotPool;
}

async function acquireClient(deadline?:DatabaseDeadline):Promise<PoolClient>{
 assertDatabaseDeadline(deadline);
 return awaitDatabaseDeadline(getPool().connect(),deadline,client=>client.release(true));
}
async function setDatabaseDeadline(client:PoolClient,deadline?:DatabaseDeadline){
 if(!deadline)return;
 assertDatabaseDeadline(deadline);const value=`${Math.max(1,deadline.remainingMs())}ms`;
 await client.query("select set_config('statement_timeout',$1,true),set_config('idle_in_transaction_session_timeout',$1,true)",[value]);
}
async function ensureDatabaseSecurity(deadline?:DatabaseDeadline): Promise<void> {
  if (!globalThis.__networkCopilotDatabaseSecurity) {
    globalThis.__networkCopilotDatabaseSecurity = (async () => {
      const acquired = await acquireClient(deadline);
      const tracked = trackClientErrors(acquired,deadline),client=tracked.client;
      let discard = false;
      let state: { ssl: boolean; rolsuper: boolean; rolbypassrls: boolean; session_super: boolean; session_bypassrls: boolean } | undefined;
      try {
        await client.query("begin");
        await setDatabaseDeadline(client,deadline);
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
        if (tracked.failure) throw tracked.failure;
      } catch (error) {
        await client.query("rollback").catch(() => { discard = true; });
        throw error;
      } finally {
        tracked.release(discard);
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
  return awaitDatabaseDeadline(globalThis.__networkCopilotDatabaseSecurity,deadline);
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  return transaction(async (client) => (await client.query<T>(text, values)).rows);
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>,deadline?:DatabaseDeadline): Promise<T> {
  if(boundTenantTransaction.getStore())throw new Error('Unscoped transaction inside a bound tenant operation');
  await ensureDatabaseSecurity(deadline);
  const acquired = await acquireClient(deadline);
  const tracked = trackClientErrors(acquired,deadline),client=tracked.client;
  let discard = false;
  try {
    await client.query("begin");
    await setDatabaseDeadline(client,deadline);
    await setApplicationRole(client);
    const result = await awaitDatabaseDeadline(run(client),deadline);
    if (tracked.failure) throw tracked.failure;
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => { discard = true; });
    throw error;
  } finally {
    tracked.release(discard);
  }
}

export async function tenantTransaction<T>(
  userId: string,
  run: (client: PoolClient) => Promise<T>,
  role?: AppDatabaseRole,
  deadline?:DatabaseDeadline,
): Promise<T> {
  const bound=boundTenantTransaction.getStore();
  if(bound){
    if(deadline)throw new Error('Cannot replace a bound transaction deadline');
    if(!bound.active)throw new Error('Bound tenant transaction scope ended');
    if(bound.userId!==userId||role!==undefined&&role!==bound.role)throw new Error('Bound tenant transaction account or role changed');
    return run(bound.client);
  }
  return transaction(async (client) => {
    await client.query("select set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)", [userId, role??'member']);
    return run(client);
  },deadline);
}

export async function tenantQuery<T extends QueryResultRow>(
  userId: string,
  text: string,
  values: unknown[] = [],
  role?: AppDatabaseRole,
  deadline?:DatabaseDeadline,
): Promise<T[]> {
  return tenantTransaction(userId, async (client) => (await client.query<T>(text, values)).rows, role,deadline);
}
