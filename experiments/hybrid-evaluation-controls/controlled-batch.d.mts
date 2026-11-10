type Trace={wire:Array<{status?:number;error?:string}>;calls?:Array<{tool_id:string;output?:{status?:string};metrics?:{failureDiagnostic?:{transport?:unknown}}}>};
type Outcome={trace:Trace;observation?:unknown};
export class BatchStopped extends Error {reason:string;completed:Array<{key:string;reused:boolean}>;constructor(reason:string,completed:Array<{key:string;reused:boolean}>);}
export function fileStopRequested(path:string):Promise<boolean>;
export function hasTransportFailure(trace:Trace):boolean;
export function runControlledBatch(keys:string[],options:{readSaved:(key:string)=>Promise<Outcome|null>;submit:(key:string)=>Promise<Outcome>;stopRequested:()=>Promise<boolean>;maximumConsecutiveTransportFailures?:number}):Promise<Array<{key:string;reused:boolean}>>;
