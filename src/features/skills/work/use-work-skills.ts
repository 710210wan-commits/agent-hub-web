import { useCallback, useEffect, useReducer, useRef } from "react";

import type { WorkSkill, WorkSkillAccessLevel } from "./contracts";
import { WorkSkillsApiError, type WorkSkillsApi } from "./work-api";

export type WorkSkillsListState =
  | { kind: "loading" }
  | {
      allowedAccessLevels: WorkSkillAccessLevel[];
      kind: "success";
      skills: WorkSkill[];
    }
  | {
      allowedAccessLevels: WorkSkillAccessLevel[];
      kind: "refreshing";
      skills: WorkSkill[];
    }
  | {
      allowedAccessLevels: WorkSkillAccessLevel[] | null;
      error: WorkSkillsApiError;
      kind: "error";
      skills: WorkSkill[] | null;
    };

type WorkSkillsListAction =
  | { type: "work-skills-load-started" }
  | {
      allowedAccessLevels: WorkSkillAccessLevel[];
      skills: WorkSkill[];
      type: "work-skills-load-succeeded";
    }
  | { error: WorkSkillsApiError; type: "work-skills-load-failed" }
  | { skill: WorkSkill; type: "work-skills-enabled-updated" };

export function createInitialWorkSkillsState(): WorkSkillsListState {
  return { kind: "loading" };
}

export function reduceWorkSkillsState(
  state: WorkSkillsListState,
  action: WorkSkillsListAction,
): WorkSkillsListState {
  switch (action.type) {
    case "work-skills-load-started":
      return state.kind === "success" || state.kind === "refreshing"
        ? {
            allowedAccessLevels: state.allowedAccessLevels,
            kind: "refreshing",
            skills: state.skills,
          }
        : { kind: "loading" };
    case "work-skills-load-succeeded":
      return {
        allowedAccessLevels: action.allowedAccessLevels,
        kind: "success",
        skills: action.skills,
      };
    case "work-skills-load-failed":
      return {
        allowedAccessLevels:
          state.kind === "success" || state.kind === "refreshing" || state.kind === "error"
            ? state.allowedAccessLevels
            : null,
        error: action.error,
        kind: "error",
        skills:
          state.kind === "success" || state.kind === "refreshing" || state.kind === "error"
            ? state.skills
            : null,
      };
    case "work-skills-enabled-updated":
      return state.kind === "success" || state.kind === "refreshing"
        ? {
            allowedAccessLevels: state.allowedAccessLevels,
            kind: "success",
            skills: state.skills.map((skill) =>
              skill.slug === action.skill.slug ? { ...skill, ...action.skill } : skill,
            ),
          }
        : state;
  }
}

export interface UseWorkSkillsResult {
  refresh(): void;
  /** 启停后原地替换技能；失败抛错由调用方提示。 */
  setEnabled(slug: string, enabled: boolean): Promise<void>;
  state: WorkSkillsListState;
}

/**
 * Work Skill 列表状态。
 * identityGeneration 变化时取消旧请求并重新加载；页面层另以 key 重建清除选择与弹窗。
 */
export function useWorkSkills(
  api: WorkSkillsApi,
  identityGeneration: number,
): UseWorkSkillsResult {
  const [state, dispatch] = useReducer(
    reduceWorkSkillsState,
    undefined,
    createInitialWorkSkillsState,
  );
  const inFlightRef = useRef(false);
  const generationRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);

  const cancelCurrentLoad = useCallback(() => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
    inFlightRef.current = false;
  }, []);

  const load = useCallback(() => {
    if (inFlightRef.current) cancelCurrentLoad();
    inFlightRef.current = true;
    const generation = ++generationRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    dispatch({ type: "work-skills-load-started" });
    api
      .listSkills(abortController.signal)
      .then((envelope) => {
        if (generationRef.current !== generation) return;
        dispatch({
          allowedAccessLevels: envelope.allowed_access_levels,
          skills: envelope.data,
          type: "work-skills-load-succeeded",
        });
      })
      .catch((error: unknown) => {
        if (generationRef.current !== generation) return;
        dispatch({ error: asWorkSkillsApiError(error), type: "work-skills-load-failed" });
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        inFlightRef.current = false;
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = undefined;
        }
      });
  }, [api, cancelCurrentLoad]);

  useEffect(() => {
    load();
    return cancelCurrentLoad;
  }, [cancelCurrentLoad, identityGeneration, load]);

  const refresh = useCallback(() => {
    load();
  }, [load]);

  const setEnabled = useCallback(
    async (slug: string, enabled: boolean) => {
      const updated = await api.setSkillEnabled(slug, enabled);
      dispatch({ skill: updated, type: "work-skills-enabled-updated" });
    },
    [api],
  );

  return { refresh, setEnabled, state };
}

function asWorkSkillsApiError(error: unknown): WorkSkillsApiError {
  if (error instanceof WorkSkillsApiError) return error;
  return new WorkSkillsApiError({
    code: "WORK_SKILLS_UNKNOWN",
    message: error instanceof Error ? error.message : "Work Skill 请求失败",
    retryable: false,
    status: 0,
    userMessage: "Work Skill 请求失败，请稍后重试。",
  });
}
