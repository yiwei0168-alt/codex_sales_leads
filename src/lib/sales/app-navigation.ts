import { marketHref } from "./market-navigation";

export type AppView = "home" | "overview" | "results" | "map" | "customers" | "opportunities" | "assistant" | "tasks" | "knowledge" | "mailbox" | "settings" | "help";
export function viewHref(view: AppView, country = "all", company?: string): string {
  const query = new URLSearchParams({ country });
  if (company) query.set("company", company);
  if (view === "home") return "/";
  if (["overview", "results", "map", "customers"].includes(view)) {
    return marketHref(country, view === "customers" ? "customers" : view === "overview" ? "overview" : view === "map" ? "channel-map" : "leads") + (company ? `?company=${encodeURIComponent(company)}` : "");
  }
  if (["opportunities", "assistant"].includes(view)) {
    query.set("tab", view === "assistant" ? "letters" : "opportunities");
    return `/development?${query}`;
  }
  return `/${view}?${query}`;
}
