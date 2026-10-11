"use client";
import {useEffect,useState} from 'react';

/** Only expose data belonging to the current URL and refresh generation. */
export function useMailboxResource<T>(url:string|null,revision:number){
 const [attempt,setAttempt]=useState(0);
 const key=JSON.stringify([url,revision,attempt]);
 // A → B → A is a new request even when B has not completed.
 const [request,setRequest]=useState({key,generation:0});
 if(request.key!==key)setRequest({key,generation:request.generation+1});
 const generation=request.generation;
 const [result,setResult]=useState<{generation:number;data:T|null;failed:boolean}|null>(null);
 useEffect(()=>{
  if(!url)return;
  const controller=new AbortController();
  void fetch(url,{signal:controller.signal,cache:'no-store'}).then(async response=>{
   if(!response.ok)throw new Error('Read failed');
   return await response.json() as T;
  }).then(data=>{if(!controller.signal.aborted)setResult({generation,data,failed:false});})
   .catch(()=>{if(!controller.signal.aborted)setResult({generation,data:null,failed:true});});
  return()=>controller.abort();
 },[url,key,generation]);
 const current=request.key===key&&result?.generation===generation?result:null;
 return {data:url?current?.data??null:null,loading:Boolean(url&&!current),failed:Boolean(url&&current?.failed),retry:()=>setAttempt(value=>value+1)};
}
