import { z } from "zod";

/**
 * Work Skill 上游契约（Xiaozhi 现有 Skill API，后端零改动）。
 *
 * 事实源：`xiaozhi-offline-deploy` 的 `server/routers/skill_router.py`、
 * `xiaozhi/agents/skills/service.py` 与 `xiaozhi/utils/share_config.py`。
 * 本模块是前端唯一冻结契约：未知字段一律忽略，缺失关键字段抛出
 * WorkSkillContractError（fail closed），不得猜测兼容。
 */

export class WorkSkillContractError extends Error {
  readonly code = "WORK_SKILL_RESPONSE_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "WorkSkillContractError";
  }
}

// ---------- 冻结常量（与后端权威值一致，不得修改） ----------

/** share_config.py SHARE_ACCESS_LEVELS */
export const WORK_SKILL_ACCESS_LEVELS = ["global", "department", "user"] as const;
export type WorkSkillAccessLevel = (typeof WORK_SKILL_ACCESS_LEVELS)[number];

/** skill_router.py SkillBatchDeleteRequest.slugs max_length=50 */
export const WORK_SKILL_BATCH_DELETE_MAX = 50;

/** service.py SKILL_DRAFT_TTL_SECONDS = 60 * 60 */
export const WORK_SKILL_DRAFT_TTL_SECONDS = 3600;

/** service.py SKILL_SLUG_PATTERN */
export const WORK_SKILL_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 前端上传控件 accept；后端 prepare_skill_upload 仅接受 .zip 或文件名以 skill.md 结尾 */
export const WORK_SKILL_UPLOAD_ACCEPT = ".zip,.md";

/** skill_router.py export_skill_route FileResponse(application/zip) */
export const WORK_SKILL_EXPORT_CONTENT_TYPE = "application/zip";

export function isValidWorkSkillSlug(slug: string): boolean {
  return WORK_SKILL_SLUG_PATTERN.test(slug);
}

export function isAllowedWorkSkillUploadFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return normalized.endsWith(".zip") || normalized.endsWith("skill.md");
}

// ---------- 冻结路径（confirm/cancel 路径以此为准） ----------

export const WORK_SKILL_API_PATHS = {
  deleteBatch: "/api/system/skills/delete-batch",
  dependencyOptions: "/api/system/skills/dependency-options",
  list: "/api/system/skills",
  remoteList: "/api/skills/remote/list",
  remotePrepare: "/api/skills/remote/prepare",
  remoteSearch: "/api/skills/remote/search",
  uploadPrepare: "/api/skills/import/prepare",
} as const;

const DRAFT_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;

function assertSafeSegment(value: string, pattern: RegExp, label: string): string {
  if (value === "." || value === ".." || !pattern.test(value)) {
    throw new WorkSkillContractError(`${label} 不合法`);
  }
  return value;
}

export function buildSkillPath(
  slug: string,
  segment: "" | "/dependencies" | "/enabled" | "/export" | "/file" | "/share-config" | "/tree" = "",
): string {
  const safeSlug = assertSafeSegment(slug, WORK_SKILL_SLUG_PATTERN, "Skill slug");
  return `/api/system/skills/${safeSlug}${segment}`;
}

export function isSafeWorkSkillFilePath(filePath: string): boolean {
  const parts = filePath.split("/");
  return Boolean(filePath) && !parts.some((part) => part === "" || part === "." || part === "..");
}

export function buildSkillFileUrlPath(slug: string, filePath: string): string {
  if (!isSafeWorkSkillFilePath(filePath)) {
    throw new WorkSkillContractError("文件路径不合法");
  }
  return `${buildSkillPath(slug, "/file")}?path=${encodeURIComponent(filePath)}`;
}

export function buildInstallDraftPath(draftId: string): string {
  const safeId = assertSafeSegment(draftId, DRAFT_ID_PATTERN, "安装草稿 ID");
  return `/api/skills/install-drafts/${safeId}`;
}

export function buildInstallDraftConfirmPath(draftId: string): string {
  return `${buildInstallDraftPath(draftId)}/confirm`;
}

// ---------- DTO schema（snake_case，与上游一致） ----------

const accessLevelSchema = z.enum(WORK_SKILL_ACCESS_LEVELS);

