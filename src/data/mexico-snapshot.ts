import type {
  AccountTier,
  BrandInvolvement,
  ChannelRelationship,
  ChannelRole,
  CompanyRecord,
  Evidence,
  EvidenceStatus,
  OpportunityStage,
  SupplyModel,
} from "@/lib/domain";

const capturedAt = "2026-08-11";

interface SourceInput {
  url: string;
  title: string;
  claim: string;
  summary: string;
  type?: Evidence["sourceType"];
  status?: EvidenceStatus;
  confidence?: number;
}

interface CompanyInput {
  id: string;
  name: string;
  legal?: string;
  domain: string;
  city: string;
  roles: ChannelRole[];
  tier: AccountTier;
  supply: SupplyModel;
  involvement?: BrandInvolvement;
  fit: number;
  value: number;
  reach: number;
  confidence: number;
  summary: string;
  stage?: OpportunityStage;
  priority?: CompanyRecord["priority"];
  owner?: string;
  next: string;
  risks: string[];
  unknowns: string[];
  sources: SourceInput[];
}

function makeEvidence(companyId: string, source: SourceInput, index: number): Evidence {
  return {
    id: `ev-${companyId}-${index + 1}`,
    sourceUrl: source.url,
    title: source.title,
    sourceType: source.type ?? "Company website",
    capturedAt,
    claim: source.claim,
    summary: source.summary,
    status: source.status ?? "Verified",
    confidence: source.confidence ?? 88,
  };
}

function makeCompany(input: CompanyInput): CompanyRecord {
  const distributor = input.roles.includes("Distributor") || input.roles.includes("VAD");
  return {
    id: input.id,
    legalName: input.legal ?? input.name,
    displayName: input.name,
    domain: input.domain,
    city: input.city,
    country: "Mexico",
    layer: distributor ? "Tier-1 Distributor" : "Downstream Channel",
    roles: input.roles,
    accountTier: input.tier,
    supplyModel: input.supply,
    brandInvolvement: input.involvement ?? (input.tier === "KA" ? "Deep" : "Standard"),
    fitScore: input.fit,
    accountValue: input.value,
    reachability: input.reach,
    evidenceConfidence: input.confidence,
    summary: input.summary,
    opportunityStage: input.stage ?? "Discovered",
    priority: input.priority ?? (input.fit >= 84 ? "High" : input.fit >= 72 ? "Medium" : "Low"),
    owner: input.owner ?? "Unassigned",
    nextAction: input.next,
    risks: input.risks,
    unknowns: input.unknowns,
    evidence: input.sources.map((source, index) => makeEvidence(input.id, source, index)),
  };
}

const regulatorSource: SourceInput = {
  url: "https://www.gob.mx/crt/prensa/reporta-crt-144-5-millones-de-lineas-celulares-activas-en-mexico?idiom=es",
  title: "CRT · Telecom sector operator data",
  type: "Regulator",
  claim: "Mexican telecom regulator reporting identifies major fixed and mobile operator groups.",
  summary: "The regulator identifies the principal operator groups serving Mexico.",
  status: "Corroborated",
  confidence: 96,
};

