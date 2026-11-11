import {
  buildInstallDraftConfirmPath,
  buildInstallDraftPath,
  buildSkillFileUrlPath,
  buildSkillPath,
  parseBatchDeleteResults,
  parseInstallConfirmResults,
  parseInstallDraft,
  parseRemoteSkillList,
  parseRemoteSearchResults,
  parseSimpleSuccess,
  parseWorkErrorDetail,
  parseWorkSkillFile,
  parseWorkSkillListEnvelope,
  parseWorkSkillMutation,
  WORK_SKILL_API_PATHS,
  type RemoteSearchResult,
  type RemoteSkillOption,
  type WorkSkill,
  type WorkSkillBatchResultItem,
  type WorkSkillFile,
  type WorkSkillInstallDraft,
  type WorkSkillListEnvelope,
  type WorkSkillShareConfig,
} from "./contracts";

/** 同源 Work Skill BFF 路径（浏览器只访问这个前缀）。 */
export const WORK_SKILLS_BFF_BASE = "/api/work-skills";

export class WorkSkillsApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly userMessage: string;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    status: number;
    userMessage: string;
  }) {
    super(input.message);
    this.name = "WorkSkillsApiError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.status = input.status;
    this.userMessage = input.userMessage;
  }
}

export interface WorkSkillsApi {
  listSkills(signal?: AbortSignal): Promise<WorkSkillListEnvelope>;
  getSkillFile(slug: string, path: string, signal?: AbortSignal): Promise<WorkSkillFile>;
  setSkillEnabled(slug: string, enabled: boolean, signal?: AbortSignal): Promise<WorkSkill>;
  deleteSkill(slug: string, signal?: AbortSignal): Promise<void>;
  deleteSkillsBatch(slugs: string[], signal?: AbortSignal): Promise<WorkSkillBatchResultItem[]>;
  prepareSkillUpload(file: Blob, signal?: AbortSignal): Promise<WorkSkillInstallDraft>;
  listRemoteSkills(source: string, signal?: AbortSignal): Promise<RemoteSkillOption[]>;
  searchRemoteSkills(query: string, signal?: AbortSignal): Promise<RemoteSearchResult[]>;
  prepareRemoteSkills(
    source: string,
    skills: string[],
    signal?: AbortSignal,
  ): Promise<WorkSkillInstallDraft>;
  confirmInstallDraft(
    draftId: string,
    shareConfig: WorkSkillShareConfig,
    signal?: AbortSignal,
  ): Promise<WorkSkillBatchResultItem[]>;
  discardInstallDraft(draftId: string, signal?: AbortSignal): Promise<void>;
  /** 导出 ZIP：返回二进制与文件名（由页面触发浏览器下载）。 */
  exportSkill(slug: string, signal?: AbortSignal): Promise<{ blob: Blob; filename: string }>;
}

export interface WorkSkillsApiOptions {
  basePath?: string;
  fetchImpl?: typeof fetch;
}

const JSON_HEADERS = { accept: "application/json", "content-type": "application/json" } as const;

