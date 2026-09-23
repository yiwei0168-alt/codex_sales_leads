import {connect,type TLSSocket} from "node:tls";
import {connect as connectTcp,type Socket} from "node:net";
import nodemailer from "nodemailer";
import { publicMailAddresses, ALIMAIL_SMTP_HOST } from "./connection-config";

/** Only establishes TLS; never authenticates, sends, or retries a handed-off connection. */
export async function connectSmtpTls(host:string,port=465):Promise<TLSSocket>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const addresses=await Promise.race([
    publicMailAddresses(host).then(addresses=>addresses.map(address=>({address}))),
    new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error("SMTP DNS timeout"),{code:"EDNS"})),5000);}),
  ]).finally(()=>clearTimeout(timer));
  const unique=[...new Set(addresses.map(row=>row.address))].slice(0,4);
  let last:unknown=Object.assign(new Error("SMTP DNS empty"),{code:"EDNS"});
  for(const address of unique){
    try{return await new Promise<TLSSocket>((resolve,reject)=>{
      const socket=connect({host:address,port,servername:host,rejectUnauthorized:true});
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

/** Port 587 begins with an SMTP greeting; Nodemailer must upgrade via STARTTLS before AUTH. */
export async function connectSmtpStartTls(host:string,port=587):Promise<Socket>{
  const addresses=await publicMailAddresses(host);
  let last:unknown=new Error("SMTP DNS empty");
  for(const address of addresses){
    try{return await new Promise<Socket>((resolve,reject)=>{
      const socket=connectTcp({host:address,port});
      const timeout=setTimeout(()=>fail(Object.assign(new Error("SMTP connect timeout"),{code:"ETIMEDOUT"})),5000);
      const fail=(error:Error)=>{clearTimeout(timeout);socket.destroy();reject(error);};
      socket.once("error",fail);
      socket.once("connect",()=>{clearTimeout(timeout);socket.removeListener("error",fail);socket.on("error",()=>undefined);resolve(socket);});
    });}catch(error){last=error;if(!["ETIMEDOUT","ECONNREFUSED","ECONNRESET","EHOSTUNREACH","ENETUNREACH"].includes(String((error as {code?:string}).code)))throw error;}
  }
  throw last;
}

export function createSmtpTransport(auth:{user:string;pass:string},config:{host?:string;port?:number}={}){
  const host=config.host??process.env.ALIMAIL_SMTP_HOST??ALIMAIL_SMTP_HOST;
  const port=config.port??465;
  if(port!==465&&port!==587)throw new Error("SMTP 仅支持 465 TLS 或 587 STARTTLS");
  const implicitTls=port===465;
  return nodemailer.createTransport({host,port,secure:implicitTls,requireTLS:!implicitTls,auth,
    tls:{servername:host,rejectUnauthorized:true},
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    logger:false,debug:false,disableFileAccess:true,disableUrlAccess:true,
    getSocket:(_options:unknown,callback:(error:Error|null,result?:{connection:Socket;secured:boolean})=>void)=>{
      (implicitTls?connectSmtpTls(host,port):connectSmtpStartTls(host,port)).then(connection=>callback(null,{connection,secured:implicitTls}),error=>callback(error,undefined));
    },
  });
}
