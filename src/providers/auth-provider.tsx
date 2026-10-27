"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface DemoUser {
  id: string;
  name: string;
  workspace: string;
  initials: string;
}

interface AuthContextValue {
  user: DemoUser;
  getRequestHeaders: () => Record<string, string>;
}

const demoUser: DemoUser = {
  id: "demo-user",
  name: "演示用户",
  workspace: "办公空间",
  initials: "DE",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <AuthContext.Provider
      value={{ user: demoUser, getRequestHeaders: () => ({}) }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}