export const mexicoCompanies: CompanyRecord[] = [
  makeCompany({
    id: "ct-internacional", name: "CT Internacional", legal: "CT Internacional del Noroeste, S.A. de C.V.", domain: "ctonline.mx", city: "Hermosillo", roles: ["Distributor"], tier: "KA", supply: "TBD", fit: 92, value: 94, reach: 82, confidence: 91,
    summary: "全国型 IT 批发渠道候选，适合作为供货与下级招募锚点。", stage: "Priority", priority: "High", owner: "María Chen", next: "核验 Networking BU 与区域招募计划", risks: ["现有品牌组合可能重叠"], unknowns: ["Networking 品类采购负责人"],
    sources: [{ url: "https://ctonline.mx/", title: "CT Internacional · Sitio oficial", claim: "Official corporate commerce site identifies CT Internacional and its technology portfolio.", summary: "CT Internacional operates an official Mexican technology channel site." }, { url: "https://infochannel.info/wp-content/uploads/2022/06/MAYORISTAS-RESULTADOS-2022.pdf", title: "InfoChannel · Mayoristas resultados", type: "Industry publication", claim: "Industry publication lists CT Internacional among Mexican technology wholesalers.", summary: "Independent channel coverage corroborates its wholesaler role.", status: "Corroborated", confidence: 84 }],
  }),
  makeCompany({
    id: "grupo-cva", name: "Grupo CVA", domain: "cva.com.mx", city: "Guadalajara", roles: ["Distributor", "VAD"], tier: "KA", supply: "TBD", fit: 91, value: 93, reach: 80, confidence: 92,
    summary: "墨西哥大型技术批发与增值分销节点。", stage: "Priority", priority: "High", owner: "María Chen", next: "准备供应能力与联合市场访谈", risks: ["供应商导入周期待确认"], unknowns: ["SMB Networking 增长目标"],
    sources: [{ url: "https://cva.com.mx/", title: "Grupo CVA · Mayorista de tecnología", claim: "Official site describes Grupo CVA as a technology wholesaler.", summary: "Grupo CVA presents itself as a Mexican technology wholesaler." }, { url: "https://infochannel.info/wp-content/uploads/2022/06/MAYORISTAS-RESULTADOS-2022.pdf", title: "InfoChannel · Mayoristas resultados", type: "Industry publication", claim: "Industry reporting covers Grupo CVA in Mexico's wholesaler landscape.", summary: "Industry coverage corroborates the distributor classification.", status: "Corroborated", confidence: 84 }],
  }),
  makeCompany({
    id: "exel", name: "Exel del Norte", legal: "Exel del Norte S.A.P.I. de C.V.", domain: "exel.com.mx", city: "Monterrey", roles: ["Distributor"], tier: "KA", supply: "TBD", fit: 90, value: 91, reach: 86, confidence: 95,
    summary: "官网明确描述其技术批发、全国分支、仓储与金融支持能力。", stage: "Priority", priority: "High", owner: "Diego Ruiz", next: "讨论北部市场试点与库存模型", risks: ["需验证无线与交换产品线空白"], unknowns: ["现有 Networking 厂牌绩效"],
    sources: [{ url: "https://www.exel.com.mx/acerca-de-exel", title: "Exel del Norte · Acerca de", claim: "Exel states it is a technology wholesaler with geographic coverage and branch warehouses.", summary: "Exel reports 17 strategically located branches with their own warehouses." }, { url: "https://www.exel.com.mx/contacto", title: "Exel del Norte · Contacto", claim: "Official contact page lists branches across Mexico.", summary: "The company lists offices in multiple Mexican cities.", status: "Corroborated", confidence: 94 }],
  }),
  makeCompany({
    id: "compusoluciones", name: "CompuSoluciones", domain: "compusoluciones.com", city: "Guadalajara", roles: ["Distributor", "VAD"], tier: "KA", supply: "TBD", fit: 89, value: 92, reach: 78, confidence: 93,
    summary: "增值技术批发节点，具备方案、商业和售前支持语境。", stage: "Qualified", priority: "High", owner: "Diego Ruiz", next: "确认 SMB Networking 方案负责人", risks: ["偏企业级方案，SMB 规模化匹配待验证"], unknowns: ["入门产品价格带接受度"],
    sources: [{ url: "https://www.compusoluciones.com/", title: "CompuSoluciones · Mayorista de Tecnología", claim: "Official site identifies CompuSoluciones as a technology wholesaler with commercial and presales support.", summary: "CompuSoluciones offers advanced IT solutions and partner support." }, { url: "https://www.compusoluciones.com/nosotros/", title: "CompuSoluciones · Nosotros", claim: "Official company page documents its operating history.", summary: "The company presents more than four decades in the technology channel.", status: "Corroborated", confidence: 93 }],
  }),
  makeCompany({
    id: "ingram", name: "Ingram Micro México", legal: "Ingram Micro México, S.A. de C.V.", domain: "ingrammicro.com", city: "Mexico City", roles: ["Distributor", "VAD"], tier: "KA", supply: "TBD", fit: 88, value: 96, reach: 74, confidence: 92,
    summary: "全球技术分销平台在墨西哥的本地节点，规模价值高但导入复杂。", stage: "Qualified", priority: "High", owner: "María Chen", next: "识别本地 Vendor Management 入口", risks: ["大厂商导入门槛与资源竞争"], unknowns: ["墨西哥本地 SMB 网络品类策略"],
    sources: [{ url: "https://careers.ingrammicro.com/es/ubicaciones/latam/mexico/", title: "Ingram Micro · Mexico", claim: "Official location page confirms Ingram Micro operations in Mexico.", summary: "Ingram Micro maintains a documented Mexico operation." }, { url: "https://www.ingrammicro.com/", title: "Ingram Micro · Corporate", claim: "Official corporate site describes its technology distribution platform.", summary: "Ingram Micro operates a global technology distribution platform.", status: "Corroborated", confidence: 90 }],
  }),
  makeCompany({
    id: "pch", name: "PCH Mayoreo", legal: "PCH Connect, S.A. de C.V.", domain: "pchconnect.com", city: "Guadalajara", roles: ["Distributor", "Reseller"], tier: "Priority", supply: "TBD", fit: 86, value: 82, reach: 86, confidence: 93,
    summary: "兼具批发与线上交易能力的技术分销候选。", stage: "Qualified", priority: "High", owner: "Sofía Vega", next: "验证经销商招募与电商履约能力", risks: ["批发与零售边界需商务确认"], unknowns: ["渠道专属价格政策"],
    sources: [{ url: "https://shop.pchconnect.com/quienes-somos", title: "PCH Connect · Quiénes somos", claim: "Official page describes PCH as one of Mexico's principal technology distributors.", summary: "PCH states it has over 21 years in Mexico's IT distribution market." }, { url: "https://shop.pchconnect.com/asociate", title: "PCH · Programa de socios", claim: "Official partner page addresses distributors and technology wholesalers.", summary: "PCH offers a partner path for technology channel buyers.", status: "Corroborated", confidence: 91 }],
  }),
  makeCompany({
    id: "syscom", name: "SYSCOM", domain: "syscom.mx", city: "Chihuahua", roles: ["Distributor", "VAD"], tier: "KA", supply: "TBD", fit: 94, value: 91, reach: 90, confidence: 96,
    summary: "网络、通信与安防品类高度邻近，具备技术支持和广泛配送覆盖。", stage: "Priority", priority: "High", owner: "Sofía Vega", next: "提出 Networking 增量品类与认证计划", risks: ["同类品牌组合拥挤"], unknowns: ["空白价格带与区域机会"],
    sources: [{ url: "https://www.syscom.mx/brand_categories/syscom", title: "SYSCOM · Mayorista tecnológico", claim: "Official site describes SYSCOM as a Mexican technology wholesaler with distribution centers and networking categories.", summary: "SYSCOM reports 24 distribution centers and a portfolio including IT networks and telecommunications." }, { url: "https://www.syscom.mx/", title: "SYSCOM · Sitio oficial", claim: "Official catalog shows networking and telecommunications categories.", summary: "The catalog directly supports product adjacency for networking.", status: "Corroborated", confidence: 95 }],
  }),
  makeCompany({
    id: "intcomex", name: "Intcomex México", domain: "intcomex.com", city: "Mexico City", roles: ["Distributor", "VAD"], tier: "KA", supply: "TBD", fit: 84, value: 89, reach: 72, confidence: 82,
    summary: "拉美技术分销平台的墨西哥市场候选，国家级细节仍需复核。", stage: "Discovered", next: "核验墨西哥实体与本地仓配能力", risks: ["公开覆盖页的墨西哥细节有限"], unknowns: ["墨西哥本地团队与库存点"],
    sources: [{ url: "https://www.intcomex.com/cobertura/", title: "Intcomex · Cobertura", claim: "Official coverage page describes Intcomex's value-added technology distribution network across Latin America and the Caribbean.", summary: "Intcomex reports regional distribution infrastructure and a large channel network." }],
  }),
  makeCompany({
    id: "team", name: "TEAM", domain: "teamnet.com.mx", city: "Mexico City", roles: ["Distributor", "VAD"], tier: "Priority", supply: "TBD", fit: 82, value: 80, reach: 69, confidence: 74,
    summary: "墨西哥技术渠道中的增值分销候选，需进一步验证网络产品线。", stage: "Discovered", next: "复核官网品牌与服务矩阵", risks: ["当前快照证据覆盖有限"], unknowns: ["Networking 产品与技术团队规模"],
    sources: [{ url: "https://www.teamnet.com.mx/", title: "TEAM · Sitio oficial", claim: "Official domain identifies TEAM's Mexican technology-channel presence.", summary: "TEAM maintains an official Mexican technology business site." }, { url: "https://infochannel.info/wp-content/uploads/2022/06/MAYORISTAS-RESULTADOS-2022.pdf", title: "InfoChannel · Mayoristas resultados", type: "Industry publication", claim: "Industry publication lists TEAM in the Mexican wholesaler landscape.", summary: "Independent channel reporting corroborates a distributor role.", status: "Corroborated", confidence: 78 }],
  }),
  makeCompany({
    id: "dc-mayorista", name: "DC Mayorista", domain: "dcm.com.mx", city: "Mexico City", roles: ["Distributor"], tier: "Priority", supply: "TBD", fit: 79, value: 75, reach: 70, confidence: 76,
    summary: "技术批发候选，适合补充价格与区域覆盖比较。", stage: "Discovered", next: "验证当前厂牌、库存与覆盖", risks: ["公开信息的新鲜度待确认"], unknowns: ["当前网络品类与分支覆盖"],
    sources: [{ url: "https://www.dcm.com.mx/", title: "DC Mayorista · Sitio oficial", claim: "Official domain identifies DC Mayorista's Mexican commercial presence.", summary: "DC Mayorista operates an official Mexican technology channel site." }],
  }),
  makeCompany({
    id: "grupo-loma", name: "Grupo Loma", legal: "Grupo Loma del Norte, S.A. de C.V.", domain: "gloma.mx", city: "Monterrey", roles: ["Distributor", "Reseller"], tier: "Standard", supply: "TBD", fit: 75, value: 69, reach: 74, confidence: 73,
    summary: "北部区域技术供货节点，适合用于全国与区域分销模式对比。", stage: "Discovered", next: "确认区域仓储、网络品牌与下级客户结构", risks: ["全国覆盖证据不足"], unknowns: ["网络设备销售占比"],
    sources: [{ url: "https://www.gloma.mx/", title: "Grupo Loma · Sitio oficial", claim: "Official domain identifies Grupo Loma's Mexican technology business.", summary: "Grupo Loma maintains a public official company site." }],
  }),

  makeCompany({
    id: "cyberpuerta", name: "Cyberpuerta", legal: "Cyberpuerta S.A. de C.V.", domain: "cyberpuerta.mx", city: "Guadalajara", roles: ["E-tailer", "Reseller"], tier: "KA", supply: "Distributor Supply", fit: 91, value: 94, reach: 82, confidence: 95,
    summary: "墨西哥头部技术电商候选，适合高可见度产品上市与线上需求验证。", stage: "Priority", priority: "High", owner: "Luis Ortega", next: "准备品类、内容与供货 SLA 提案", risks: ["价格透明度和履约要求高"], unknowns: ["Networking 类目负责人"],
    sources: [{ url: "https://www.cyberpuerta.mx/Quienes-somos/", title: "Cyberpuerta · Quiénes somos", claim: "Official page describes Cyberpuerta as a Mexican electronics e-commerce company operating since 2008.", summary: "Cyberpuerta presents itself as an established electronics e-commerce operator in Mexico." }, { url: "https://www.cyberpuerta.mx/", title: "Cyberpuerta · Tienda oficial", claim: "Official storefront carries technology and networking-related categories.", summary: "The public catalog supports e-tailer and technology adjacency classification.", status: "Corroborated", confidence: 94 }],
  }),
  makeCompany({
    id: "intercompras", name: "Intercompras", legal: "Intercompras Comercio Electrónico S.A. de C.V.", domain: "intercompras.com", city: "Hermosillo", roles: ["E-tailer", "Reseller", "VAR"], tier: "Priority", supply: "Distributor Supply", fit: 87, value: 80, reach: 88, confidence: 94,
    summary: "覆盖计算、服务器、网络和 POS 的技术电商与企业销售节点。", stage: "Qualified", priority: "High", owner: "Luis Ortega", next: "评估企业销售与网络类目联合活动", risks: ["主要流量品类与 SMB 网络需求需验证"], unknowns: ["B2B 客户结构"],
    sources: [{ url: "https://intercompras.com/nosotros", title: "Intercompras · Nosotros", claim: "Official page identifies the legal entity and over 20 years in Mexico's technology market.", summary: "Intercompras documents its Mexican e-commerce identity and operating history." }, { url: "https://intercompras.com/", title: "Intercompras · Catálogo", claim: "Official catalog states it offers computing, servers, networks and point-of-sale solutions.", summary: "The company publicly lists networking among more than 50,000 technology products.", status: "Corroborated", confidence: 94 }],
  }),
  makeCompany({
    id: "abasteo", name: "Abasteo", domain: "abasteo.mx", city: "Guadalajara", roles: ["E-tailer", "VAR", "Reseller"], tier: "Priority", supply: "Distributor Supply", fit: 84, value: 79, reach: 83, confidence: 93,
    summary: "面向企业采购的技术电商渠道，与 Cyberpuerta 供应体系有关联。", stage: "Qualified", owner: "Luis Ortega", next: "建立企业采购网络组合提案", risks: ["与关联渠道的客户边界待确认"], unknowns: ["中型企业网络项目占比"],
    sources: [{ url: "https://www.abasteo.mx/Quienes-somos/", title: "Abasteo · Quiénes somos", claim: "Official page describes Abasteo as a corporate-focused distribution channel of Cyberpuerta.", summary: "Abasteo focuses on enterprise customers with a dedicated technology portfolio." }],
  }),
  makeCompany({
    id: "ddtech", name: "DDTech", domain: "ddtech.mx", city: "Guadalajara", roles: ["E-tailer", "Dealer"], tier: "Priority", supply: "Distributor Supply", fit: 82, value: 78, reach: 86, confidence: 82,
    summary: "面向技术消费与组装市场的线上渠道，可测试入门网络组合。", stage: "Discovered", next: "验证网络类目流量和采购模式", risks: ["核心定位可能偏 PC 与游戏"], unknowns: ["SMB 网络客户占比"],
    sources: [{ url: "https://ddtech.mx/", title: "DDTech · Tienda oficial", claim: "Official storefront confirms a Mexican technology e-commerce operation.", summary: "DDTech operates a public technology catalog in Mexico." }],
  }),
  makeCompany({
    id: "pcel", name: "PCEL", domain: "pcel.com", city: "Monterrey", roles: ["E-tailer", "Dealer"], tier: "Priority", supply: "Distributor Supply", fit: 80, value: 76, reach: 84, confidence: 81,
    summary: "全国可访问的技术电商节点，适合北部市场和长尾需求测试。", stage: "Discovered", next: "确认企业销售与网络品类能力", risks: ["公开企业项目信息有限"], unknowns: ["B2B 销售团队与履约 SLA"],
    sources: [{ url: "https://pcel.com/", title: "PCEL · Tienda oficial", claim: "Official storefront confirms PCEL's Mexican technology retail operation.", summary: "PCEL publicly sells technology products through its Mexican e-commerce site." }],
  }),
  makeCompany({
    id: "digitalife", name: "Digitalife", domain: "digitalife.com.mx", city: "Guadalajara", roles: ["E-tailer", "Dealer"], tier: "Standard", supply: "Distributor Supply", fit: 76, value: 70, reach: 80, confidence: 78,
    summary: "区域起家的技术零售与线上节点，适合补充长尾渠道覆盖。", stage: "Discovered", next: "验证门店/线上覆盖与网络销售", risks: ["企业客户证据较少"], unknowns: ["网络类目深度"],
    sources: [{ url: "https://www.digitalife.com.mx/", title: "Digitalife · Tienda oficial", claim: "Official storefront confirms a Mexican technology retail operation.", summary: "Digitalife operates a public Mexican technology commerce site." }],
  }),
  makeCompany({
    id: "amazon-mx", name: "Amazon México", legal: "Servicios Comerciales Amazon México, S. de R.L. de C.V.", domain: "amazon.com.mx", city: "Mexico City", roles: ["E-tailer"], tier: "KA", supply: "Distributor Supply", fit: 79, value: 98, reach: 50, confidence: 96,
    summary: "高流量综合电商 KA，市场价值高但品牌入驻与销售控制复杂。", stage: "Discovered", next: "确认 Vendor Central/Marketplace 合适路径", risks: ["第三方卖家、价格和品牌授权治理复杂"], unknowns: ["目标类目直采资格"],
    sources: [{ url: "https://www.amazon.com.mx/", title: "Amazon México · Marketplace", claim: "Official Mexico storefront confirms the local e-commerce marketplace.", summary: "Amazon operates a localized public marketplace for Mexico." }],
  }),
  makeCompany({
    id: "mercado-libre", name: "Mercado Libre México", domain: "mercadolibre.com.mx", city: "Mexico City", roles: ["E-tailer"], tier: "KA", supply: "Distributor Supply", fit: 81, value: 97, reach: 55, confidence: 96,
    summary: "大型平台型电商 KA，适合需求验证但供货关系需通过卖家/官方店治理。", stage: "Discovered", next: "评估官方店与授权卖家模型", risks: ["渠道冲突与未经授权卖家"], unknowns: ["官方旗舰店准入条件"],
    sources: [{ url: "https://www.mercadolibre.com.mx/", title: "Mercado Libre México · Sitio oficial", claim: "Official localized site confirms Mercado Libre's Mexican marketplace operation.", summary: "Mercado Libre operates a large public e-commerce marketplace in Mexico." }],
  }),
  makeCompany({
    id: "office-depot", name: "Office Depot México", domain: "officedepot.com.mx", city: "Mexico City", roles: ["Retailer", "E-tailer"], tier: "KA", supply: "Distributor Supply", fit: 83, value: 91, reach: 76, confidence: 90,
    summary: "办公与技术品类零售 KA，具有 SMB 客群邻近度。", stage: "Qualified", owner: "Luis Ortega", next: "准备办公网络组合和门店/线上试点", risks: ["品类空间与供应条款严格"], unknowns: ["网络设备品类规模"],
    sources: [{ url: "https://www.officedepot.com.mx/officedepot/en/", title: "Office Depot México · Sitio oficial", claim: "Official storefront confirms Office Depot's Mexican retail and e-commerce operation.", summary: "Office Depot Mexico sells office and technology categories through stores and online." }],
  }),
  makeCompany({
    id: "liverpool", name: "Liverpool", legal: "El Puerto de Liverpool, S.A.B. de C.V.", domain: "liverpool.com.mx", city: "Mexico City", roles: ["Retailer", "E-tailer"], tier: "KA", supply: "Distributor Supply", fit: 78, value: 95, reach: 66, confidence: 93,
    summary: "全国百货零售 KA，并公开提供企业销售计划。", stage: "Discovered", next: "评估消费网络与企业采购双路径", risks: ["并非专业技术渠道"], unknowns: ["网络品类采购窗口"],
    sources: [{ url: "https://www.liverpool.com.mx/tienda/paginas/ventas-corporativas", title: "Liverpool · Ventas corporativas", claim: "Official page describes Liverpool for Business and corporate/wholesale sales.", summary: "Liverpool publicly offers a B2B corporate sales program." }],
  }),

  makeCompany({
    id: "alestra", name: "Alestra", domain: "alestra.mx", city: "Monterrey", roles: ["ISP", "MSP", "SI"], tier: "KA", supply: "Co-sell/Co-supply", involvement: "Deep", fit: 93, value: 95, reach: 66, confidence: 96,
    summary: "企业连接与托管网络 KA，可同时作为需求节点、集成商和联合交付伙伴。", stage: "Priority", priority: "High", owner: "Ana Torres", next: "设计 Managed LAN/WLAN 联合方案访谈", risks: ["大型项目销售周期长"], unknowns: ["设备 OEM 与采购策略"],
    sources: [{ url: "https://alestra.mx/es/telecom/", title: "Alestra · Telecom", claim: "Official page lists managed SD-WAN, LAN/WLAN and enterprise connectivity services.", summary: "Alestra offers managed network and enterprise connectivity services across Mexico." }, regulatorSource],
  }),
  makeCompany({
    id: "kio", name: "KIO Networks", domain: "kionetworks.com", city: "Mexico City", roles: ["MSP", "SI"], tier: "KA", supply: "Co-sell/Co-supply", involvement: "Deep", fit: 88, value: 90, reach: 68, confidence: 88,
    summary: "云、数据中心与托管网络能力邻近的大型服务节点。", stage: "Qualified", priority: "High", owner: "Ana Torres", next: "识别 Cloud Networking 与 Edge 场景", risks: ["产品切入需与服务架构匹配"], unknowns: ["网络硬件采购和标准化清单"],
    sources: [{ url: "https://www.kionetworks.com/", title: "KIO Networks · Sitio oficial", claim: "Official site confirms KIO's Mexican digital infrastructure and managed services presence.", summary: "KIO presents cloud, data-center and managed technology services." }, { url: "https://www.kionetworks.com/hubfs/BaconLab2021/09/Radiografia_nube%20en%20mexicoOK.pdf", title: "KIO · Cloud services overview", claim: "Official material lists managed compute and network services and cloud networking.", summary: "KIO documentation directly references managed network services.", status: "Corroborated", confidence: 88 }],
  }),
  makeCompany({
    id: "ikusi", name: "Ikusi México", domain: "ikusi.com", city: "Mexico City", roles: ["SI", "MSP"], tier: "KA", supply: "Co-sell/Co-supply", involvement: "Deep", fit: 91, value: 88, reach: 76, confidence: 95,
    summary: "网络、无线、协作和托管服务高度相关的系统集成节点。", stage: "Priority", priority: "High", owner: "Ana Torres", next: "围绕 SMB 分支模板和交付效率共创", risks: ["企业客户定位与 SMB 价格带差距"], unknowns: ["中端客户与渠道转售策略"],
    sources: [{ url: "https://www.ikusi.com/mx/", title: "Ikusi México · Servicios", claim: "Official Mexico page lists managed network, collaboration, cybersecurity and cloud operations.", summary: "Ikusi publicly describes network operations and wireless deployment work in Mexico." }, { url: "https://www.ikusi.com/mx/servicios/redes-empresariales/", title: "Ikusi · Redes empresariales", claim: "Official service page describes network design, implementation, managed operation and support.", summary: "Ikusi offers managed enterprise networking including routing, SD-LAN, SD-WLAN and SD-WAN.", status: "Corroborated", confidence: 96 }],
  }),
  makeCompany({
    id: "sonda", name: "SONDA México", domain: "sonda.com", city: "Mexico City", roles: ["SI", "MSP", "VAR"], tier: "KA", supply: "Co-sell/Co-supply", fit: 85, value: 89, reach: 65, confidence: 88,
    summary: "区域型数字化与技术集成商在墨西哥的本地节点。", stage: "Qualified", owner: "Ana Torres", next: "验证连接基础设施项目和渠道采购", risks: ["解决方案范围广，网络业务优先级未知"], unknowns: ["墨西哥 Networking 项目管线"],
    sources: [{ url: "https://www.sonda.com/mexico", title: "SONDA México · Sitio oficial", claim: "Official regional site confirms SONDA's operation in Mexico.", summary: "SONDA maintains a Mexico operation for technology solutions and services." }, { url: "https://www.sonda.com/detalle-noticia/2026/02/18/sonda-e-ifs-anuncian-alianza-estrategica-para-acelerar-la-transformacion-digital-de-las-empresas-en-mexico", title: "SONDA · Mexico alliance", claim: "Official news describes SONDA as a digital transformation and technology solutions provider in Mexico.", summary: "SONDA reports local enterprise technology integration activity.", status: "Corroborated", confidence: 87 }],
  }),
  makeCompany({
    id: "logicalis", name: "Logicalis México", domain: "logicalis.com", city: "Mexico City", roles: ["SI", "MSP", "VAR"], tier: "KA", supply: "Co-sell/Co-supply", fit: 89, value: 91, reach: 62, confidence: 86,
    summary: "全球网络与托管服务集成商的墨西哥节点，品牌协同价值高。", stage: "Qualified", priority: "High", owner: "Ana Torres", next: "核验本地客户段与供应商策略", risks: ["全球战略厂牌关系可能限制导入"], unknowns: ["墨西哥本地采购权限"],
    sources: [{ url: "https://www.la.logicalis.com/es-mx/", title: "Logicalis México · Sitio oficial", claim: "Official localized site confirms Logicalis operations for the Mexican market.", summary: "Logicalis maintains a Mexico-specific enterprise technology presence." }],
  }),
  makeCompany({
    id: "mainbit", name: "Mainbit", domain: "mainbit.com.mx", city: "Mexico City", roles: ["SI", "MSP", "VAR"], tier: "Priority", supply: "Distributor Supply", fit: 81, value: 78, reach: 76, confidence: 79,
    summary: "本地 IT 解决方案和服务节点，可测试公共与企业项目切入。", stage: "Discovered", next: "核验网络集成案例与采购渠道", risks: ["公开网络能力证据有限"], unknowns: ["网络工程团队规模"],
    sources: [{ url: "https://www.mainbit.com.mx/", title: "Mainbit · Sitio oficial", claim: "Official site confirms Mainbit's Mexican IT solutions and services operation.", summary: "Mainbit operates a public Mexican enterprise technology site." }],
  }),
  makeCompany({
    id: "scitum", name: "Scitum", domain: "scitum.com.mx", city: "Mexico City", roles: ["SI", "MSP"], tier: "Priority", supply: "Co-sell/Co-supply", fit: 79, value: 82, reach: 64, confidence: 82,
    summary: "安全服务能力突出的集成节点，适合安全网关与分支网络联合方案。", stage: "Discovered", next: "验证网络设备销售与托管边界", risks: ["核心业务偏网络安全"], unknowns: ["SMB 硬件组合需求"],
    sources: [{ url: "https://www.scitum.com.mx/", title: "Scitum · Sitio oficial", claim: "Official site confirms Scitum's Mexican cybersecurity services operation.", summary: "Scitum presents managed cybersecurity capabilities in Mexico." }],
  }),
  makeCompany({
    id: "softtek", name: "Softtek", domain: "softtek.com", city: "Monterrey", roles: ["SI", "MSP"], tier: "KA", supply: "Co-sell/Co-supply", fit: 72, value: 92, reach: 58, confidence: 86,
    summary: "大型 IT 服务公司，战略价值高但网络硬件邻近度需验证。", stage: "Discovered", next: "仅在边缘/托管基础设施场景下继续研究", risks: ["软件服务导向，硬件渠道适配可能低"], unknowns: ["网络基础设施服务采购需求"],
    sources: [{ url: "https://www.softtek.com/es/", title: "Softtek · Sitio oficial", claim: "Official site confirms Softtek's Mexico-founded global IT services operation.", summary: "Softtek publicly presents digital and IT services capabilities." }],
  }),

  makeCompany({
    id: "telmex", name: "TELMEX", legal: "Teléfonos de México, S.A.B. de C.V.", domain: "telmex.com", city: "Mexico City", roles: ["ISP", "MSP"], tier: "KA", supply: "Brand Direct", involvement: "Deep", fit: 94, value: 100, reach: 58, confidence: 98,
    summary: "全国大型 ISP 与企业服务 KA，应采用品牌深度参与和直供评估。", stage: "Priority", priority: "High", owner: "Carlos Li", next: "建立 Hiper Wi-Fi/SMB 设备技术发现清单", risks: ["运营商认证与采购周期复杂"], unknowns: ["CPE 认证窗口与年度采购周期"],
    sources: [{ url: "https://telmex.com/es/web/acerca-de-telmex/", title: "TELMEX · Acerca de", claim: "Official company page describes integrated connectivity, data-center and managed services in Mexico.", summary: "TELMEX presents a broad Mexican connectivity and enterprise technology platform." }, regulatorSource],
  }),
  makeCompany({
    id: "totalplay", name: "Totalplay", legal: "Total Play Telecomunicaciones, S.A.P.I. de C.V.", domain: "totalplay.com.mx", city: "Mexico City", roles: ["ISP"], tier: "KA", supply: "Brand Direct", involvement: "Deep", fit: 92, value: 96, reach: 62, confidence: 94,
    summary: "大型光纤 ISP KA，具备规模化 CPE 和企业网络机会。", stage: "Priority", priority: "High", owner: "Carlos Li", next: "验证 CPE、Wi-Fi 与企业分支采购路径", risks: ["运营商定制与认证成本"], unknowns: ["设备采购与 ODM 策略"],
    sources: [{ url: "https://www.totalplay.com.mx/", title: "Totalplay · Sitio oficial", claim: "Official site confirms Totalplay's Mexican internet service operation.", summary: "Totalplay publicly markets fiber-based connectivity services in Mexico." }, regulatorSource],
  }),
  makeCompany({
    id: "izzi", name: "izzi", legal: "Empresas Cablevisión, S.A.B. de C.V.", domain: "izzi.mx", city: "Mexico City", roles: ["ISP"], tier: "KA", supply: "Brand Direct", involvement: "Deep", fit: 91, value: 96, reach: 61, confidence: 97,
    summary: "全国大型固网运营商 KA，公开覆盖家庭与企业互联网服务。", stage: "Qualified", priority: "High", owner: "Carlos Li", next: "评估 Wi-Fi/CPE 与企业产品线切入", risks: ["认证、定制与供应规模要求高"], unknowns: ["网络设备采购窗口"],
    sources: [{ url: "https://www.izzi.mx/nosotros", title: "izzi · Nosotros", claim: "Official page describes izzi as a Mexican telecommunications provider serving households and businesses across many cities.", summary: "izzi reports internet, telephony and cable services with broad Mexican coverage." }, regulatorSource],
  }),
  makeCompany({
    id: "megacable", name: "Megacable", legal: "Megacable Holdings, S.A.B. de C.V.", domain: "megacable.com.mx", city: "Guadalajara", roles: ["ISP"], tier: "KA", supply: "Brand Direct", involvement: "Deep", fit: 90, value: 95, reach: 63, confidence: 96,
    summary: "大型固网运营商 KA，在全国大量城市运营互联网业务。", stage: "Qualified", priority: "High", owner: "Carlos Li", next: "准备区域覆盖与 CPE 技术对接假设", risks: ["大规模项目招标与认证周期"], unknowns: ["目标设备路线图"],
    sources: [{ url: "https://www.megacable.com.mx/nuestra-empresa", title: "Megacable · Nuestra empresa", claim: "Official company page describes Megacable's Mexican internet and telecom operations across more than 1,000 localities.", summary: "Megacable reports broad national locality coverage." }, regulatorSource],
  }),
  makeCompany({
    id: "mcm", name: "MCM Telecom", legal: "Megacable Comunicaciones de México, S.A. de C.V.", domain: "mcmtelecom.com.mx", city: "Mexico City", roles: ["ISP", "MSP"], tier: "Priority", supply: "Co-sell/Co-supply", involvement: "Deep", fit: 84, value: 83, reach: 70, confidence: 82,
    summary: "企业通信与托管服务节点，适合分支网络和联合服务路径。", stage: "Discovered", next: "确认并入集团后的品牌与采购结构", risks: ["品牌/集团整合状态需确认"], unknowns: ["独立采购权限"],
    sources: [{ url: "https://www.mcmtelecom.com.mx/", title: "MCM Telecom · Sitio oficial", claim: "Official domain identifies MCM Telecom's Mexican business connectivity operation.", summary: "MCM maintains a public enterprise telecom presence." }, regulatorSource],
  }),
  makeCompany({
    id: "flo", name: "Flō Networks", domain: "flonetworks.com", city: "Ciudad Juárez", roles: ["ISP", "MSP"], tier: "Priority", supply: "Co-sell/Co-supply", involvement: "Deep", fit: 86, value: 84, reach: 71, confidence: 90,
    summary: "跨境光纤、企业连接与托管服务提供商，适合北部和跨境场景。", stage: "Qualified", owner: "Carlos Li", next: "探索跨境分支、边缘与托管 Wi-Fi 场景", risks: ["客户偏企业与运营商，销售周期较长"], unknowns: ["接入设备标准清单"],
    sources: [{ url: "https://flonetworks.com/", title: "Flō Networks · Sitio oficial", claim: "Official site confirms Flō Networks' fiber infrastructure and connectivity services across Mexico and the United States.", summary: "Flō operates cross-border fiber and enterprise connectivity services." }, { url: "https://www.kionetworks.com/hubfs/IDC_Vendor%20Spotlight_Flo_Es.pdf", title: "IDC Vendor Spotlight · Flō Networks", type: "Industry publication", claim: "IDC material describes Flō's fiber, managed infrastructure and network services in Mexico.", summary: "Independent analysis corroborates its managed network and infrastructure role.", status: "Corroborated", confidence: 91 }],
  }),
  makeCompany({
    id: "cfe-internet", name: "CFE Internet para Todos", legal: "CFE Telecomunicaciones e Internet para Todos", domain: "cfeinternet.mx", city: "Mexico City", roles: ["ISP"], tier: "KA", supply: "Brand Direct", involvement: "Deep", fit: 78, value: 92, reach: 45, confidence: 87,
    summary: "公共连接项目型 ISP KA，潜在社会覆盖价值高但政府采购路径复杂。", stage: "Discovered", next: "确认公开采购与设备技术规范", risks: ["政府采购、政策与项目周期"], unknowns: ["适用采购批次与技术标准"],
    sources: [{ url: "https://cfeinternet.mx/", title: "CFE Internet para Todos · Sitio oficial", claim: "Official site confirms a Mexican public internet-service initiative.", summary: "CFE Internet para Todos publicly provides connectivity services in Mexico." }],
  }),
];

