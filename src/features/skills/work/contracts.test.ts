import { describe, expect, it } from "vitest";

import batchDeleteResultsFixture from "./fixtures/batch-delete-results.json";
import confirmResultsFixture from "./fixtures/confirm-results.json";
import dependencyOptionsFixture from "./fixtures/dependency-options.json";
import errorDetailFixture from "./fixtures/error-detail.json";
import installDraftRemoteFixture from "./fixtures/install-draft-remote.json";
import installDraftUploadFixture from "./fixtures/install-draft-upload.json";
import remoteListFixture from "./fixtures/remote-list.json";
import remoteSearchFixture from "./fixtures/remote-search.json";
import simpleSuccessFixture from "./fixtures/simple-success.json";
import skillFileFixture from "./fixtures/skill-file.json";
import skillListFixture from "./fixtures/skill-list.json";
import skillMutationFixture from "./fixtures/skill-mutation.json";
import skillTreeFixture from "./fixtures/skill-tree.json";
import {
  buildInstallDraftConfirmPath,
  buildInstallDraftPath,
  buildSkillFileUrlPath,
  buildSkillPath,
  isAllowedWorkSkillUploadFileName,
  isValidWorkSkillSlug,
  parseBatchDeleteResults,
  parseDependencyOptions,
  parseInstallConfirmResults,
  parseInstallDraft,
  parseRemoteSkillList,
  parseRemoteSearchResults,
  parseSimpleSuccess,
  parseWorkErrorDetail,
  parseWorkSkillFile,
  parseWorkSkillListEnvelope,
  parseWorkSkillMutation,
  parseWorkSkillTree,
  WORK_SKILL_ACCESS_LEVELS,
  WORK_SKILL_API_PATHS,
  WORK_SKILL_BATCH_DELETE_MAX,
  WORK_SKILL_DRAFT_TTL_SECONDS,
  WORK_SKILL_EXPORT_CONTENT_TYPE,
  WORK_SKILL_UPLOAD_ACCEPT,
  WorkSkillContractError,
} from "./contracts";

describe("冻结常量", () => {
  it("批量删除上限固定为 50（与后端 max_length=50 一致）", () => {
    expect(WORK_SKILL_BATCH_DELETE_MAX).toBe(50);
  });

  it("安装草稿 TTL 固定为 3600 秒（与后端 SKILL_DRAFT_TTL_SECONDS 一致）", () => {
    expect(WORK_SKILL_DRAFT_TTL_SECONDS).toBe(3600);
  });

  it("生效范围等级冻结为 global/department/user 三项", () => {
    expect(WORK_SKILL_ACCESS_LEVELS).toEqual(["global", "department", "user"]);
  });

  it("上传 accept 与导出 Content-Type 冻结", () => {
    expect(WORK_SKILL_UPLOAD_ACCEPT).toBe(".zip,.md");
    expect(WORK_SKILL_EXPORT_CONTENT_TYPE).toBe("application/zip");
  });

  it("slug 模式与后端 SKILL_SLUG_PATTERN 一致", () => {
    expect(isValidWorkSkillSlug("mysql-reporter")).toBe(true);
    expect(isValidWorkSkillSlug("abc012")).toBe(true);
    expect(isValidWorkSkillSlug("a")).toBe(true);
    for (const invalid of ["", "MySQL", "-a", "a-", "a_b", "a--b", "a/b", "..", "."]) {
      expect(isValidWorkSkillSlug(invalid)).toBe(false);
    }
  });
});

describe("上传文件名限制（与后端 prepare_skill_upload 一致）", () => {
  it("允许 .zip 与以 skill.md 结尾的文件名（大小写不敏感）", () => {
    for (const name of ["report.zip", "REPORT.ZIP", "SKILL.md", "My-Skill.MD", "mysql-skill.md"]) {
      expect(isAllowedWorkSkillUploadFileName(name)).toBe(true);
    }
  });

  it("拒绝其他文件名", () => {
    for (const name of ["notes.md", "archive.tar.gz", "skill.mdx", "zip", ""]) {
      expect(isAllowedWorkSkillUploadFileName(name)).toBe(false);
    }
  });
});

