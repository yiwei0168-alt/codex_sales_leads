import {resolve} from 'node:path';

/** Shared loader conditions for the production main graph and Skill collector.
 * Node-only builds replace Next's server marker with its installed empty module. */
export function productNodeBuildOptions(){
 return {bundle:true,platform:'node',target:'node24',format:'esm',packages:'external',metafile:true,logLevel:'warning',
  alias:{'server-only':resolve('node_modules/next/dist/compiled/server-only/empty.js')}};
}
