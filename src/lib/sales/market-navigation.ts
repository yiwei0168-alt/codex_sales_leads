const names = new Map<string, string>();
for (const locale of ["en", "zh-CN", "es", "fr", "de"]) {
  const display = new Intl.DisplayNames([locale], { type: "region" });
  for (let first = 65; first <= 90; first++) for (let second = 65; second <= 90; second++) {
    const code = String.fromCharCode(first, second);
    const name = display.of(code);
    if (name && name !== code) names.set(name.toLowerCase(), code);
  }
}

export function marketCode(country: string): string {
  const value = country.trim();
  if (value.toLowerCase() === "uk") return "GB";
  return names.get(value.toLowerCase()) ?? (/^[a-z]{2}$/i.test(value) ? value.toUpperCase() : value || "unknown");
}

export function marketLabel(code: string): string {
  if (code === "all") return "全部国家";
  if (code === "unknown") return "国家未明确";
  return /^[A-Z]{2}$/.test(code) ? new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code) ?? code : code;
}

export function marketHref(country: string, section: "leads" | "channel-map" | "opportunities"): string {
  return `/markets/${encodeURIComponent(marketCode(country))}/${section}`;
}
