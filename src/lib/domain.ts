export type ChannelLayer = "Tier-1 Distributor" | "Downstream Channel";

export type ChannelRole =
  | "Distributor"
  | "VAD"
  | "VAR"
  | "Dealer"
  | "Reseller"
  | "Retailer"
  | "E-tailer"
  | "SI"
  | "Installer"
  | "MSP"
  | "ISP";

export type AccountTier = "KA" | "Priority" | "Standard" | "Long-tail";
export type SupplyModel =
  | "Distributor Supply"
  | "Brand Direct"
  | "Co-sell/Co-supply"
  | "TBD";
export type BrandInvolvement = "Light" | "Standard" | "Deep";
export type EvidenceStatus =
  | "Verified"
  | "Corroborated"
  | "Inferred"
  | "Unknown"
  | "Conflicting";
export type OpportunityStage =
  | "Discovered"
  | "Qualified"
  | "Priority"
  | "Contact Prepared"
  | "Engaged"
  | "Excluded";

export interface Evidence {
  id: string;
  sourceUrl: string;
  title: string;
  sourceType: "Company website" | "Official directory" | "Regulator" | "Industry publication";
  capturedAt: string;
  claim: string;
  summary: string;
  status: EvidenceStatus;
  confidence: number;
}

export interface CompanyRecord {
  id: string;
  legalName: string;
  displayName: string;
  domain: string;
  city: string;
  country: string;
  layer: ChannelLayer;
  roles: ChannelRole[];
  accountTier: AccountTier;
  supplyModel: SupplyModel;
  brandInvolvement: BrandInvolvement;
  fitScore: number;
  accountValue: number;
  reachability: number;
  evidenceConfidence: number;
  summary: string;
  opportunityStage: OpportunityStage;
  priority: "High" | "Medium" | "Low";
  owner: string;
  nextAction: string;
  risks: string[];
  unknowns: string[];
  evidence: Evidence[];
  leadType?: "Channel" | "Strategic Customer";
  searchRunId?: string;
  manuallyEdited?: boolean;
}

export interface ChannelRelationship {
  id: string;
  fromNode: string;
  toNode: string;
  type: "Existing supply" | "Potential supply" | "Co-sell" | "Technology alliance";
  status: "Verified" | "Hypothesis" | "Rejected";
  evidenceIds: string[];
}

export interface DevelopmentPlan {
  angle: string;
  products: string[];
  supplyPath: SupplyModel;
  brandInvolvement: BrandInvolvement;
  targetTitles: string[];
  steps: string[];
  draft: string;
  evidenceIds: string[];
}

export const roleFamilies = {
  distribution: ["Distributor", "VAD"] as ChannelRole[],
  resale: ["VAR", "Dealer", "Reseller"] as ChannelRole[],
  retail: ["Retailer", "E-tailer"] as ChannelRole[],
  services: ["SI", "Installer", "MSP"] as ChannelRole[],
  isp: ["ISP"] as ChannelRole[],
};

export function primaryRole(company: CompanyRecord): ChannelRole {
  return company.roles[0];
}

export function priorityIndex(company: CompanyRecord): number {
  const tierBoost = company.accountTier === "KA" ? 10 : company.accountTier === "Priority" ? 5 : 0;
  const confidencePenalty = company.evidenceConfidence < 60 ? 5 : 0;
  return Math.round(
    company.fitScore * 0.52 +
      company.accountValue * 0.28 +
      company.reachability * 0.2 +
      tierBoost -
      confidencePenalty,
  );
}

export function buildDevelopmentPlan(company: CompanyRecord): DevelopmentPlan {
  const isDistribution = company.layer === "Tier-1 Distributor";
  const isIsp = company.roles.includes("ISP");
  const isServices = company.roles.some((item) => roleFamilies.services.includes(item));

  const angle = isDistribution
    ? "用可预测的 SMB 网络产品组合补强渠道覆盖，并以联合招募下级伙伴启动市场。"
    : isIsp
      ? "从分支接入、托管 Wi-Fi 与网络可观测性切入，验证规模化设备与联合交付机会。"
      : isServices
        ? "以可快速部署的交换、无线与安全组合提升项目交付效率和持续服务收入。"
        : "以高周转 SMB 连接产品和渠道营销包扩大品类覆盖与转化。";

  const products = isIsp
    ? ["Wi-Fi 7 Gateway", "Managed Switch", "Network Controller"]
    : isServices
      ? ["PoE Switch", "Business Access Point", "Secure Gateway"]
      : ["SMB Wi-Fi 7", "Easy Managed Switch", "Omnichannel Starter Kit"];

  const targetTitles = isDistribution
    ? ["Business Unit Director", "Vendor Manager", "Channel Development Manager"]
    : isIsp
      ? ["Network Planning Director", "Procurement Director", "Product Engineering Lead"]
      : ["Commercial Director", "Solutions Manager", "Category Manager"];

  return {
    angle,
    products,
    supplyPath: company.supplyModel,
    brandInvolvement: company.brandInvolvement,
    targetTitles,
    steps: [
      `验证 ${company.unknowns[0] ?? "采购决策与当前品牌组合"}`,
      `围绕 ${products[0]} 准备 30 分钟业务与技术发现会议`,
      `确认 ${company.supplyModel} 的商务、库存和售后责任`,
      "人工审核内容后由销售团队执行外联",
    ],
    draft: `Subject: Exploring an SMB networking growth plan with ${company.displayName}\n\nHi {{first_name}},\n\nWe noticed ${company.evidence[0]?.summary ?? `${company.displayName} serves the ${company.country} technology market`} [${company.evidence[0]?.id ?? "evidence-pending"}]. We would like to explore a focused SMB networking plan built around ${products.slice(0, 2).join(" and ")}.\n\nOur initial hypothesis is to use a ${company.supplyModel.toLowerCase()} path, subject to your validation. Would a short working session next week be useful?\n\nBest,\n{{sales_owner}}`,
    evidenceIds: company.evidence.slice(0, 2).map((item) => item.id),
  };
}

export function validateTaxonomy(company: CompanyRecord): string[] {
  const errors: string[] = [];
  if (company.roles.some((role) => role === ("KA" as ChannelRole))) {
    errors.push("KA must not be stored as a channel role");
  }
  if (company.roles.includes("ISP") && company.layer !== "Downstream Channel") {
    errors.push("ISP must be modeled as a downstream channel");
  }
  if (company.evidence.length === 0) {
    errors.push("Every company requires identity evidence");
  }
  return errors;
}
