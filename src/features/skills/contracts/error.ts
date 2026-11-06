import {
  DiagnosticErrorResponseSchema,
  ErrorResponseSchema,
  type SkillDiagnostic,
} from "./generated";

export type SkillMarketErrorPresentation =
  | "authentication"
  | "permission"
  | "not-found"
  | "conflict"
  | "validation"
  | "timeout"
  | "unavailable"
  | "unknown";

export type SkillMarketRecoveryAction = "reload" | "back" | "refresh" | "edit" | "retry";
export type SkillMarketErrorArea = "creator" | "draft" | "review" | "publication" | "general";

export interface SkillMarketErrorInput {
  area?: SkillMarketErrorArea;
  code: string;
  diagnostics?: SkillDiagnostic[];
  presentation: SkillMarketErrorPresentation;
  recovery: SkillMarketRecoveryAction;
  requestId?: string;
  retryable: boolean;
  status: number;
  userMessage: string;
}

export class SkillMarketError extends Error {
  readonly area?: SkillMarketErrorArea;
  readonly code: string;
  readonly diagnostics?: SkillDiagnostic[];
  readonly presentation: SkillMarketErrorPresentation;
  readonly recovery: SkillMarketRecoveryAction;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status: number;
  readonly userMessage: string;

  constructor(input: SkillMarketErrorInput) {
    super(input.userMessage);
    this.name = "SkillMarketError";
    this.area = input.area;
    this.code = input.code;
    this.diagnostics = input.diagnostics;
    this.presentation = input.presentation;
    this.recovery = input.recovery;
    this.requestId = input.requestId;
    this.retryable = input.retryable;
    this.status = input.status;
    this.userMessage = input.userMessage;
  }
}

interface PresentationDefinition {
  actionLabel: string;
  recovery: SkillMarketRecoveryAction;
  retryable: boolean;
  title: string;
  userMessage: string;
}

const PRESENTATIONS: Record<SkillMarketErrorPresentation, PresentationDefinition> = {
  authentication: definition("登录状态失效", "访问凭证无效，请刷新页面后重试。", "reload", "刷新页面"),
  permission: definition("无权执行此操作", "当前身份没有执行此操作的权限。", "back", "返回"),
  "not-found": definition("资源不存在", "目标资源不存在或已不可用。", "back", "返回"),
  conflict: definition("状态已发生变化", "资源状态或修订已更新，请刷新后再操作。", "refresh", "刷新数据"),
  validation: definition("请检查输入", "请修正标记的问题后重试。", "edit", "修改内容"),
  timeout: definition("服务响应超时", "服务响应超时，请重试。", "retry", "重试", true),
  unavailable: definition("服务暂不可用", "Skill Market 服务暂不可用，请稍后重试。", "retry", "重试", true),
  unknown: definition("操作失败", "Skill Market 请求失败，请稍后重试。", "retry", "重试", true),
};

const CODE_PRESENTATIONS: Readonly<Record<string, SkillMarketErrorPresentation>> = {
  "skill.authentication_failed": "authentication",
  "skill.permission_denied": "permission",
  "skill.resource_not_found": "not-found",
  "skill.lifecycle_conflict": "conflict",
  "skill.validation_failed": "validation",
  "skill.internal_error": "unknown",
  SKILL_MARKET_MODE_UNAVAILABLE: "conflict",
  SKILL_MARKET_UPSTREAM_TIMEOUT: "timeout",
  SKILL_MARKET_UPSTREAM_UNAVAILABLE: "unavailable",
  SKILL_MARKET_GATEWAY_CONFIG_INVALID: "unavailable",
};

export async function decodeSkillMarketError(
  response: Response,
  options: { area?: SkillMarketErrorArea } = {},
): Promise<SkillMarketError> {
  const requestIdHeader = normalizedText(response.headers.get("x-request-id"));
  const body = await readJson(response);
  const diagnostic = DiagnosticErrorResponseSchema.safeParse(body);
  const basic = diagnostic.success ? diagnostic : ErrorResponseSchema.safeParse(body);

  if (!basic.success) {
    return invalidResponseError(response.status, requestIdHeader, options.area);
  }

  const envelope = basic.data;
  const code = normalizedText(envelope.code) ?? `SKILL_MARKET_HTTP_${response.status}`;
  const presentation = envelope.code
    ? CODE_PRESENTATIONS[envelope.code] ?? "unknown"
    : presentationForLegacyStatus(response.status);
  const definition = PRESENTATIONS[presentation];
  const retryable = presentation === "unknown" ? response.status >= 500 : definition.retryable;
  const recovery = presentation === "unknown" && !retryable ? "back" : definition.recovery;

  return new SkillMarketError({
    area: options.area,
    code,
    diagnostics: diagnostic.success ? diagnostic.data.diagnostics : undefined,
    presentation,
    recovery,
    requestId: normalizedText(envelope.requestId) ?? requestIdHeader,
    retryable,
    status: response.status,
    userMessage: definition.userMessage,
  });
}

export function skillMarketErrorPresentation(error: SkillMarketError): PresentationDefinition {
  return PRESENTATIONS[error.presentation];
}

function definition(
  title: string,
  userMessage: string,
  recovery: SkillMarketRecoveryAction,
  actionLabel: string,
  retryable = false,
): PresentationDefinition {
  return { actionLabel, recovery, retryable, title, userMessage };
}

function presentationForLegacyStatus(status: number): SkillMarketErrorPresentation {
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not-found";
  if (status === 409) return "conflict";
  if (status === 422) return "validation";
  if (status === 504) return "timeout";
  if (status === 502 || status === 503) return "unavailable";
  return "unknown";
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) return undefined;
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function invalidResponseError(
  status: number,
  requestId?: string,
  area?: SkillMarketErrorArea,
): SkillMarketError {
  const definition = PRESENTATIONS.unknown;
  return new SkillMarketError({
    area,
    code: "SKILL_MARKET_RESPONSE_INVALID",
    presentation: "unknown",
    recovery: status >= 500 ? "retry" : "back",
    requestId,
    retryable: status >= 500,
    status,
    userMessage: definition.userMessage,
  });
}

function normalizedText(value: string | undefined | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
