import { readFileSync } from "node:fs";
import {checkServerIdentity,type PeerCertificate} from 'node:tls';
import {X509Certificate} from 'node:crypto';
import {isIP} from 'node:net';

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
): false | { rejectUnauthorized: true; ca?: string; checkServerIdentity:typeof checkServerIdentity } {
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
  // pg supplies SNI only for DNS hosts. Pin the reference identity explicitly
  // so an IP connection cannot inherit tls.connect's localhost fallback.
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const ssl={rejectUnauthorized:true as const,
    checkServerIdentity:(_hostname:string,certificate:PeerCertificate)=>{
      if(!isIP(hostname))return checkServerIdentity(hostname,certificate);
      // Use the actual DER SANs for IPs; this also avoids Node versions whose
      // DNS normalization loses an unbracketed IPv6 reference before checking.
      try{if(new X509Certificate(certificate.raw).checkIP(hostname))return;}catch{/* Return a TLS identity error below. */}
      return Object.assign(new Error('Database certificate does not match the configured IP address'),{code:'ERR_TLS_CERT_ALTNAME_INVALID'});
    }};
  return ca ? {...ssl,ca} : ssl;
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