const workSkillShareConfigSchema = z.object({
  access_level: accessLevelSchema,
  department_ids: z.array(z.number().int()),
  user_uids: z.array(z.string().min(1)),
});

const skillSourceTypeSchema = z.enum(["builtin", "remote", "upload"]);

const workSkillSchema = z.object({
  id: z.number().int(),
  slug: z.string().regex(WORK_SKILL_SLUG_PATTERN, "slug 格式非法"),
  name: z.string().min(1),
  description: z.string(),
  source_type: skillSourceTypeSchema,
  tool_dependencies: z.array(z.string()),
  mcp_dependencies: z.array(z.string()),
  skill_dependencies: z.array(z.string()),
  dir_path: z.string().min(1),
  version: z.string().nullable().optional(),
  content_hash: z.string().nullable().optional(),
  share_config: workSkillShareConfigSchema,
  enabled: z.boolean(),
  created_by: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
  can_manage: z.boolean(),
  is_builtin: z.boolean(),
});

export interface WorkSkillTreeNode {
  children?: WorkSkillTreeNode[];
  is_dir: boolean;
  name: string;
  path: string;
}

const workSkillTreeNodeSchema: z.ZodType<WorkSkillTreeNode> = z.lazy(() =>
  z.object({
    children: z.array(workSkillTreeNodeSchema).optional(),
    is_dir: z.boolean(),
    name: z.string().min(1),
    path: z.string().min(1),
  }),
);

const workSkillFileSchema = z.object({
  content: z.string(),
  path: z.string().min(1),
});

const dependencyOptionsSchema = z.object({
  mcps: z.array(z.string()),
  skills: z.array(z.string()),
  tools: z.array(z.object({ name: z.string().optional(), slug: z.string().min(1) })),
});

const remoteSkillOptionSchema = z.object({
  description: z.string(),
  name: z.string().min(1),
});

const remoteSearchResultSchema = z.object({
  installs: z.string(),
  name: z.string().min(1),
  source: z.string().min(1),
});

const installDraftItemSuccessSchema = z.object({
  draft_item_id: z.string().min(1),
  source_dir: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  original_name: z.string().min(1),
  description: z.string(),
  tool_dependencies: z.array(z.string()),
  mcp_dependencies: z.array(z.string()),
  skill_dependencies: z.array(z.string()),
  warnings: z.array(z.string()),
  success: z.literal(true),
});

const installDraftItemFailureSchema = z.object({
  slug: z.string(),
  success: z.literal(false),
  error: z.string().min(1),
});

const installDraftItemSchema = z.discriminatedUnion("success", [
  installDraftItemFailureSchema,
  installDraftItemSuccessSchema,
]);

const installDraftSchema = z.object({
  draft_id: z.string().min(1),
  created_by: z.string(),
  source_type: z.enum(["remote", "upload"]),
  source: z.string().min(1),
  created_at: z.number(),
  expires_at: z.number(),
  items: z.array(installDraftItemSchema),
  default_share_config: workSkillShareConfigSchema,
  allowed_access_levels: z.array(accessLevelSchema),
});

const batchResultItemSchema = z.object({
  error: z.string().optional(),
  skill: workSkillSchema.optional(),
  slug: z.string().min(1),
  success: z.boolean(),
});

const batchSummarySchema = z.object({
  failed: z.number().int(),
  success: z.number().int(),
  total: z.number().int(),
});

const successLiteral = z.literal(true);

function successEnvelope<T extends z.ZodType>(dataSchema: T) {
  return z.object({ data: dataSchema, success: successLiteral });
}

const workSkillListEnvelopeSchema = successEnvelope(z.array(workSkillSchema)).extend({
  allowed_access_levels: z.array(accessLevelSchema),
});
const workSkillMutationEnvelopeSchema = successEnvelope(workSkillSchema);
const workSkillTreeEnvelopeSchema = successEnvelope(z.array(workSkillTreeNodeSchema));
const workSkillFileEnvelopeSchema = successEnvelope(workSkillFileSchema);
const dependencyOptionsEnvelopeSchema = successEnvelope(dependencyOptionsSchema);
const installDraftEnvelopeSchema = successEnvelope(installDraftSchema);
const remoteSkillListEnvelopeSchema = successEnvelope(z.array(remoteSkillOptionSchema));
const remoteSearchEnvelopeSchema = successEnvelope(z.array(remoteSearchResultSchema));
const installConfirmEnvelopeSchema = successEnvelope(z.array(batchResultItemSchema)).extend({
  summary: batchSummarySchema,
});
const batchDeleteEnvelopeSchema = successEnvelope(z.array(batchResultItemSchema)).extend({
  summary: batchSummarySchema,
});
const simpleSuccessSchema = z.object({ success: successLiteral });
const errorDetailSchema = z.union([
  z.object({ detail: z.string() }),
  z.object({ error: z.string() }),
]);