describe("路径契约", () => {
  it("冻结的上游路径常量", () => {
    expect(WORK_SKILL_API_PATHS).toEqual({
      deleteBatch: "/api/system/skills/delete-batch",
      dependencyOptions: "/api/system/skills/dependency-options",
      list: "/api/system/skills",
      remoteList: "/api/skills/remote/list",
      remotePrepare: "/api/skills/remote/prepare",
      remoteSearch: "/api/skills/remote/search",
      uploadPrepare: "/api/skills/import/prepare",
    });
  });

  it("skill 路径拼接合法 slug", () => {
    expect(buildSkillPath("mysql-reporter")).toBe("/api/system/skills/mysql-reporter");
    expect(buildSkillPath("mysql-reporter", "/tree")).toBe("/api/system/skills/mysql-reporter/tree");
    expect(buildSkillPath("mysql-reporter", "/file")).toBe("/api/system/skills/mysql-reporter/file");
    expect(buildSkillPath("deep-research", "/export")).toBe("/api/system/skills/deep-research/export");
  });

  it("skill 路径拒绝非法 slug（防路径穿越）", () => {
    for (const slug of ["../x", "a/b", "..", "A_B", ""]) {
      expect(() => buildSkillPath(slug)).toThrow(WorkSkillContractError);
    }
  });

  it("文件读取路径带编码后的 path 查询参数", () => {
    expect(buildSkillFileUrlPath("mysql-reporter", "SKILL.md")).toBe(
      "/api/system/skills/mysql-reporter/file?path=SKILL.md",
    );
    expect(buildSkillFileUrlPath("mysql-reporter", "scripts/query.py")).toBe(
      "/api/system/skills/mysql-reporter/file?path=scripts%2Fquery.py",
    );
  });

  it("文件读取路径拒绝越界与空路径", () => {
    for (const path of ["", "../SKILL.md", "a//b", "a/./b", ".", ".."]) {
      expect(() => buildSkillFileUrlPath("mysql-reporter", path)).toThrow(WorkSkillContractError);
    }
  });

  it("安装草稿 confirm/cancel 路径固定", () => {
    expect(buildInstallDraftPath("3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01")).toBe(
      "/api/skills/install-drafts/3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01",
    );
    expect(buildInstallDraftConfirmPath("3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01")).toBe(
      "/api/skills/install-drafts/3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01/confirm",
    );
  });

  it("安装草稿 ID 拒绝路径分隔与空值", () => {
    for (const id of ["", "a/b", "..", "a\\b", "a%2Fb"]) {
      expect(() => buildInstallDraftPath(id)).toThrow(WorkSkillContractError);
      expect(() => buildInstallDraftConfirmPath(id)).toThrow(WorkSkillContractError);
    }
  });
});

describe("列表契约（GET /api/system/skills）", () => {
  it("解析三分组技能与 allowed_access_levels", () => {
    const envelope = parseWorkSkillListEnvelope(skillListFixture);
    expect(envelope.success).toBe(true);
    expect(envelope.data).toHaveLength(3);
    expect(envelope.allowed_access_levels).toEqual(["global", "department", "user"]);

    const [builtin, upload, remote] = envelope.data;
    expect(builtin.is_builtin).toBe(true);
    expect(builtin.can_manage).toBe(true);
    expect(builtin.share_config.access_level).toBe("global");
    expect(upload.share_config.user_uids).toEqual(["op-001"]);
    expect(remote.enabled).toBe(false);
    expect(remote.can_manage).toBe(false);
    expect(remote.share_config.department_ids).toEqual([7, 9]);
    expect(remote.mcp_dependencies).toEqual(["notes-mcp"]);
  });

  it("忽略未知字段", () => {
    const envelope = parseWorkSkillListEnvelope(skillListFixture);
    expect(envelope.data[0].slug).toBe("deep-research");
  });

  it("缺失 allowed_access_levels 时 fail closed", () => {
    const payload = { success: true, data: skillListFixture.data };
    expect(() => parseWorkSkillListEnvelope(payload)).toThrow(WorkSkillContractError);
  });

  it("技能项缺失 slug 时 fail closed", () => {
    const payload = {
      success: true,
      allowed_access_levels: ["user"],
      data: [{ ...skillListFixture.data[1], slug: undefined }],
    };
    expect(() => parseWorkSkillListEnvelope(payload)).toThrow(WorkSkillContractError);
  });

  it("share_config 出现非法 access_level 时 fail closed", () => {
    const payload = structuredClone(skillListFixture);
    payload.data[1].share_config.access_level = "team";
    expect(() => parseWorkSkillListEnvelope(payload)).toThrow(WorkSkillContractError);
  });

  it("success 不为 true 时 fail closed", () => {
    expect(() => parseWorkSkillListEnvelope({ success: false })).toThrow(WorkSkillContractError);
    expect(() => parseWorkSkillListEnvelope({ data: [] })).toThrow(WorkSkillContractError);
  });
});

