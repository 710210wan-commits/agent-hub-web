"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createGlobalAuthClient,
  type GlobalAuthClient,
  type GlobalAuthUser,
} from "@/features/auth/global-auth-client";

/**
 * 全局统一登录态（设计：《Agent Hub 统一登录态与知识库桥接设计》）。
 *
 * 状态机：
 * - checking      挂载/操作中，等待 DSI 会话探测结果
 * - anonymous     无有效会话 → AuthBoundary 只渲染登录页
 * - demo          演示态：基础会话（无 xiaozhi token）；受保护MCP不请求，
 *                 知识库与对话页由页面内引导提示（后端 requireVerifiedDsiSession 硬约束）
 * - authenticated 完整态：已验证的 xiaozhi 会话
 * - error         服务不可达等可重试错误
 */
export type AuthStatus =
  | "checking"
  | "anonymous"
  | "demo"
  | "authenticated"
  | "error";

export type { GlobalAuthUser as AuthUser };

export interface AuthContextValue {
  status: AuthStatus;
  user?: GlobalAuthUser;
  errorMessage?: string;
  /** 登录/退出/失效/换身份时递增，供各页面重置本地状态 */
  identityGeneration: number;
  login(username: string, password: string): Promise<void>;
  loginDemo(): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
  invalidate(): void;
  /** 兼容旧接口：统一登录后浏览器靠 Cookie 鉴权，无需额外请求头 */
  getRequestHeaders(): Record<string, string>;
}

interface AuthState {
  status: AuthStatus;
  user?: GlobalAuthUser;
  errorMessage?: string;
}

/** 演示态下的占位用户（基础会话没有 xiaozhi 档案，仅用于侧栏展示） */
const DEMO_USER: GlobalAuthUser = {
  id: "demo",
  displayName: "演示模式",
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  client: clientOverride,
}: {
  children: ReactNode;
  client?: GlobalAuthClient;
}) {
  const defaultClient = useMemo(() => createGlobalAuthClient(), []);
  const client = clientOverride ?? defaultClient;
  const [state, setState] = useState<AuthState>({ status: "checking" });
  const [identityGeneration, setIdentityGeneration] = useState(0);
  const mountedRef = useRef(true);
  const operationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const lastIdentityRef = useRef<string | null>(null);

  const beginOperation = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    operationRef.current += 1;
    return { controller, operation: operationRef.current };
  }, []);

  const isCurrent = useCallback(
    (operation: number, signal: AbortSignal) =>
      mountedRef.current &&
      operationRef.current === operation &&
      !signal.aborted,
    [],
  );

  const applyIdentity = useCallback((user: GlobalAuthUser, demo: boolean) => {
    const identity = demo ? DEMO_USER.id : user.id;
    if (lastIdentityRef.current !== identity) {
      setIdentityGeneration((value) => value + 1);
    }
    lastIdentityRef.current = identity;
    setState(
      demo
        ? { status: "demo", user: DEMO_USER }
        : { status: "authenticated", user },
    );
  }, []);

  const clearConfirmedIdentity = useCallback((errorMessage?: string) => {
    if (lastIdentityRef.current !== null) {
      setIdentityGeneration((value) => value + 1);
    }
    lastIdentityRef.current = null;
    setState({ status: "anonymous", errorMessage });
  }, []);

  const applyStatusResult = useCallback(
    (result: { enabled: boolean; user?: GlobalAuthUser }) => {
      if (result.enabled && result.user) applyIdentity(result.user, false);
      else applyIdentity(DEMO_USER, true);
    },
    [applyIdentity],
  );

  const restore = useCallback(async () => {
    const { controller, operation } = beginOperation();
    setState({ status: "checking" });
    try {
      const result = await client.getAuthStatus(controller.signal);
      if (!isCurrent(operation, controller.signal)) return;
      applyStatusResult(result);
    } catch (error) {
      if (!isCurrent(operation, controller.signal)) return;
      if (isAuthRequired(error)) {
        clearConfirmedIdentity();
        return;
      }
      setState({
        status: "error",
        errorMessage: safeError(error, "无法连接登录服务，请稍后重试"),
      });
    }
  }, [applyStatusResult, beginOperation, clearConfirmedIdentity, client, isCurrent]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { controller, operation } = beginOperation();
      setState({ status: "checking" });
      try {
        const result = await client.login(
          { username, password },
          controller.signal,
        );
        if (!isCurrent(operation, controller.signal)) return;
        if (result.kind === "full") applyIdentity(result.user, false);
        else applyIdentity(DEMO_USER, true);
      } catch (error) {
        if (!isCurrent(operation, controller.signal)) return;
        clearConfirmedIdentity(safeError(error, "登录失败，请稍后重试"));
      }
    },
    [applyIdentity, beginOperation, clearConfirmedIdentity, client, isCurrent],
  );

  const loginDemo = useCallback(async () => {
    const { controller, operation } = beginOperation();
    setState({ status: "checking" });
    try {
      await client.loginDemo(controller.signal);
      if (!isCurrent(operation, controller.signal)) return;
      applyIdentity(DEMO_USER, true);
    } catch (error) {
      if (!isCurrent(operation, controller.signal)) return;
      if (isAuthRequired(error)) {
        clearConfirmedIdentity();
        return;
      }
      setState({
        status: "error",
        errorMessage: safeError(error, "无法连接登录服务，请稍后重试"),
      });
    }
  }, [applyIdentity, beginOperation, clearConfirmedIdentity, client, isCurrent]);

  const logout = useCallback(async () => {
    const { controller, operation } = beginOperation();
    setState({ status: "checking" });
    try {
      await client.logout(controller.signal);
      if (!isCurrent(operation, controller.signal)) return;
      clearConfirmedIdentity();
    } catch (error) {
      if (!isCurrent(operation, controller.signal)) return;
      setState({
        status: "error",
        errorMessage: safeError(error, "退出失败，请稍后重试"),
      });
    }
  }, [beginOperation, clearConfirmedIdentity, client, isCurrent]);

  const retry = useCallback(() => {
    void restore();
  }, [restore]);

  const invalidate = useCallback(() => {
    abortRef.current?.abort();
    operationRef.current += 1;
    clearConfirmedIdentity();
  }, [clearConfirmedIdentity]);

  useEffect(() => {
    mountedRef.current = true;
    // 初始状态已是 checking，挂载恢复无需再 setState（lint: set-state-in-effect）
    const { controller, operation } = beginOperation();
    void client
      .getAuthStatus(controller.signal)
      .then((result) => {
        if (!isCurrent(operation, controller.signal)) return;
        applyStatusResult(result);
      })
      .catch((error: unknown) => {
        if (!isCurrent(operation, controller.signal)) return;
        if (isAuthRequired(error)) {
          clearConfirmedIdentity();
          return;
        }
        setState({
          status: "error",
          errorMessage: safeError(error, "无法连接登录服务，请稍后重试"),
        });
      });
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [
    applyStatusResult,
    beginOperation,
    clearConfirmedIdentity,
    client,
    isCurrent,
  ]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      identityGeneration,
      login,
      loginDemo,
      logout,
      retry,
      invalidate,
      getRequestHeaders: () => ({}),
    }),
    [identityGeneration, invalidate, login, loginDemo, logout, retry, state],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return value;
}

function isAuthRequired(error: unknown): boolean {
  // 结构判断而非 instanceof：跨 bundle/测试替身场景更稳
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "AUTH_REQUIRED"
  );
}

function safeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
