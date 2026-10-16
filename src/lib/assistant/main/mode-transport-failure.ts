const receipts=new WeakMap<object,unknown>();
/** Internal metadata on the original error, preserving fallback classification. */
export function attachModeTransportFailure(error:unknown,receipt:unknown){
 if(error&&typeof error==='object')receipts.set(error,receipt);
}
export function modeTransportFailure(error:unknown){
 return error&&typeof error==='object'?receipts.get(error):undefined;
}
