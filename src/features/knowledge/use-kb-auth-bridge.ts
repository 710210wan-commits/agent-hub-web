"use client";

import { useEffect, useRef } from "react";

import { setKbUnauthorizedHandler } from "@/lib/kb-api";
import { useAuth } from "@/providers/auth-provider";

/**
 * 知识库 × 全局登录态桥接（Task 6）。
 *
 * 知识库接口 401 时分流（按调用时刻的真实状态判断，用 ref 规避挂载竞态）：
 * - 完整登录态（authenticated）：会话/令牌确实失效 → auth.invalidate()，全局回登录页
 * - 其余（demo/checking/anonymous）：不动作。
 *   演示态的 401 只是「会话没有 xiaozhi token」的必然结果，由页面渲染引导卡片；
 *   checking 期间收到 401 说明会话本已失效，登录态恢复流程会落到 anonymous，
 *   AuthBoundary 自然渲染登录页，无需此处插手。
 */
export function useKbAuthBridge(): void {
  const { status, invalidate } = useAuth();
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    setKbUnauthorizedHandler(() => {
      if (statusRef.current === "authenticated") {
        invalidate();
      }
    });
    return () => setKbUnauthorizedHandler(null);
  }, [invalidate]);
}
