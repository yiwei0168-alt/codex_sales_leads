const labels:Record<string,string>={productAndUseCaseFit:"产品与应用场景",cooperationPathAndBuyingInfluence:"合作路径与采购影响力",scaleAndChannelCoverage:"同角色公司规模与覆盖",executionAndEnablement:"执行与赋能",opportunityAndRisk:"机会与风险"};
export function assessmentDisplay(dimensions:unknown,policy:unknown){
  const d=dimensions&&typeof dimensions==="object"?dimensions as Record<string,unknown>:{};
  const p=policy&&typeof policy==="object"?policy as Record<string,unknown>:{};
  const weights=p.weights&&typeof p.weights==="object"?p.weights as Record<string,unknown>:{};
  return Object.keys(labels).map(key=>{const values=key==="productAndUseCaseFit"?[d.productFamilyMatch,d.customerAndScenarioOverlap,d.positioningCompatibility]:[d[key]];
    return {key,label:labels[key],score:values.every(value=>typeof value==="number"&&Number.isFinite(value))?(values as number[]).reduce((a,b)=>a+b,0):null,
      maximum:typeof weights[key]==="number"?weights[key] as number:null};});
}
