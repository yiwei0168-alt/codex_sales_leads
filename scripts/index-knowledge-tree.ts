import nextEnv from "@next/env";
import {OWNER_USER_ID} from "../src/lib/auth/config";
import {getPool} from "../src/lib/rag/db";
import {indexExtractedDocument} from "../src/lib/knowledge/vectorless";

nextEnv.loadEnvConfig(process.cwd());
const jobId=process.argv.find(arg=>arg.startsWith("--job-id="))?.slice(9);
if(!jobId||!/^[0-9a-f-]{36}$/i.test(jobId))throw new Error("Pass --job-id=<registered-upload-uuid>");
try{console.log(JSON.stringify(await indexExtractedDocument(OWNER_USER_ID,jobId),null,2));}
finally{await getPool().end();}
