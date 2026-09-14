import {BudgetDeniedError,type RequestBound} from "./policy";
import {isBeijingEmbeddingOrigin} from "./embedding-model-bound";

function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function keys(value:Record<string,unknown>,allowed:string[]){return Object.keys(value).every(key=>allowed.includes(key));}
function textMessage(value:unknown,role:string){return record(value)&&keys(value,["role","content"])&&value.role===role&&typeof value.content==="string";}

/** Enforce the assumptions supporting a bound, not just its request-byte envelope. */
export function assertRequestContract(rule:RequestBound,body:Record<string,unknown>,query:string,method="POST",headers?:Headers):void{
  if(!rule.requestContract)return; // Historical independently approved scopes retain their own constraints.
  let valid=false;
  if(rule.requestContract==="openrouter-sol-standard-json-v1"||rule.requestContract==="openrouter-sol-openai-playbook-v1"
    ||rule.requestContract==="openrouter-sol-openai-playbook-v2"){
    const playbookV2=rule.requestContract==="openrouter-sol-openai-playbook-v2";
    const playbookPinned=rule.requestContract==="openrouter-sol-openai-playbook-v1"||playbookV2;
    const format=body.response_format;
    valid=method==="POST"&&rule.origin==="https://openrouter.ai"&&rule.pathname==="/api/v1/chat/completions"&&query===""
      &&rule.model==="openai/gpt-5.6-sol"&&body.model===rule.model
      &&keys(body,playbookV2?["model","messages","provider","response_format","stream","max_tokens"]
        :["model","messages","provider","response_format","stream","temperature","max_completion_tokens"])
      &&body.stream===false&&(playbookV2?body.temperature===undefined:body.temperature===0)
      &&Number.isSafeInteger(playbookV2?body.max_tokens:body.max_completion_tokens)
      &&((playbookV2?body.max_tokens:body.max_completion_tokens) as number)>0
      &&((playbookV2?body.max_tokens:body.max_completion_tokens) as number)<=4096
      &&record(body.provider)&&keys(body.provider,playbookPinned
        ?["require_parameters","data_collection","only","allow_fallbacks"]:["require_parameters","data_collection"])
      &&body.provider.require_parameters===true&&body.provider.data_collection==="deny"
      &&(!playbookPinned
        ||(Array.isArray(body.provider.only)&&body.provider.only.length===1&&body.provider.only[0]==="openai"
          &&body.provider.allow_fallbacks===false))
      &&Array.isArray(body.messages)&&body.messages.length===2&&textMessage(body.messages[0],"system")&&textMessage(body.messages[1],"user")
      &&record(format)&&keys(format,["type","json_schema"])&&format.type==="json_schema"
      &&record(format.json_schema)&&keys(format.json_schema,["name","strict","schema","description"])
      &&typeof format.json_schema.name==="string"&&format.json_schema.strict===true&&record(format.json_schema.schema);
  }
  if(rule.requestContract==="openrouter-terra-review-json-v1"
    ||rule.requestContract==="openrouter-sol-judge-json-v1"){
    const terra=rule.requestContract==="openrouter-terra-review-json-v1";
    const format=body.response_format,reasoning=body.reasoning;
    valid=method==="POST"&&rule.origin==="https://openrouter.ai"
      &&rule.pathname==="/api/v1/chat/completions"&&query===""
      &&rule.model===(terra?"openai/gpt-5.6-terra":"openai/gpt-5.6-sol")&&body.model===rule.model
      &&keys(body,["model","messages","provider","response_format","reasoning","stream","temperature","max_completion_tokens"])
      &&(body.stream===undefined||body.stream===false)&&body.temperature===0
      &&Number.isSafeInteger(body.max_completion_tokens)&&(body.max_completion_tokens as number)>0
      &&(body.max_completion_tokens as number)<=(terra?8192:12000)
      &&record(reasoning)&&keys(reasoning,["effort"])&&reasoning.effort===(terra?"medium":"high")
      &&record(body.provider)&&keys(body.provider,["require_parameters","data_collection"])
      &&body.provider.require_parameters===true&&body.provider.data_collection==="deny"
      &&Array.isArray(body.messages)&&body.messages.length===2
      &&textMessage(body.messages[0],"system")&&textMessage(body.messages[1],"user")
      &&record(format)&&keys(format,["type","json_schema"])&&format.type==="json_schema"
      &&record(format.json_schema)&&keys(format.json_schema,["name","strict","schema","description"])
      &&format.json_schema.name===(terra?"lead-review-secondary":"lead-review-judge")
      &&format.json_schema.strict===true&&record(format.json_schema.schema);
  }
  if(rule.requestContract==="searchapi-google-bing-v1"){
    const params=new URLSearchParams(query);
    const allowed=["engine","q","location","gl","hl","num"];
    valid=method==="GET"&&rule.origin==="https://www.searchapi.io"&&rule.pathname==="/api/v1/search"&&rule.model===""
      &&Object.keys(body).length===0&&[...params.keys()].every(key=>allowed.includes(key)&&params.getAll(key).length===1)
      &&Boolean(params.get("q")?.trim())&&Boolean(params.get("location")?.trim())
      &&/^[a-z]{2}$/i.test(params.get("gl")??"")&&/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(params.get("hl")??"")
      &&((params.get("engine")==="google"&&params.get("num")==="10")
        ||(params.get("engine")==="bing"&&/^(?:[1-9]|1[0-9]|20)$/.test(params.get("num")??"")));
  }
  if(rule.requestContract==="google-places-text-enterprise-v1"){
    const fields=(headers?.get("x-goog-fieldmask")??"").split(",").map(field=>field.trim());
    const allowed=["places.id","places.displayName","places.formattedAddress","places.websiteUri","places.googleMapsUri","places.businessStatus","places.primaryTypeDisplayName"];
    valid=method==="POST"&&rule.origin==="https://places.googleapis.com"&&rule.pathname==="/v1/places:searchText"
      &&query===""&&rule.model===""&&fields.length>0&&new Set(fields).size===fields.length&&fields.every(field=>allowed.includes(field))
      &&keys(body,["textQuery","pageSize","languageCode","regionCode"])
      &&typeof body.textQuery==="string"&&body.textQuery.trim().length>0
      &&Number.isInteger(body.pageSize)&&(body.pageSize as number)>=1&&(body.pageSize as number)<=20
      &&typeof body.languageCode==="string"&&/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(body.languageCode)
      &&typeof body.regionCode==="string"&&/^[a-z]{2}$/i.test(body.regionCode);
  }
  if(rule.requestContract==="exa-company-auto-text-v1"){
    valid=method==="POST"&&rule.origin==="https://api.exa.ai"&&rule.pathname==="/search"&&rule.model===""&&query===""
      &&keys(body,["query","type","category","userLocation","numResults","contents"])
      &&typeof body.query==="string"&&body.query.trim().length>0&&body.type==="auto"&&body.category==="company"
      &&typeof body.userLocation==="string"&&/^[A-Z]{2}$/i.test(body.userLocation)
      &&Number.isInteger(body.numResults)&&(body.numResults as number)>=1&&(body.numResults as number)<=20
      &&record(body.contents)&&keys(body.contents,["text"])&&body.contents.text===true;
  }
  if(rule.requestContract==="brave-web-search-v1"){
    const params=new URLSearchParams(query);
    const allowed=["q","country","search_lang","count"];
    valid=method==="GET"&&rule.origin==="https://api.search.brave.com"&&rule.pathname==="/res/v1/web/search"
      &&rule.model===""&&Object.keys(body).length===0
      &&[...params.keys()].every(key=>allowed.includes(key)&&params.getAll(key).length===1)
      &&Boolean(params.get("q")?.trim())&&/^(?:[1-9]|1[0-9]|20)$/.test(params.get("count")??"")
      &&/^(?:[A-Z]{2}|ALL)$/i.test(params.get("country")??"")
      &&/^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(params.get("search_lang")??"");
  }
  if(rule.requestContract==="tavily-search-v1"){
    valid=method==="POST"&&rule.origin==="https://api.tavily.com"&&rule.pathname==="/search"&&rule.model===""&&query===""
      &&keys(body,["query","country","search_depth","max_results","include_answer","include_raw_content","include_domains","auto_parameters"])
      &&typeof body.query==="string"&&body.query.trim().length>0
      &&["basic","advanced"].includes(String(body.search_depth))&&body.include_answer===false
      &&(body.include_raw_content===false||body.include_raw_content==="markdown")
      &&(body.auto_parameters===undefined||body.auto_parameters===false)
      &&Number.isInteger(body.max_results)&&(body.max_results as number)>=1&&(body.max_results as number)<=20
      &&(body.country===undefined||typeof body.country==="string")
      &&(body.include_domains===undefined||(Array.isArray(body.include_domains)&&body.include_domains.every(item=>typeof item==="string")));
  }
  if(rule.requestContract==="tavily-basic-extract-v1"){
    valid=method==="POST"&&rule.origin==="https://api.tavily.com"&&rule.pathname==="/extract"
      &&rule.model===""&&query===""
      &&keys(body,["urls","extract_depth","format","include_images","include_usage","timeout"])
      &&Array.isArray(body.urls)&&body.urls.length>=1&&body.urls.length<=20
      &&body.urls.every(item=>typeof item==="string"&&item.length<=2_048&&/^https:\/\//i.test(item)
        &&(()=>{try{const url=new URL(item);return !url.username&&!url.password&&!url.hash;}catch{return false;}})())
      &&body.extract_depth==="basic"&&body.format==="text"
      &&body.include_images===false&&body.include_usage===true
      &&typeof body.timeout==="number"&&Number.isFinite(body.timeout)
      &&body.timeout>=1&&body.timeout<=20;
  }
  if(rule.requestContract==="aliyun-beijing-dense-text-v1"){
    const inputs=typeof body.input==="string"?[body.input]:body.input;
    valid=isBeijingEmbeddingOrigin(rule.origin)&&rule.pathname==="/compatible-mode/v1/embeddings"&&query===""
      &&rule.model==="text-embedding-v4"&&body.model===rule.model
      &&keys(body,["model","input","dimensions","encoding_format"])
      &&Array.isArray(inputs)&&inputs.length>0&&inputs.length<=10&&inputs.every(item=>typeof item==="string"&&item.trim().length>0)
      &&(body.dimensions===undefined||[2048,1536,1024,768,512,256,128,64].includes(body.dimensions as number))
      &&body.encoding_format==="float";
  }
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
