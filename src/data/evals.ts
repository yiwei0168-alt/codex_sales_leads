import type { AccountTier, ChannelLayer, ChannelRole, SupplyModel } from "@/lib/domain";

export const searchBriefEvals = [
  "进入墨西哥，同时寻找全国型 Distributor、VAR、SI 与 ISP。",
  "已有一级分销商但增长缓慢，寻找未覆盖的 Dealer 与 Retailer。",
  "寻找可覆盖北部工业城市的 VAD 与系统集成商。",
  "为 SMB Wi-Fi 7 产品寻找线上零售与经销节点。",
  "识别大型 ISP，并评估品牌直供或联合供货。",
  "寻找具备托管网络能力的 MSP 与 SI。",
  "排除纯消费电子门店，关注 B2B 项目型渠道。",
  "寻找可以承接库存、账期与售后的全国分销商。",
  "围绕酒店行业寻找 Installer 与 SI。",
  "为已有墨西哥城分销商补充蒙特雷下级覆盖。",
  "识别 KA 级 E-tailer，但不要把 KA 当作渠道角色。",
  "比较 ISP、Retailer 与 Distributor 的不同供货路径。",
];

interface ClassificationEval {
  name: string;
  layer: ChannelLayer;
  roles: ChannelRole[];
  accountTier: AccountTier;
  supplyModel: SupplyModel;
}

export const classificationEvals: ClassificationEval[] = [
  { name: "National broadline distributor", layer: "Tier-1 Distributor", roles: ["Distributor"], accountTier: "KA", supplyModel: "TBD" },
  { name: "Value-added distributor", layer: "Tier-1 Distributor", roles: ["Distributor", "VAD"], accountTier: "Priority", supplyModel: "TBD" },
  { name: "Regional reseller", layer: "Downstream Channel", roles: ["VAR", "Reseller"], accountTier: "Standard", supplyModel: "Distributor Supply" },
  { name: "Large ISP", layer: "Downstream Channel", roles: ["ISP"], accountTier: "KA", supplyModel: "Co-sell/Co-supply" },
  { name: "Local ISP", layer: "Downstream Channel", roles: ["ISP"], accountTier: "Priority", supplyModel: "Distributor Supply" },
  { name: "National retailer", layer: "Downstream Channel", roles: ["Retailer"], accountTier: "KA", supplyModel: "Distributor Supply" },
  { name: "Technology e-tailer", layer: "Downstream Channel", roles: ["E-tailer", "Reseller"], accountTier: "Priority", supplyModel: "Distributor Supply" },
  { name: "Enterprise SI", layer: "Downstream Channel", roles: ["SI"], accountTier: "KA", supplyModel: "Co-sell/Co-supply" },
  { name: "Managed service provider", layer: "Downstream Channel", roles: ["MSP", "SI"], accountTier: "Priority", supplyModel: "Distributor Supply" },
  { name: "Network installer", layer: "Downstream Channel", roles: ["Installer"], accountTier: "Standard", supplyModel: "Distributor Supply" },
  { name: "B2B dealer", layer: "Downstream Channel", roles: ["Dealer", "Reseller"], accountTier: "Standard", supplyModel: "Distributor Supply" },
  { name: "Marketplace", layer: "Downstream Channel", roles: ["E-tailer"], accountTier: "KA", supplyModel: "Distributor Supply" },
  { name: "Carrier integrator", layer: "Downstream Channel", roles: ["ISP", "SI", "MSP"], accountTier: "KA", supplyModel: "Brand Direct" },
  { name: "Security VAD", layer: "Tier-1 Distributor", roles: ["VAD", "Distributor"], accountTier: "Priority", supplyModel: "TBD" },
  { name: "Regional department store", layer: "Downstream Channel", roles: ["Retailer"], accountTier: "Priority", supplyModel: "Distributor Supply" },
  { name: "Project VAR", layer: "Downstream Channel", roles: ["VAR", "SI"], accountTier: "Priority", supplyModel: "Distributor Supply" },
  { name: "Cloud MSP", layer: "Downstream Channel", roles: ["MSP"], accountTier: "Priority", supplyModel: "Co-sell/Co-supply" },
  { name: "Small computer shop", layer: "Downstream Channel", roles: ["Dealer"], accountTier: "Long-tail", supplyModel: "Distributor Supply" },
  { name: "Telecom enterprise provider", layer: "Downstream Channel", roles: ["ISP", "MSP"], accountTier: "KA", supplyModel: "Brand Direct" },
  { name: "Consumer electronics chain", layer: "Downstream Channel", roles: ["Retailer"], accountTier: "KA", supplyModel: "Distributor Supply" },
];
