import type { Metadata } from "next";
import "./globals.css";
import "./ipados.css";
import "./conversation-theme.css";

export const metadata: Metadata = {
  title: "Network Channel Copilot",
  description: "AI-assisted channel discovery and development workspace demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="conversation-theme">{children}</body>
    </html>
  );
}
