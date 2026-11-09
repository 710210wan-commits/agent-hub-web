"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { copy } from "@/config/copy";
import { useDailySessionAuth } from "@/features/chat/session/daily-session-auth-provider";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";

export function DailySessionAuthGate({ children }: { children: ReactNode }) {
  const auth = useDailySessionAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (auth.status === "checking") {
    return <LoadingState label={copy.dailySessionAuth.checking} />;
  }

  if (auth.status === "error") {
    return (
      <section className="daily-session-auth-card">
        <ErrorState
          message={auth.errorMessage ?? copy.dailySessionAuth.restoreFailed}
        />
        <button className="secondary-button" onClick={auth.retry} type="button">
          {copy.dailySessionAuth.retry}
        </button>
      </section>
    );
  }

  if (auth.status === "anonymous") {
    const submit = (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const submittedPassword = password;
      setPassword("");
      void auth.login(username.trim(), submittedPassword);
    };
    return (
      <section className="state-card daily-session-auth-card">
        <h2>{copy.dailySessionAuth.title}</h2>
        <p>{copy.dailySessionAuth.description}</p>
        <form onSubmit={submit}>
          <label>
            <span>{copy.dailySessionAuth.username}</span>
            <input
              autoComplete="username"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            <span>{copy.dailySessionAuth.password}</span>
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {auth.errorMessage ? (
            <div className="inline-error" role="alert">
              {auth.errorMessage}
            </div>
          ) : null}
          <button className="primary-button" type="submit">
            {copy.dailySessionAuth.login}
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="daily-session-authenticated">
      <div className="daily-session-auth-user">
        <span>{auth.user?.displayName}</span>
        <button className="text-button" onClick={() => void auth.logout()} type="button">
          {copy.dailySessionAuth.logout}
        </button>
      </div>
      {children}
    </div>
  );
}
