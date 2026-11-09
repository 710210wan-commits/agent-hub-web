"use client";

import { useState, type FormEvent } from "react";

import { KbApiError, kbErrorMessage, loginKbSession } from "@/lib/kb-api";

/**
 * 知识库未登录时的登录卡片（过渡方案：DSI 会话）。
 * 登录成功后整页刷新，让页面重新请求 /api/kb/* 并带上新会话 cookie。
 */
export function KbLoginGate() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!username.trim() || !password) {
      setError("请输入用户名和密码");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await loginKbSession(username.trim(), password);
      window.location.reload();
    } catch (raw) {
      const message =
        raw instanceof KbApiError && raw.kind === "unauthorized"
          ? "用户名或密码错误"
          : kbErrorMessage(raw);
      setError(message);
      setBusy(false);
    }
  }

  return (
    <div className="kb-login-gate">
      <form className="kb-detail-panel kb-login-card" onSubmit={handleSubmit}>
        <h1>登录后使用知识库</h1>
        <p className="kb-detail-description">
          知识库按账号隔离，需要先登录。
        </p>

        <label className="kb-login-field">
          <span>用户名</span>
          <input
            autoComplete="username"
            disabled={busy}
            onChange={(event) => setUsername(event.target.value)}
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
            onChange={(event) => setPassword(event.target.value)}
            placeholder="请输入密码"
            type="password"
            value={password}
          />
        </label>

        {error ? <div className="kb-notice is-error">{error}</div> : null}

        <button className="kb-primary-button" disabled={busy} type="submit">
          {busy ? "正在登录…" : "登录"}
        </button>

        <p className="kb-login-hint">
          过渡方案：当前使用 DSI 会话登录。统一登录方案确定后会替换为平台单点登录。
        </p>
      </form>
    </div>
  );
}
