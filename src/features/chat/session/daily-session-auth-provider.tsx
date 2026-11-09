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

import { copy } from "@/config/copy";
import {
  DailySessionClientError,
  createDailySessionClient,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type { DailySessionUser } from "@/features/chat/transports/daily-session-contract";

export type DailySessionAuthStatus =
  | "checking"
  | "anonymous"
  | "authenticated"
  | "error";

export interface DailySessionAuthContextValue {
  status: DailySessionAuthStatus;
  user?: DailySessionUser;
  errorMessage?: string;
  identityGeneration: number;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
  invalidate(): void;
}

interface AuthState {
  status: DailySessionAuthStatus;
  user?: DailySessionUser;
  errorMessage?: string;
}

const DailySessionAuthContext =
  createContext<DailySessionAuthContextValue | null>(null);

export function DailySessionAuthProvider({
  children,
  client: clientOverride,
}: {
  children: ReactNode;
  client?: DailySessionClient;
}) {
  const defaultClient = useMemo(() => createDailySessionClient(), []);
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

  const applyIdentity = useCallback((user: DailySessionUser) => {
    if (lastIdentityRef.current !== user.id) {
      setIdentityGeneration((value) => value + 1);
    }
    lastIdentityRef.current = user.id;
    setState({ status: "authenticated", user });
  }, []);

  const clearConfirmedIdentity = useCallback((errorMessage?: string) => {
    if (lastIdentityRef.current !== null) {
      setIdentityGeneration((value) => value + 1);
    }
    lastIdentityRef.current = null;
    setState({ status: "anonymous", errorMessage });
  }, []);

  const restore = useCallback(async () => {
    const { controller, operation } = beginOperation();
    setState({ status: "checking" });
    try {
      const result = await client.getAuthStatus(controller.signal);
      if (!isCurrent(operation, controller.signal)) return;
      if (result.enabled) applyIdentity(result.user);
      else clearConfirmedIdentity();
    } catch (error) {
      if (!isCurrent(operation, controller.signal)) return;
      if (isAuthRequired(error)) {
        clearConfirmedIdentity();
        return;
      }
      setState({
        status: "error",
        errorMessage: safeError(error, copy.dailySessionAuth.restoreFailed),
      });
    }
  }, [applyIdentity, beginOperation, clearConfirmedIdentity, client, isCurrent]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { controller, operation } = beginOperation();
      setState({ status: "checking" });
      try {
        const user = await client.login({ username, password }, controller.signal);
        if (!isCurrent(operation, controller.signal)) return;
        applyIdentity(user);
      } catch (error) {
        if (!isCurrent(operation, controller.signal)) return;
        clearConfirmedIdentity(
          safeError(error, copy.dailySessionAuth.loginFailed),
        );
      }
    },
    [applyIdentity, beginOperation, clearConfirmedIdentity, client, isCurrent],
  );

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
        errorMessage: safeError(error, copy.dailySessionAuth.logoutFailed),
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
    const { controller, operation } = beginOperation();
    void client
      .getAuthStatus(controller.signal)
      .then((result) => {
        if (!isCurrent(operation, controller.signal)) return;
        if (result.enabled) applyIdentity(result.user);
        else clearConfirmedIdentity();
      })
      .catch((error: unknown) => {
        if (!isCurrent(operation, controller.signal)) return;
        if (isAuthRequired(error)) {
          clearConfirmedIdentity();
          return;
        }
        setState({
          status: "error",
          errorMessage: safeError(error, copy.dailySessionAuth.restoreFailed),
        });
      });
    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      abortRef.current?.abort();
    };
  }, [
    applyIdentity,
    beginOperation,
    clearConfirmedIdentity,
    client,
    isCurrent,
  ]);

  const value = useMemo<DailySessionAuthContextValue>(
    () => ({
      ...state,
      identityGeneration,
      login,
      logout,
      retry,
      invalidate,
    }),
    [identityGeneration, invalidate, login, logout, retry, state],
  );

  return (
    <DailySessionAuthContext.Provider value={value}>
      {children}
    </DailySessionAuthContext.Provider>
  );
}

export function useDailySessionAuth(): DailySessionAuthContextValue {
  const value = useContext(DailySessionAuthContext);
  if (!value) {
    throw new Error(
      "useDailySessionAuth 必须在 DailySessionAuthProvider 内使用",
    );
  }
  return value;
}

function isAuthRequired(error: unknown): boolean {
  return (
    error instanceof DailySessionClientError && error.code === "AUTH_REQUIRED"
  );
}

function safeError(error: unknown, fallback: string): string {
  return error instanceof DailySessionClientError ? error.message : fallback;
}
