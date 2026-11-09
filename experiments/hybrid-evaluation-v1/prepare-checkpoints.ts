import {PostgresSaver} from '@langchain/langgraph-checkpoint-postgres';
import {bindRuntime} from './runtime';
const pool=await bindRuntime();
try{
 await pool.query('create schema if not exists langgraph');
 await new PostgresSaver(pool,undefined,{schema:'langgraph'}).setup();
 await pool.query('grant usage on schema langgraph to network_copilot_app,eval_app; grant select,insert,update,delete on all tables in schema langgraph to network_copilot_app,eval_app');
 console.log(JSON.stringify({isolatedCheckpointStorage:true,modelCalls:0}));
}finally{await pool.end();}
