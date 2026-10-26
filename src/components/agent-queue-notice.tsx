export function AgentQueueNotice({status,waitMs,current=true,pendingBatch=false}:{status:string;waitMs?:number;current?:boolean;pendingBatch?:boolean}){
 if(!current||status!=='queued'||pendingBatch||typeof waitMs!=='number'||!Number.isFinite(waitMs)||waitMs<60_000)return null;
 return <p role="status">等待后台调度已超过 1 分钟。任务已保存，无需重复提交。后台可能繁忙或暂不可用；可稍后查看或取消任务。若持续无变化，请检查后台服务。</p>;
}
