"use client";

import type { ReactNode } from "react";

import { useAuth } from "@/providers/auth-provider";

import { LoginPage } from "./login-page";

/**
 * 统一登录边界：挂在根布局，按全局登录态决定渲染内容。
 * - checking      → 加载提示（避免业务页闪现）
 * - error         → 登录服务不可达 + 重试
 * - anonymous     → 只渲染统一登录页（不渲染 AppShell/导航/业务路由）
 * - demo / authenticated → 放行业务内容
 */
export function AuthBoundary({ children }: { children: ReactNode }) {
  const { status, errorMessage, retry } = useAuth();

  if (status === "checking") {
    return (
      <div className="auth-gate" role="status">
        <p className="auth-gate-message">正在确认登录状态…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="auth-gate" role="alert">
        <p className="auth-gate-message">
          {errorMessage ?? "无法连接登录服务，请稍后重试"}
        </p>
        <button
          className="kb-primary-button auth-gate-retry"
          onClick={retry}
          type="button"
        >
          重试
        </button>
      </div>
    );
  }

  if (status === "anonymous") {
    return <LoginPage />;
  }

  return <>{children}</>;
}