export const mexicoRelationships: ChannelRelationship[] = [
  { id: "rel-pch-abasteo", fromNode: "pch", toNode: "abasteo", type: "Potential supply", status: "Hypothesis", evidenceIds: [] },
  { id: "rel-ct-intercompras", fromNode: "ct-internacional", toNode: "intercompras", type: "Potential supply", status: "Hypothesis", evidenceIds: [] },
  { id: "rel-cva-cyberpuerta", fromNode: "grupo-cva", toNode: "cyberpuerta", type: "Potential supply", status: "Hypothesis", evidenceIds: [] },
  { id: "rel-syscom-ikusi", fromNode: "syscom", toNode: "ikusi", type: "Potential supply", status: "Hypothesis", evidenceIds: [] },
  { id: "rel-compu-sonda", fromNode: "compusoluciones", toNode: "sonda", type: "Co-sell", status: "Hypothesis", evidenceIds: [] },
  { id: "rel-cyber-abasteo", fromNode: "cyberpuerta", toNode: "abasteo", type: "Technology alliance", status: "Verified", evidenceIds: ["ev-abasteo-1"] },
  { id: "rel-mega-mcm", fromNode: "megacable", toNode: "mcm", type: "Technology alliance", status: "Verified", evidenceIds: ["ev-mcm-2"] },
];

export const snapshotMeta = {
  market: "Mexico",
  capturedAt,
  companyCount: mexicoCompanies.length,
  sourceCount: mexicoCompanies.reduce((total, company) => total + company.evidence.length, 0),
  note: "Public Data Snapshot · Sources are public company, regulator and industry pages. Role and relationship hypotheses require human validation.",
};