describe("文件树与文件内容契约", () => {
  it("解析嵌套目录树（目录可含空 children）", () => {
    const nodes = parseWorkSkillTree(skillTreeFixture);
    expect(nodes).toHaveLength(3);
    const scripts = nodes[1];
    expect(scripts.is_dir).toBe(true);
    expect(scripts.children).toHaveLength(2);
    expect(scripts.children?.[0].path).toBe("scripts/list_tables.py");
    expect(nodes[2].children).toEqual([]);
    expect(nodes[0].children).toBeUndefined();
  });

  it("树节点缺失关键字段时 fail closed", () => {
    const payload = {
      success: true,
      data: [{ name: "SKILL.md", is_dir: false }],
    };
    expect(() => parseWorkSkillTree(payload)).toThrow(WorkSkillContractError);
  });

  it("解析文件内容与规范化路径", () => {
    const file = parseWorkSkillFile(skillFileFixture);
    expect(file.path).toBe("SKILL.md");
    expect(file.content).toContain("name: MySQL Reporter");
  });

  it("文件内容缺失 content 时 fail closed", () => {
    expect(() => parseWorkSkillFile({ success: true, data: { path: "SKILL.md" } })).toThrow(
      WorkSkillContractError,
    );
  });
});

describe("依赖选项契约（GET /api/system/skills/dependency-options）", () => {
  it("解析工具、MCP 与 Skill 三组选项", () => {
    const options = parseDependencyOptions(dependencyOptionsFixture);
    expect(options.tools).toEqual([
      { slug: "terminal", name: "Terminal" },
      { slug: "read_file", name: "Read File" },
      { slug: "write_file" },
    ]);
    expect(options.mcps).toEqual(["mysql-mcp"]);
    expect(options.skills).toEqual(["workspace-files", "deep-research"]);
  });

  it("工具缺失 slug 时 fail closed", () => {
    const payload = {
      success: true,
      data: { tools: [{ name: "Terminal" }], mcps: [], skills: [] },
    };
    expect(() => parseDependencyOptions(payload)).toThrow(WorkSkillContractError);
  });
});

describe("生效范围契约（share_config）", () => {
  it("从技能与草稿默认值解析三等级", () => {
    const envelope = parseWorkSkillListEnvelope(skillListFixture);
    expect(envelope.data[0].share_config).toEqual({
      access_level: "global",
      department_ids: [],
      user_uids: [],
    });
    expect(envelope.data[2].share_config.access_level).toBe("department");

    const draft = parseInstallDraft(installDraftUploadFixture);
    expect(draft.default_share_config).toEqual({
      access_level: "user",
      department_ids: [],
      user_uids: ["op-001"],
    });
  });
});

describe("安装草稿契约（prepare → confirm/cancel 两阶段）", () => {
  it("上传草稿：TTL 与后端 3600 秒一致", () => {
    const draft = parseInstallDraft(installDraftUploadFixture);
    expect(draft.draft_id).toBe("3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01");
    expect(draft.source_type).toBe("upload");
    expect(draft.expires_at - draft.created_at).toBe(WORK_SKILL_DRAFT_TTL_SECONDS);
    const [item] = draft.items;
    expect(item.success).toBe(true);
    if (item.success) {
      expect(item.warnings).toEqual([]);
      expect(item.slug).toBe("mysql-reporter");
    }
  });

  it("远程草稿：失败项无 draft_item_id 也可解析", () => {
    const draft = parseInstallDraft(installDraftRemoteFixture);
    expect(draft.source_type).toBe("remote");
    expect(draft.items).toHaveLength(2);
    const [successItem, failedItem] = draft.items;
    expect(successItem.success).toBe(true);
    expect(failedItem.success).toBe(false);
    if (!failedItem.success) {
      expect(failedItem.error).toContain("拉取失败");
    }
  });

  it("缺失 draft_id 时 fail closed", () => {
    const payload = structuredClone(installDraftUploadFixture);
    delete (payload.data as Record<string, unknown>).draft_id;
    expect(() => parseInstallDraft(payload)).toThrow(WorkSkillContractError);
  });

  it("allowed_access_levels 非完整登录用户时收敛为 user", () => {
    const draft = parseInstallDraft(installDraftRemoteFixture);
    expect(draft.allowed_access_levels).toEqual(["user"]);
  });
});

