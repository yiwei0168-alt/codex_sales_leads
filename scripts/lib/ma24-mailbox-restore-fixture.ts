import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {decryptMailboxContent,decryptMailboxCredential,encryptMailboxContent,encryptMailboxCredential} from '../../src/lib/mailbox/crypto';

// Only called by the disposable fresh-cluster driver; no provider or worker is started.
export async function prepareMailboxRestoreFixture(sourceUrl:string,ownerEmail:string,peerEmail:string){
  const key=randomBytes(32).toString('base64url');
  const withKey=<T>(work:()=>T):T=>{
    const previous=process.env.MAILBOX_CREDENTIAL_KEY;
    process.env.MAILBOX_CREDENTIAL_KEY=key;
    try{return work();}finally{
      if(previous===undefined)delete process.env.MAILBOX_CREDENTIAL_KEY;
      else process.env.MAILBOX_CREDENTIAL_KEY=previous;
    }
  };
  const content={subject:'Synthetic restore subject',bodyText:'仅用于隔离恢复验收。',sender:[],recipients:[]};
  const credential='synthetic-unusable-no-provider-credential';
  const connectionId=randomUUID(),jobId=randomUUID(),runId=randomUUID(),messageId=randomUUID(),lease=randomUUID();
  const source=new Client({connectionString:sourceUrl});await source.connect();
  let owner:string,peer:string;
  const tables=['mailbox_connection','mailbox_work_job','mailbox_sync_run','mailbox_message','mailbox_sync_cursor'] as const;
  const readRows=async(client:Client)=>{
    await client.query("set timezone='UTC'");
    const rows:Record<string,unknown>={};
    for(const table of tables)rows[table]=(await client.query(`select to_jsonb(t) value from ${table} t where user_id=$1`,[owner])).rows;
    return rows;
  };
  let expected:Record<string,unknown>;
  try{
    const members=await source.query<{id:string;email:string}>('select id,email from app_user where email=any($1::text[])',[[ownerEmail,peerEmail]]);
    owner=members.rows.find(row=>row.email===ownerEmail)!.id;peer=members.rows.find(row=>row.email===peerEmail)!.id;
    assert(owner&&peer&&owner!==peer);
    await source.query('begin');
    await source.query(`insert into mailbox_connection(id,user_id,provider,email,display_name,credential_ciphertext,host,status)
      values($1,$2,'alimail-imap','restore@example.invalid','Synthetic restore mailbox',$3,'invalid.example','disabled')`,
    [connectionId,owner,withKey(()=>encryptMailboxCredential(credential))]);
    await source.query(`insert into mailbox_work_job(id,user_id,kind,target_id,status,lease_token,lease_until,payload,result)
      values($1,$2,'sync',$3,'running',$4,now()+interval '90 seconds','{"syntheticRestore":true}','{"imported":1}')`,[jobId,owner,connectionId,lease]);
    await source.query(`insert into mailbox_sync_run(id,user_id,connection_id,status,discovered_count,imported_count,work_job_id,work_lease_token)
      values($1,$2,$3,'running',1,1,$4,$5)`,[runId,owner,connectionId,jobId,lease]);
    await source.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,
      subject,body_text,content_sha256,content_ciphertext) values($1,$2,$3,'INBOX','restore-uid-validity',7,'inbound','','',$4,$5)`,
    [messageId,owner,connectionId,createHash('sha256').update(content.bodyText).digest('hex'),withKey(()=>encryptMailboxContent(owner,content))]);
    await source.query(`insert into mailbox_sync_cursor(user_id,connection_id,folder_path,uid_validity,last_uid)
      values($1,$2,'INBOX','restore-uid-validity',7)`,[owner,connectionId]);
    await source.query('commit');
    expected=await readRows(source);
  }catch(error){await source.query('rollback');throw error;}finally{await source.end();}
  return async(restoredAdminUrl:string,restoredAppUrl:string)=>{
    const admin=new Client({connectionString:restoredAdminUrl});await admin.connect();
    try{
      assert.deepEqual(await readRows(admin),expected,'Nonempty mailbox rows changed during cross-cluster restore');
      const message=(await admin.query<{content_ciphertext:string;subject:string;body_text:string}>('select content_ciphertext,subject,body_text from mailbox_message where id=$1',[messageId])).rows[0];
      assert.equal(message.subject,'');assert.equal(message.body_text,'');
      assert.deepEqual(withKey(()=>decryptMailboxContent(owner,message.content_ciphertext)),content);
      assert.throws(()=>withKey(()=>decryptMailboxContent(peer,message.content_ciphertext)));
      const connection=(await admin.query<{credential_ciphertext:string}>('select credential_ciphertext from mailbox_connection where id=$1',[connectionId])).rows[0];
      assert.equal(withKey(()=>decryptMailboxCredential(connection.credential_ciphertext)),credential);
      const wrongKey=randomBytes(32).toString('base64url');
      withKey(()=>{
        process.env.MAILBOX_CREDENTIAL_KEY=wrongKey;
        assert.throws(()=>decryptMailboxContent(owner,message.content_ciphertext));
        assert.throws(()=>decryptMailboxCredential(connection.credential_ciphertext));
      });
    }finally{await admin.end();}
    const app=new Client({connectionString:restoredAppUrl});await app.connect();
    try{
      for(const [userId,count] of [[owner,1],[peer,0]] as const){
        await app.query('begin');
        try{
          await app.query('set local role network_copilot_app');
          await app.query("select set_config('app.current_user_id',$1,true)",[userId]);
          for(const table of tables){
            const visible=await app.query<{count:number}>(`select count(*)::int count from ${table} where user_id=$1`,[owner]);
            assert.equal(visible.rows[0].count,count,`${table}: restored tenant isolation mismatch`);
          }
        }finally{await app.query('rollback');}
      }
    }finally{await app.end();}
  };
}
