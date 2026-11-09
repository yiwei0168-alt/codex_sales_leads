import {transportFailureObservation} from './transport-observation';
// Deliberate allowlists: error messages, URLs, headers and arbitrary provider fields
// can contain credentials or private task data and must never enter this record.
const names = new Set(['Error','TypeError','TimeoutError','AbortError','AggregateError','SocketError','ConnectTimeoutError']);
const codes = new Set(['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN','EACCES','ETIMEDOUT','EPIPE',
  'UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT',
  'CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','DEPTH_ZERO_SELF_SIGNED_CERT']);
export function failureDiagnostic(error: unknown) {
  const seen = new Set<unknown>(), chain: Array<{name:string;code:string|null}> = [];
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current) && chain.length < 4) {
    seen.add(current);
    const e = current as {name?:unknown;code?:unknown;cause?:unknown};
    chain.push({name:typeof e.name === 'string' && names.has(e.name) ? e.name : 'OtherError',
      code:typeof e.code === 'string' && codes.has(e.code) ? e.code : null});
    current = e.cause;
  }
  const transport=transportFailureObservation(error);
  return {version:'network-failure-diagnostic-v1',chain,...(transport?{transport}:{})};
}
