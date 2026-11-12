"use client";

import { useAuth } from "@/providers/auth-provider";

export function DailySessionAuthNotice() {
  const { status, invalidate } = useAuth();

  if (status !== "demo") return null;

  return (
    <div className="kb-login-gate">
      <div className="kb-detail-panel kb-login-card">
        <h1>完整登录后使用日常会话</h1>
        <p className="kb-detail-description">
          演示模式不包含持久会话身份。完整登录后可查看和管理日常历史。
        </p>
        <button className="kb-primary-button" onClick={invalidate} type="button">
          去登录
        </button>
      </div>
    </div>
  );
}
