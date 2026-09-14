import {createHash} from "node:crypto";

/** The exact replay identity persisted by paid-fetch, excluding credentials. */
export function paidRequestFingerprint(method:string,url:URL,body:string):string{
  return createHash("sha256").update(JSON.stringify({version:"paid-request-replay-v1",
    method,origin:url.origin,pathname:url.pathname,query:url.search,body})).digest("hex");
}
