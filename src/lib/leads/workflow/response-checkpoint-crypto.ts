import{createCipheriv,createDecipheriv,hkdfSync,randomBytes}from"node:crypto";
function key(userId:string){
 const master=Buffer.from(process.env.MAILBOX_CREDENTIAL_KEY?.trim()??"","base64url");
 if(master.length!==32)throw Error("Model response checkpoint encryption key unavailable");
 return Buffer.from(hkdfSync("sha256",master,Buffer.from(userId),Buffer.from("lead-model-response:v1"),32));
}
export function checkResponseEncryptionKey(userId:string){key(userId);}
export function sealModelResponse(userId:string,binding:string,value:unknown):string{
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(userId),iv);
 cipher.setAAD(Buffer.from(binding));const bytes=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
 return["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),bytes.toString("base64url")].join(".");
}
export function openModelResponse(userId:string,binding:string,sealed:string):unknown{
 const[v,iv,tag,body]=sealed.split(".");if(v!=="v1"||!iv||!tag||!body)throw Error("Invalid encrypted model response");
 const cipher=createDecipheriv("aes-256-gcm",key(userId),Buffer.from(iv,"base64url"));
 cipher.setAAD(Buffer.from(binding));cipher.setAuthTag(Buffer.from(tag,"base64url"));
 return JSON.parse(Buffer.concat([cipher.update(Buffer.from(body,"base64url")),cipher.final()]).toString("utf8"));
}
