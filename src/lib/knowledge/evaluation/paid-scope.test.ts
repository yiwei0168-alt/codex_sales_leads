import {describe,expect,it} from "vitest";
import {assertHoldoutPaidCapacity,HOLDOUT_KIMI_CNY_MICROS,HOLDOUT_PAID_SCOPE,HOLDOUT_QWEN_CNY_MICROS,
  holdoutPaidTariffs,holdoutTariffKey} from "./paid-scope";

const now=Date.parse("2026-09-30T12:00:00Z");
const fx={usdNumerator:"1000000",nativeDenominator:"7000000",asOf:"2026-09-30T00:00:00Z",
  retrievedAt:"2026-09-30T01:00:00Z",reference:"https://example.com/fx",version:"fixture"};
const endpoint="https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1";
describe("MA24-12 paid evaluation scope",()=>{
  it("pins only the two authorized model routes and a bounded payload",()=>{
    const rules=holdoutPaidTariffs(endpoint,fx,now);
    expect(rules.map(rule=>[rule.model,rule.maximumRequestBytes,rule.maximumOutputTokens])).toEqual([
      ["text-embedding-v4",16_384,0],["kimi-k3",24_000,4096]]);
    expect(rules.every(rule=>rule.foreignCostBound?.currency==="CNY")).toBe(true);
    expect(()=>holdoutPaidTariffs("https://example.com/compatible-mode/v1",fx,now)).toThrow();
    expect(()=>holdoutPaidTariffs(endpoint,fx,Date.parse(HOLDOUT_PAID_SCOPE.expiresAt))).toThrow();
  });
  it("fits all authorized attempts under 100 CNY even with a five percent buffer",()=>{
    const reservations=[
      ...Array.from({length:50},()=>({tariffKey:holdoutTariffKey("qwen"),maximumNativeMicros:HOLDOUT_QWEN_CNY_MICROS})),
      ...Array.from({length:99},()=>({tariffKey:holdoutTariffKey("kimi"),maximumNativeMicros:HOLDOUT_KIMI_CNY_MICROS})),
    ];
    expect(assertHoldoutPaidCapacity(reservations,"kimi").remainingCnyMicros).toBeGreaterThan(0);
    expect(()=>assertHoldoutPaidCapacity([...reservations,{tariffKey:holdoutTariffKey("kimi"),
      maximumNativeMicros:HOLDOUT_KIMI_CNY_MICROS}],"kimi")).toThrow("call limit");
  });
  it("fails closed on changed reservations and extra Qwen calls",()=>{
    expect(()=>assertHoldoutPaidCapacity([{tariffKey:holdoutTariffKey("kimi"),maximumNativeMicros:1}],"kimi"))
      .toThrow("Unknown or changed");
    expect(()=>assertHoldoutPaidCapacity(Array.from({length:50},()=>({tariffKey:holdoutTariffKey("qwen"),
      maximumNativeMicros:HOLDOUT_QWEN_CNY_MICROS})),"qwen")).toThrow("call limit");
  });
});