export function createWorkSkillsApi(
  options: WorkSkillsApiOptions = {},
): WorkSkillsApi {
  const basePath = options.basePath ?? WORK_SKILLS_BFF_BASE;
  const fetchImpl = options.fetchImpl ?? fetch;

  async function send<T>(
    path: string,
    init: RequestInit,
    parse: (payload: unknown) => T,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(`${basePath}${path}`, {
        credentials: "same-origin",
        ...init,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new WorkSkillsApiError({
        code: "WORK_SKILLS_NETWORK",
        message: "Work Skill 网络请求失败",
        retryable: true,
        status: 0,
        userMessage: "无法连接 Work Skill 服务，请检查网络后重试。",
      });
    }
    const payload = await readJsonPayload(response);
    if (!response.ok) throw mapWorkSkillsError(response.status, payload);
    return parse(payload);
  }

  async function sendVoid(path: string, init: RequestInit): Promise<void> {
    await send(path, init, parseSimpleSuccess);
  }

  return {
    listSkills: (signal) =>
      send(WORK_SKILL_API_PATHS.list, { headers: { accept: "application/json" }, signal }, parseWorkSkillListEnvelope),

    getSkillFile: (slug, path, signal) =>
      send(buildSkillFileUrlPath(slug, path), { headers: { accept: "application/json" }, signal }, parseWorkSkillFile),

    setSkillEnabled: (slug, enabled, signal) =>
      send(
        buildSkillPath(slug, "/enabled"),
        { body: JSON.stringify({ enabled }), headers: JSON_HEADERS, method: "PUT", signal },
        parseWorkSkillMutation,
      ),

    deleteSkill: (slug, signal) => sendVoid(buildSkillPath(slug), { method: "DELETE", signal }),

    deleteSkillsBatch: (slugs, signal) =>
      send(
        WORK_SKILL_API_PATHS.deleteBatch,
        { body: JSON.stringify({ slugs }), headers: JSON_HEADERS, method: "POST", signal },
        parseBatchDeleteResults,
      ),

    prepareSkillUpload: (file, signal) => {
      const form = new FormData();
      form.append("file", file);
      return send(
        WORK_SKILL_API_PATHS.uploadPrepare,
        { body: form, method: "POST", signal },
        parseInstallDraft,
      );
    },

    listRemoteSkills: (source, signal) =>
      send(
        WORK_SKILL_API_PATHS.remoteList,
        { body: JSON.stringify({ source }), headers: JSON_HEADERS, method: "POST", signal },
        parseRemoteSkillList,
      ),

    searchRemoteSkills: (query, signal) =>
      send(
        WORK_SKILL_API_PATHS.remoteSearch,
        { body: JSON.stringify({ query }), headers: JSON_HEADERS, method: "POST", signal },
        parseRemoteSearchResults,
      ),

    prepareRemoteSkills: (source, skills, signal) =>
      send(
        WORK_SKILL_API_PATHS.remotePrepare,
        { body: JSON.stringify({ source, skills }), headers: JSON_HEADERS, method: "POST", signal },
        parseInstallDraft,
      ),

    confirmInstallDraft: (draftId, shareConfig, signal) =>
      send(
        buildInstallDraftConfirmPath(draftId),
        { body: JSON.stringify({ share_config: shareConfig }), headers: JSON_HEADERS, method: "POST", signal },
        parseInstallConfirmResults,
      ),

    discardInstallDraft: (draftId, signal) =>
      sendVoid(buildInstallDraftPath(draftId), { method: "DELETE", signal }),

    exportSkill: async (slug, signal) => {
      let response: Response;
      try {
        response = await fetchImpl(`${basePath}${buildSkillPath(slug, "/export")}`, {
          credentials: "same-origin",
          signal,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new WorkSkillsApiError({
          code: "WORK_SKILLS_NETWORK",
          message: "Work Skill 网络请求失败",
          retryable: true,
          status: 0,
          userMessage: "无法连接 Work Skill 服务，请检查网络后重试。",
        });
      }
      if (!response.ok) {
        const payload = await readJsonPayload(response);
        throw mapWorkSkillsError(response.status, payload);
      }
      const blob = await response.blob();
      const filename =
        filenameFromContentDisposition(response.headers.get("content-disposition")) ?? `${slug}.zip`;
      return { blob, filename };
    },
  };
}

let browserApi: WorkSkillsApi | null = null;

export function getBrowserWorkSkillsApi(): WorkSkillsApi {
  browserApi ??= createWorkSkillsApi();
  return browserApi;
}

/** 解析 Content-Disposition 文件名（优先 RFC 5987 filename*）。 */
export function filenameFromContentDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return undefined;
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  return plain?.[1];
}

export function mapWorkSkillsError(status: number, payload: unknown): WorkSkillsApiError {
  const upstreamMessage = parseWorkErrorDetail(payload);
  const bodyCode =
    payload && typeof payload === "object"
      ? (payload as { code?: unknown }).code
      : undefined;
  const code = typeof bodyCode === "string" && bodyCode ? bodyCode : `WORK_SKILLS_HTTP_${status}`;
  const sessionInvalid =
    code === "WORK_SKILLS_SESSION_REQUIRED" || code === "WORK_SKILLS_SESSION_INVALID";
  return new WorkSkillsApiError({
    code,
    message: upstreamMessage,
    retryable: status >= 500,
    status,
    userMessage: sessionInvalid
      ? "登录状态已失效，请重新登录后重试。"
      : status >= 500
        ? "Work Skill 服务暂不可用，请稍后重试。"
        : upstreamMessage,
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return undefined;
  }
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
