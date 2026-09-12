import type {CostStageSummary as Stage} from "@/lib/billing/cost-summary";
const money=(value:string|null|undefined)=>value==null?"未知":`$${(Number(value)/1e6).toFixed(6)}`;
export function CostStageSummary({stages}:{stages:Stage[]}){
  return <details><summary>分阶段费用明细</summary>
    <p>预留、Token 估算、服务商报告和发票核验是不同口径，不能相加。已报告部分不代表完整账单；当前占用包含已核销金额和未核销预留。</p>
    {stages.length===0&&<p>暂无费用记录，不能据此推断历史费用为零。</p>}
    {stages.map(stage=><section key={stage.stage}><h4>{stage.stage} · {stage.calls} 次预留</h4><dl>
      <dt>历史预留</dt><dd>{money(stage.reserved_micros)}</dd>
      <dt>当前占用</dt><dd>{money(stage.occupied_micros)}</dd>
      <dt>Token 估算（非账单）</dt><dd>{money(stage.estimated_micros)} · {stage.estimated_calls??0}/{stage.calls} 次有记录</dd>
      <dt>服务商报告（已报告部分）</dt><dd>{money(stage.reported_micros)} · {stage.reported_calls??0}/{stage.calls} 次有记录</dd>
      <dt>发票核验（已核验部分）</dt><dd>{money(stage.invoice_micros)} · {stage.invoice_calls??0}/{stage.calls} 次有记录</dd>
      <dt>尚未核销</dt><dd>{stage.unreconciled_calls??"未知"} 次</dd>
    </dl>{stage.summed_latency_ms!=null&&<p>累计 HTTP 耗时 {Number(stage.summed_latency_ms)/1000} 秒（非并行墙钟时间）</p>}</section>)}
  </details>;
}
