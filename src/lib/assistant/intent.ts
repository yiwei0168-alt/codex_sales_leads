import type { AssistantIntent, LeadSearchPlan } from "./types";

const ISO_CODES = `AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW`.split(" ");
const DISPLAY_LOCALES = ["zh-CN", "en", "es", "fr", "de", "pt", "ar", "ru", "ja", "ko"];

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "").trim();
}

const aliases: Record<string, string> = {
  usa: "US", us: "US", america: "US", 美国: "US", 美利坚: "US",
  uk: "GB", britain: "GB", england: "GB", 英国: "GB", 英格兰: "GB",
  uae: "AE", 阿联酋: "AE", 迪拜: "AE",
  korea: "KR", southkorea: "KR", 韩国: "KR",
  russia: "RU", 俄罗斯: "RU", 俄国: "RU",
  vietnam: "VN", 越南: "VN", taiwan: "TW", 台湾: "TW",
  hongkong: "HK", 香港: "HK", macau: "MO", 澳门: "MO",
  czechrepublic: "CZ", 捷克: "CZ", ivorycoast: "CI", 科特迪瓦: "CI",
};

const countryNames = new Map<string, { code: string; name: string }>();
for (const locale of DISPLAY_LOCALES) {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  for (const code of ISO_CODES) {
    const name = display.of(code);
    if (name) countryNames.set(normalize(name), { code, name });
  }
}
for (const [name, code] of Object.entries(aliases)) countryNames.set(normalize(name), { code, name });

export function resolveCountry(text: string): { countryCode: string; countryName: string } | null {
  const normalized = normalize(text);
  const match = [...countryNames.entries()].filter(([name]) => name.length >= 2 && normalized.includes(name))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!match) return null;
  const code = match[1].code;
  const countryName = new Intl.DisplayNames([/[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en"], { type: "region" }).of(code) ?? code;
  return { countryCode: code, countryName };
}

const roleSignals: Array<{ role: string; pattern: RegExp }> = [
  { role: "Distributor", pattern: /分销商|distributor|mayorista/i },
  { role: "VAD", pattern: /\bvad\b|增值分销/i },
  { role: "VAR", pattern: /\bvar\b|增值经销/i },
  { role: "Dealer", pattern: /经销商|dealer/i },
  { role: "Reseller", pattern: /转售商|reseller/i },
  { role: "Retailer", pattern: /零售商|retailer|retail/i },
  { role: "E-tailer", pattern: /电商|e-?tailer/i },
  { role: "SI", pattern: /系统集成|集成商|\bsi\b|system integrator/i },
  { role: "Installer", pattern: /安装商|installer/i },
  { role: "MSP", pattern: /托管服务|\bmsp\b|managed service/i },
  { role: "ISP", pattern: /互联网服务|网络运营商|\bisp\b|\bwisp\b|internet service provider/i },
];

export function interpretAssistantRequest(text: string): { intent: AssistantIntent; plan?: LeadSearchPlan; reply?: string } {
  const compact = text.trim();
  if (/^(你好|您好|嗨|hello|hi|hey)[！!。.，,\s]*$/i.test(compact) || /你能做什么|有什么功能|how can you help/i.test(compact)) {
    return {
      intent: "general",
      reply: "你好！我可以基于产品、公司和邮箱学习知识回答问题并附上引用；也可以理解你指定的国家、渠道角色和数量，先生成销售线索计划，等你确认后再调用外部搜索并保存、去重和评分。",
    };
  }
  const country = resolveCountry(text);
  const searchSignal = /搜索|寻找|查找|发现|开发.{0,8}(?:客户|渠道|线索)|销售线索|search|find|discover|sales leads?/i.test(text);
  if (!searchSignal) return { intent: "knowledge-question" };
  if (!country) return {
    intent: "clarification",
    reply: "我可以先为你生成销售线索搜索计划。请补充目标国家或市场，例如“搜索德国的分销商和系统集成商”。",
  };
  const roles = roleSignals.filter((item) => item.pattern.test(text)).map((item) => item.role);
  const countMatch = text.match(/(?:前|搜索|寻找|find|top)\s*(\d{1,3})\s*(?:家|个|companies?|leads?)|(?<!\d)(\d{1,3})\s*(?:家|个|companies?|leads?)/i);
  const targetCount = Math.max(1, Math.min(Number(countMatch?.[1] ?? countMatch?.[2] ?? 20), 100));
  const objective = /已有|现有.{0,8}分销|existing distributor|增长|growth/i.test(text)
    ? "existing-distributor-growth" as const : "new-market" as const;
  return {
    intent: "lead-search",
    plan: {
      ...country,
      objective,
      roles: roles.length ? roles : ["Distributor", "VAD", "VAR", "Retailer", "SI", "MSP", "ISP"],
      targetCount,
      queryLanguage: /[\u3400-\u9fff]/.test(text) ? "zh-CN" : "en",
      userRequest: text,
    },
  };
}
