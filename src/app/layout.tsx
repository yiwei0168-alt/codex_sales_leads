import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Network Channel Copilot",
  description: "AI-assisted channel discovery and development workspace demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
