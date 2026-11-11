"use client";

import { useAuth } from "@/providers/auth-provider";

/**
 * 知识库未登录引导卡片（替代原 KbLoginGate 的独立登录表单）。
 * 不在此处登录：统一登录由全站登录页负责，这里只引导回去。
 */
export function KbAuthNotice() {
  const { invalidate } = useAuth();

  return (
    <div className="kb-login-gate">
      <div className="kb-detail-panel kb-login-card">
        <h1>登录后使用知识库</h1>
        <p className="kb-detail-description">
          知识库按账号隔离，登录一次全站通用（含对话、知识库）。
        </p>
        <button
          className="kb-primary-button"
          onClick={() => invalidate()}
          type="button"
        >
          去登录
        </button>
      </div>
    </div>
  );
}