// ---------- 导出类型 ----------

export type WorkSkill = z.infer<typeof workSkillSchema>;
export type WorkSkillShareConfig = z.infer<typeof workSkillShareConfigSchema>;
export type WorkSkillFile = z.infer<typeof workSkillFileSchema>;
export type WorkSkillDependencyOptions = z.infer<typeof dependencyOptionsSchema>;
export type WorkSkillInstallDraft = z.infer<typeof installDraftSchema>;
export type WorkSkillInstallDraftItem = z.infer<typeof installDraftItemSchema>;
export type WorkSkillBatchResultItem = z.infer<typeof batchResultItemSchema>;
export type WorkSkillBatchSummary = z.infer<typeof batchSummarySchema>;
export type WorkSkillListEnvelope = z.infer<typeof workSkillListEnvelopeSchema>;
export type RemoteSkillOption = z.infer<typeof remoteSkillOptionSchema>;
export type RemoteSearchResult = z.infer<typeof remoteSearchResultSchema>;

// ---------- 防御性解析 ----------

function parseWith<T>(schema: z.ZodType<T>, payload: unknown, message: string): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new WorkSkillContractError(message);
  }
  return result.data;
}

export function parseWorkSkillListEnvelope(payload: unknown): WorkSkillListEnvelope {
  return parseWith(workSkillListEnvelopeSchema, payload, "技能列表响应格式错误");
}

export function parseWorkSkillMutation(payload: unknown): WorkSkill {
  return parseWith(workSkillMutationEnvelopeSchema, payload, "Skill 更新响应格式错误").data;
}

export function parseWorkSkillTree(payload: unknown): WorkSkillTreeNode[] {
  return parseWith(workSkillTreeEnvelopeSchema, payload, "技能目录树响应格式错误").data;
}

export function parseWorkSkillFile(payload: unknown): WorkSkillFile {
  return parseWith(workSkillFileEnvelopeSchema, payload, "技能文件响应格式错误").data;
}

export function parseDependencyOptions(payload: unknown): WorkSkillDependencyOptions {
  return parseWith(dependencyOptionsEnvelopeSchema, payload, "依赖选项响应格式错误").data;
}

export function parseInstallDraft(payload: unknown): WorkSkillInstallDraft {
  return parseWith(installDraftEnvelopeSchema, payload, "安装草稿响应格式错误").data;
}

export function parseRemoteSkillList(payload: unknown): RemoteSkillOption[] {
  return parseWith(remoteSkillListEnvelopeSchema, payload, "远程技能列表响应格式错误").data;
}

export function parseRemoteSearchResults(payload: unknown): RemoteSearchResult[] {
  return parseWith(remoteSearchEnvelopeSchema, payload, "远程技能搜索响应格式错误").data;
}

export function parseInstallConfirmResults(payload: unknown): WorkSkillBatchResultItem[] {
  return parseWith(installConfirmEnvelopeSchema, payload, "安装确认响应格式错误").data;
}

export function parseBatchDeleteResults(payload: unknown): WorkSkillBatchResultItem[] {
  return parseWith(batchDeleteEnvelopeSchema, payload, "批量删除响应格式错误").data;
}

export function parseSimpleSuccess(payload: unknown): void {
  parseWith(simpleSuccessSchema, payload, "Skill 操作响应格式错误");
}

/** 上游 FastAPI 错误体 { detail } 或 BFF 归一化错误体 { code, error }；其他形状回退通用文案，不在错误路径上二次抛错。 */
export function parseWorkErrorDetail(payload: unknown): string {
  const parsed = errorDetailSchema.safeParse(payload);
  if (!parsed.success) return "Work Skill 请求失败";
  return "detail" in parsed.data ? parsed.data.detail : parsed.data.error;
}
