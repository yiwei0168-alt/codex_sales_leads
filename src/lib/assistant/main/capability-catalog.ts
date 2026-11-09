import type {ProductTool} from './contracts';

/** Discovery summary only; full schemas and enforcement remain in describe/execute. */
export function compactCapabilityCatalog(tools:readonly ProductTool[]){
 return '[capability-catalog-v2:compact]\n'+tools.map(tool=>{
  const first=tool.description.split(/\.(?:\s|$)|[。！？]/u)[0].trim();
  const characters=Array.from(first),summary=characters.slice(0,180).join('')+(characters.length>180?'…':'');
  return `${tool.id} [${tool.effect}; ${tool.cost}]: ${summary}`;
 }).join('\n');
}
