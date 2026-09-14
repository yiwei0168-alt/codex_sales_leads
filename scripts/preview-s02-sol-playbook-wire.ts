import {ChatOpenAI} from "@langchain/openai";
import {z} from "zod";

const captured:Request[]=[];
const model=new ChatOpenAI({apiKey:"synthetic-never-sent",model:"openai/gpt-5.6-sol",
  maxRetries:0,timeout:10_000,streamUsage:false,maxTokens:4096,
  modelKwargs:{provider:{require_parameters:true,data_collection:"deny",only:["openai"],allow_fallbacks:false}},
  configuration:{baseURL:"https://openrouter.ai/api/v1",fetch:async(input,init)=>{
    captured.push(new Request(input,init));
    throw new Error("synthetic-capture-no-network");
  }},
}).withStructuredOutput(z.object({marketHypothesis:z.string()}),{
  name:"lead_market_playbook",method:"jsonSchema",strict:true,
});
try{await model.invoke("Synthetic local wire capture only");}
catch(error){if(!(error instanceof Error)||!String(error.cause).includes("synthetic-capture-no-network"))throw error;}
if(captured.length!==1)throw new Error("Expected exactly one no-network wire");
const request=captured[0],body=JSON.parse(await request.text());
if(body.model!=="openai/gpt-5.6-sol"||body.max_tokens!==4096||
  body.max_completion_tokens!==undefined||body.temperature!==undefined||
  body.provider?.only?.[0]!=="openai"||body.provider?.allow_fallbacks!==false||
  body.provider?.require_parameters!==true||body.response_format?.type!=="json_schema")
  throw new Error("Candidate wire differs from proposed strict endpoint contract");
console.log(JSON.stringify({mode:"synthetic-no-network",origin:new URL(request.url).origin,
  pathname:new URL(request.url).pathname,requestBytes:Buffer.byteLength(JSON.stringify(body)),
  parameterNames:Object.keys(body).sort(),maxTokens:body.max_tokens,provider:body.provider,
  structuredOutput:body.response_format?.type,providerCalls:0,paidReservations:0}));
