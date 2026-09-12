import {lookup} from "node:dns/promises";
import {connect,type TLSSocket} from "node:tls";
import nodemailer from "nodemailer";

/** Only establishes TLS; never authenticates, sends, or retries a handed-off connection. */
export async function connectSmtpTls(host:string):Promise<TLSSocket>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([
    lookup(host,{all:true}),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error("SMTP DNS timeout"),{code:"EDNS"})),5000);}),
  ]).finally(()=>clearTimeout(timer));
  const unique=[...new Set(addresses.map(row=>row.address))].slice(0,4);
  let last:unknown=Object.assign(new Error("SMTP DNS empty"),{code:"EDNS"});
  for(const address of unique){
    try{return await new Promise<TLSSocket>((resolve,reject)=>{
      const socket=connect({host:address,port:465,servername:host,rejectUnauthorized:true});
      const timeout=setTimeout(()=>fail(Object.assign(new Error("SMTP TLS timeout"),{code:"ETIMEDOUT"})),5000);
      const fail=(error:Error)=>{clearTimeout(timeout);socket.destroy();reject(error);};
      socket.once("error",fail);
      socket.once("secureConnect",()=>{clearTimeout(timeout);socket.removeListener("error",fail);socket.on("error",()=>undefined);resolve(socket);});
    });}catch(error){
      last=error;
      // Certificate failures are not bypassed; only transport failures may select another address.
      if(!["ETIMEDOUT","ECONNREFUSED","ECONNRESET","EHOSTUNREACH","ENETUNREACH"].includes(String((error as {code?:string}).code)))throw error;
    }
  }
  throw last;
}

export function createSmtpTransport(auth:{user:string;pass:string}){
  const host=process.env.ALIMAIL_SMTP_HOST||"smtp.qiye.aliyun.com";
  return nodemailer.createTransport({host,port:465,secure:true,auth,
    tls:{servername:host,rejectUnauthorized:true},
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
    getSocket:(_options:unknown,callback:(error:Error|null,result?:{connection:TLSSocket;secured:boolean})=>void)=>{
      connectSmtpTls(host).then(connection=>callback(null,{connection,secured:true}),error=>callback(error,undefined));
    },
  });
}
