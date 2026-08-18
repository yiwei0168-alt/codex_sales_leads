import { readFileSync } from "node:fs";

function isRemoteDatabase(databaseUrl: string): boolean {
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  return !["localhost", "127.0.0.1", "::1"].includes(hostname);
}

function databaseCa(): string | undefined {
  const inline = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n").trim();
  if (inline) return inline;

  const file = process.env.DATABASE_SSL_CA_FILE?.trim();
  if (!file) return undefined;
  const ca = readFileSync(file, "utf8").trim();
  if (!ca) throw new Error("DATABASE_SSL_CA_FILE points to an empty file");
  return ca;
}

export function databaseSslConfiguration(
  databaseUrl: string,
): false | { rejectUnauthorized: true; ca?: string } {
  const url = new URL(databaseUrl);
  const requested = ["require", "verify-ca", "verify-full"].includes(
    url.searchParams.get("sslmode") ?? "",
  );
  if (!requested) {
    if (process.env.NODE_ENV === "production" && isRemoteDatabase(databaseUrl)) {
      throw new Error("生产环境的远程 DATABASE_URL 必须配置 sslmode=require 或更严格模式");
    }
    return false;
  }

  const ca = databaseCa();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

export function databaseConnectionString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  // node-postgres lets SSL query parameters replace the explicit `ssl` object,
  // which would silently discard the CA loaded from DATABASE_SSL_CA_FILE.
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(parameter);
  }
  return url.toString();
}

export { isRemoteDatabase };
