/** Runs inside the disposable Linux namespace. This is a fixture connection
 * probe, not a provider/process qualification or a production configuration. */
export async function verifyLoopbackDatabaseTls(Client, databaseUrl) {
 const target=new URL(databaseUrl);
 if(target.hostname!=='localhost'||target.searchParams.get('sslmode')!=='verify-full'
  ||target.searchParams.get('sslrootcert')!=='/database-ca.pem')throw new Error('Verified loopback TLS configuration required');
 const encrypted=new Client({connectionString:target.toString(),connectionTimeoutMillis:3000});
 try {
  await encrypted.connect();
  const row=(await encrypted.query('select ssl from pg_stat_ssl where pid=pg_backend_pid()')).rows[0];
  if(row?.ssl!==true)throw new Error('Disposable database connection is not encrypted');
 } finally {await encrypted.end().catch(()=>undefined);}
 const plain=new URL(target),missingCa=new URL(target),wrongHost=new URL(target);
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])plain.searchParams.delete(key);
 missingCa.searchParams.delete('sslrootcert');wrongHost.hostname='127.0.0.1';
 for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])wrongHost.searchParams.delete(key);
 const {readFile}=await import('node:fs/promises'),ca=await readFile('/database-ca.pem','utf8');
 // Reference DNS mismatch is explicit: pg deliberately omits automatic SNI for
 // IPs. The product adapter's separate probe verifies its pinned IP identity.
 const denied=[['plaintext',{connectionString:plain.toString()},['28000']],
  ['missing-ca',{connectionString:missingCa.toString()},['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN']],
  ['wrong-hostname',{connectionString:wrongHost.toString(),ssl:{rejectUnauthorized:true,ca,servername:'ma24-wrong-host.invalid'}},['ERR_TLS_CERT_ALTNAME_INVALID']]];
 for(const [name,config,codes] of denied){
  const client=new Client({...config,connectionTimeoutMillis:3000});
  let failure;
  try {await client.connect();}catch(error){failure=error;}
  finally {await client.end().catch(()=>undefined);}
  if(!failure||!codes.includes(failure.code))throw new Error(`Disposable database TLS rejection missing: ${name}`);
 }
 return {encryptedConnectionVerified:true,plaintextRejected:true,missingCaRejected:true,wrongHostnameRejected:true};
}
