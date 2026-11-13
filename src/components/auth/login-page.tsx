"use client";

import { useState, type FormEvent } from "react";

import { useAuth } from "@/providers/auth-provider";

/**
 * 全站统一登录页（AuthBoundary 在 anonymous 态渲染）。
 *
 * 双入口：
 * - 账号登录：xiaozhi 账号密码 → 完整态（对话/知识库可用）
 * - 演示模式：DSI 基础会话 → 演示态（Skill/MCP/工作/设置可用；
 *   面向未部署 xiaozhi 的开发与演示场景）
 *
 * 不改动 URL：登录成功后 AuthBoundary 直接放行原页面，天然实现"回跳原目标"。
 */
export function LoginPage() {
  const { login, loginDemo, status, errorMessage } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const busy = status === "checking";
  const error = localError || errorMessage || "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) {
      setLocalError("请输入用户名和密码");
      return;
    }
    setLocalError("");
    await login(username.trim(), password);
  }

  async function handleDemo() {
    if (busy) return;
    setLocalError("");
    await loginDemo();
  }

  return (
    <div className="auth-login">
      <form
        className="kb-detail-panel kb-login-card"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <h1>登录</h1>
        <p className="kb-detail-description">
          登录后使用对话与知识库；其他能力可进入演示模式体验。
        </p>

        <label className="kb-login-field">
          <span>用户名</span>
          <input
            autoComplete="username"
            disabled={busy}
            onChange={(event) => {
              setUsername(event.target.value);
              setLocalError("");
            }}
            placeholder="请输入用户名"
            type="text"
            value={username}
          />
        </label>

        <label className="kb-login-field">
          <span>密码</span>
          <input
            autoComplete="current-password"
            disabled={busy}
            onChange={(event) => {
              setPassword(event.target.value);
              setLocalError("");
            }}
            placeholder="请输入密码"
            type="password"
            value={password}
          />
        </label>

        {error ? (
          <div className="kb-notice is-error" role="alert">
            {error}
          </div>
        ) : null}

        <button className="kb-primary-button" disabled={busy} type="submit">
          {busy ? "正在登录…" : "登录"}
        </button>

        <button
          className="auth-demo-button"
          disabled={busy}
          onClick={() => void handleDemo()}
          type="button"
        >
          暂不登录，不使用知识库
        </button>

        <p className="kb-login-hint">不使用知识库功能可不登录，无需账号。</p>
      </form>
    </div>
  );
}