describe("远程列表与全局搜索契约", () => {
  it("解析仓库技能列表（description 允许为空串）", () => {
    const options = parseRemoteSkillList(remoteListFixture);
    expect(options).toHaveLength(3);
    expect(options[0]).toEqual({ name: "skill-creator", description: "创建、维护和改进 Agent Skill" });
    expect(options[2].description).toBe("");
  });

  it("列表项缺失 name 时 fail closed", () => {
    expect(() => parseRemoteSkillList({ success: true, data: [{ description: "x" }] })).toThrow(
      WorkSkillContractError,
    );
  });

  it("解析全局搜索结果（installs 允许为空串）", () => {
    const results = parseRemoteSearchResults(remoteSearchFixture);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      source: "community/research-skills",
      name: "web-research",
      installs: "12.6k",
    });
    expect(results[2].installs).toBe("");
  });
});

describe("安装确认与批量删除结果契约", () => {
  it("确认结果含成功 skill 与 summary", () => {
    const results = parseInstallConfirmResults(confirmResultsFixture);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].skill?.slug).toBe("skill-creator");
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain("已被占用");
    expect(confirmResultsFixture.summary).toEqual({ total: 2, success: 1, failed: 1 });
  });

  it("批量删除结果项允许不带 skill", () => {
    const results = parseBatchDeleteResults(batchDeleteResultsFixture);
    expect(results[0]).toEqual({ slug: "meeting-notes", success: true });
    expect(results[1].success).toBe(false);
    expect(batchDeleteResultsFixture.summary).toEqual({ total: 2, success: 1, failed: 1 });
  });

  it("结果项缺失 slug 时 fail closed", () => {
    const payload = {
      success: true,
      data: [{ success: true }],
      summary: { total: 1, success: 1, failed: 0 },
    };
    expect(() => parseInstallConfirmResults(payload)).toThrow(WorkSkillContractError);
    expect(() => parseBatchDeleteResults(payload)).toThrow(WorkSkillContractError);
  });
});

describe("简单成功、错误 envelope 与启停变更", () => {
  it("简单成功体（建/删节点、取消草稿、删除 Skill）", () => {
    expect(() => parseSimpleSuccess(simpleSuccessFixture)).not.toThrow();
    expect(() => parseSimpleSuccess({ success: true, data: null })).not.toThrow();
    expect(() => parseSimpleSuccess({ success: false })).toThrow(WorkSkillContractError);
    expect(() => parseSimpleSuccess({})).toThrow(WorkSkillContractError);
  });

  it("错误 envelope 解析 detail，非标准体回退通用文案", () => {
    expect(parseWorkErrorDetail(errorDetailFixture)).toBe("仅支持上传 .zip 或 SKILL.md 文件");
    expect(parseWorkErrorDetail({ detail: 42 })).toBe("Work Skill 请求失败");
    expect(parseWorkErrorDetail(null)).toBe("Work Skill 请求失败");
  });

  it("BFF 归一化错误体解析 error 字段（detail 优先）", () => {
    expect(parseWorkErrorDetail({ code: "WORK_SKILLS_UPSTREAM_ERROR", error: "批量删除失败" })).toBe(
      "批量删除失败",
    );
    expect(
      parseWorkErrorDetail({ detail: "原始 detail", error: "归一化 error" }),
    ).toBe("原始 detail");
  });

  it("启停/范围/依赖变更返回完整技能体", () => {
    const skill = parseWorkSkillMutation(skillMutationFixture);
    expect(skill.slug).toBe("mysql-reporter");
    expect(skill.enabled).toBe(false);
    expect(skill.updated_at).toBe("2026-11-11 05:20:00");
  });

  it("变更 envelope 缺失 data 时 fail closed", () => {
    expect(() => parseWorkSkillMutation({ success: true })).toThrow(WorkSkillContractError);
  });
});
