import {graphObservationIds} from "../src/lib/knowledge/memory-graph-search";

const owner=process.env.MA24_SYNTH_OWNER;
if(!owner||!/^[-0-9a-f]{36}$/i.test(owner))throw new Error("Synthetic owner ID required");
console.log(JSON.stringify({ids:await graphObservationIds(owner,"concise")}));
