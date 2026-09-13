import {BudgetDeniedError,type RequestBound} from "./policy";

function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,allowed:string[]){return Object.keys(value).every(key=>allowed.includes(key));}
function textMessage(value:unknown,role:string){return record(value)&&keys(value,["role","content"])&&value.role===role&&typeof value.content==="string";}

/** Enforce the assumptions supporting a bound, not just its request-byte envelope. */
export function assertRequestContract(rule:RequestBound,body:Record<string,unknown>,query:string):void{
  if(!rule.requestContract)return; // Historical independently approved scopes retain their own constraints.
  let valid=false;
  if(rule.requestContract==="kimi-cn-text-json-v1"){
    const isK3=rule.model==="kimi-k3";
    const limitKey=isK3?"max_completion_tokens":"max_tokens";
    const messages=body.messages;
    valid=rule.origin==="https://api.moonshot.cn"&&rule.pathname==="/v1/chat/completions"&&query===""
      &&["kimi-k2.6","kimi-k3"].includes(rule.model)&&body.model===rule.model
      &&keys(body,["model","messages","response_format",limitKey,"temperature"])
      &&(body.temperature===undefined||body.temperature===1)
      &&typeof body[limitKey]==="number"&&Number.isSafeInteger(body[limitKey])&&(body[limitKey] as number)>0&&(body[limitKey] as number)<=12000
      &&record(body.response_format)&&keys(body.response_format,["type"])&&body.response_format.type==="json_object"
      &&Array.isArray(messages)&&messages.length>=1&&messages.every(message=>record(message)
        &&["system","user","assistant"].includes(String(message.role))&&textMessage(message,String(message.role)));
  }
  if(rule.requestContract==="deepseek-nonthinking-text-v1"){
    const common=rule.origin==="https://api.deepseek.com"&&query===""&&body.model===rule.model
      &&record(body.thinking)&&keys(body.thinking,["type"])&&body.thinking.type==="disabled"
      &&typeof body.temperature==="number"&&Number.isFinite(body.temperature)&&body.temperature>=0&&body.temperature<=2
      &&typeof body.max_tokens==="number"&&Number.isSafeInteger(body.max_tokens)&&body.max_tokens>0&&body.max_tokens<=8192;
    const messages=body.messages;
    if(rule.model==="deepseek-flash"&&rule.pathname==="/chat/completions"){
      valid=common&&keys(body,["model","messages","response_format","thinking","temperature","max_tokens"])
        &&Array.isArray(messages)&&messages.length===2&&textMessage(messages[0],"system")&&textMessage(messages[1],"user")
        &&record(body.response_format)&&keys(body.response_format,["type"])&&body.response_format.type==="json_object";
    }else if(rule.model==="deepseek-v4-pro"&&rule.pathname==="/anthropic/v1/messages"){
      valid=common&&keys(body,["model","messages","system","thinking","temperature","max_tokens"])
        &&typeof body.system==="string"&&Array.isArray(messages)&&messages.length===1&&textMessage(messages[0],"user");
    }
  }
  if(!valid)throw new BudgetDeniedError("request-out-of-bounds");
}
