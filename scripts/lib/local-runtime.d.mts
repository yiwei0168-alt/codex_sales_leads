import type {BinaryLike} from 'node:crypto';
export interface LocalProcess {pid:number;createdAt:string;commandLine:string;name?:string}
export interface LocalInventory {processes:LocalProcess[];listeners:Array<{port:number;address:string;pid:number}>;dockerDesktopRunning?:boolean}
export interface LocalComponent {name:string;identityPaths:string[];port?:number;health?:string;healthExpected?:Record<string,unknown>;startupMs:number;legacy?:Array<{pid:number;createdAt:string;commandSha256:string}>}
export function sha(data:BinaryLike):string;
export function within(root:string,path:string):boolean;
export function commandHasPath(command:string,path:string):boolean;
export function ownsProcess(component:LocalComponent,process:LocalProcess):boolean;
export function selectExisting(component:LocalComponent,inventory:LocalInventory):LocalProcess|null;
export function ensureComponent(component:LocalComponent,deps:{inventory:()=>Promise<LocalInventory>;healthy:(url:string,expected?:Record<string,unknown>)=>boolean|Promise<boolean>;start:(component:LocalComponent)=>unknown|Promise<unknown>;wait:(ms:number)=>unknown|Promise<unknown>}):Promise<{name:string;pid:number;adopted:boolean}>;
export function inventory(root:string):Promise<LocalInventory>;
export function healthy(url:string,expected?:Record<string,unknown>):Promise<boolean>;
export function validateConfig(config:unknown,root:string):Promise<void>;
export function runtimeEnvironment(root:string):Promise<Record<string,string>>;
export function filterRuntimeEnvironment(source:string,inherited:Record<string,string|undefined>):Record<string,string>;
export function launch(component:unknown,root:string,env:Record<string,string>):Promise<number|undefined>;
export function ensureDocker(config:unknown,root:string):Promise<void>;
export function nodePreloads(root:string):string[];
export function saveResult(root:string,result:unknown):Promise<void>;
