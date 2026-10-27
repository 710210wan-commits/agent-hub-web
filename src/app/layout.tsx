import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "智能体平台",
  description: "统一智能体能力前端",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AuthProvider>
          <Suspense fallback={null}>
            <ModeProvider>{children}</ModeProvider>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
