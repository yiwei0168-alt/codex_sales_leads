import {getCurrentRunTree} from 'langsmith/singletons/traceable';
const tracingKeys=['LANGSMITH_TRACING','LANGSMITH_TRACING_V2','LANGCHAIN_TRACING','LANGCHAIN_TRACING_V2'];
/** Only call at the entry point of a dedicated local analysis process, never from shared request handlers. */
export function disableLocalAnalysisTracing(){for(const key of tracingKeys)process.env[key]='false';}
/** The SDK can rebuild child contexts, so an async-local override alone is insufficient. Fail closed. */
export function assertLocalAnalysisBoundary(){
 if(tracingKeys.some(key=>process.env[key]&&process.env[key]?.toLowerCase()!=='false')||getCurrentRunTree(true)?.tracingEnabled===true)
  throw new Error('Local analysis requires a dedicated process with external tracing disabled');
}
