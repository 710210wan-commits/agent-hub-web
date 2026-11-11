import { describe, expect, it, vi } from "vitest";

import batchDeleteResultsFixture from "./fixtures/batch-delete-results.json";
import confirmResultsFixture from "./fixtures/confirm-results.json";
import installDraftUploadFixture from "./fixtures/install-draft-upload.json";
import remoteListFixture from "./fixtures/remote-list.json";
import remoteSearchFixture from "./fixtures/remote-search.json";
import skillFileFixture from "./fixtures/skill-file.json";
import skillListFixture from "./fixtures/skill-list.json";
import skillMutationFixture from "./fixtures/skill-mutation.json";
import type { WorkSkillShareConfig } from "./contracts";
import {
  createWorkSkillsApi,
  filenameFromContentDisposition,
  mapWorkSkillsError,
  WORK_SKILLS_BFF_BASE,
  WorkSkillsApiError,
} from "./work-api";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

interface RecordedCall {
  input: string;
  init?: RequestInit;
}

function createFetchStub(handler: (call: RecordedCall) => Promise<Response> | Response) {
  const calls: RecordedCall[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const call: RecordedCall = { input: String(input), init };
    calls.push(call);
    return handler(call);
  });
  return { calls, fetchImpl };
}

describe("createWorkSkillsApi", () => {
  it("listSkills：GET 白名单列表路径并解析 envelope", async () => {
    const { calls, fetchImpl } = createFetchStub(() => jsonResponse(skillListFixture));
    const api = createWorkSkillsApi({ fetchImpl });
    const envelope = await api.listSkills();
    expect(envelope.data).toHaveLength(3);
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/system/skills`);
    expect(calls[0].init?.method).toBeUndefined();
    expect(calls[0].init?.credentials).toBe("same-origin");
  });

  it("getSkillFile：构造带编码 path 查询的读取路径", async () => {
    const { calls, fetchImpl } = createFetchStub(() => jsonResponse(skillFileFixture));
    const api = createWorkSkillsApi({ fetchImpl });
    const file = await api.getSkillFile("mysql-reporter", "scripts/query.py");
    expect(file.path).toBe("SKILL.md");
    expect(calls[0].input).toBe(
      `${WORK_SKILLS_BFF_BASE}/api/system/skills/mysql-reporter/file?path=scripts%2Fquery.py`,
    );
  });

  it("setSkillEnabled：PUT enabled 请求体并返回更新后技能", async () => {
    const { calls, fetchImpl } = createFetchStub(() => jsonResponse(skillMutationFixture));
    const api = createWorkSkillsApi({ fetchImpl });
    const skill = await api.setSkillEnabled("mysql-reporter", false);
    expect(skill.enabled).toBe(false);
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/system/skills/mysql-reporter/enabled`);
    expect(calls[0].init?.method).toBe("PUT");
    expect(calls[0].init?.body).toBe(JSON.stringify({ enabled: false }));
  });

  it("deleteSkill 与 deleteSkillsBatch：路径与请求体", async () => {
    const { calls, fetchImpl } = createFetchStub(() => jsonResponse({ success: true }));
    const api = createWorkSkillsApi({ fetchImpl });
    await api.deleteSkill("meeting-notes");
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/system/skills/meeting-notes`);
    expect(calls[0].init?.method).toBe("DELETE");

    const batch = createFetchStub(() => jsonResponse(batchDeleteResultsFixture));
    const api2 = createWorkSkillsApi({ fetchImpl: batch.fetchImpl });
    const results = await api2.deleteSkillsBatch(["meeting-notes", "old-report"]);
    expect(results).toHaveLength(2);
    expect(batch.calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/system/skills/delete-batch`);
    expect(batch.calls[0].init?.body).toBe(JSON.stringify({ slugs: ["meeting-notes", "old-report"] }));
  });

  it("prepareSkillUpload：multipart FormData 且字段名为 file", async () => {
    const { calls, fetchImpl } = createFetchStub(() => jsonResponse(installDraftUploadFixture));
    const api = createWorkSkillsApi({ fetchImpl });
    const file = new Blob(["zip-bytes"], { type: "application/zip" });
    const draft = await api.prepareSkillUpload(file);
    expect(draft.draft_id).toBe("3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01");
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/skills/import/prepare`);
    expect(calls[0].init?.method).toBe("POST");
    const body = calls[0].init?.body as FormData;
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("远程列表/搜索/解析：POST JSON 请求体", async () => {
    const { calls, fetchImpl } = createFetchStub((call) => {
      if (call.input.endsWith("/remote/list")) return jsonResponse(remoteListFixture);
      if (call.input.endsWith("/remote/search")) return jsonResponse(remoteSearchFixture);
      return jsonResponse(installDraftUploadFixture);
    });
    const api = createWorkSkillsApi({ fetchImpl });
    await api.listRemoteSkills("anthropics/skills");
    expect(calls[0].init?.body).toBe(JSON.stringify({ source: "anthropics/skills" }));
    await api.searchRemoteSkills("web");
    expect(calls[1].init?.body).toBe(JSON.stringify({ query: "web" }));
    const draft = await api.prepareRemoteSkills("anthropics/skills", ["docx"]);
    expect(draft.draft_id).toBe("3f6f8c2e-7d2b-4a1e-9c0d-2e5b8a9d4f01");
    expect(calls[2].init?.body).toBe(JSON.stringify({ source: "anthropics/skills", skills: ["docx"] }));
  });

  it("confirm/discard 草稿：路径固定且请求体含 share_config", async () => {
    const shareConfig: WorkSkillShareConfig = {
      access_level: "user",
      department_ids: [],
      user_uids: ["op-001"],
    };
    const { calls, fetchImpl } = createFetchStub((call) =>
      call.input.endsWith("/confirm") ? jsonResponse(confirmResultsFixture) : jsonResponse({ success: true }),
    );
    const api = createWorkSkillsApi({ fetchImpl });
    const results = await api.confirmInstallDraft("d-1", shareConfig);
    expect(results).toHaveLength(2);
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/skills/install-drafts/d-1/confirm`);
    expect(calls[0].init?.body).toBe(JSON.stringify({ share_config: shareConfig }));
    await api.discardInstallDraft("d-1");
    expect(calls[1].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/skills/install-drafts/d-1`);
    expect(calls[1].init?.method).toBe("DELETE");
  });

  it("exportSkill：读取 blob 与 Content-Disposition 文件名", async () => {
    const zipBytes = new Uint8Array([1, 2, 3]);
    const { calls, fetchImpl } = createFetchStub(
      () =>
        new Response(zipBytes, {
          headers: {
            "content-disposition": 'attachment; filename="mysql-reporter.zip"',
            "content-type": "application/zip",
          },
          status: 200,
        }),
    );
    const api = createWorkSkillsApi({ fetchImpl });
    const exported = await api.exportSkill("mysql-reporter");
    expect(calls[0].input).toBe(`${WORK_SKILLS_BFF_BASE}/api/system/skills/mysql-reporter/export`);
    expect(exported.filename).toBe("mysql-reporter.zip");
    expect(exported.blob).toBeTruthy();
  });
});

describe("错误映射", () => {
  it("会话失效码映射为重新登录文案", () => {
    const error = mapWorkSkillsError(401, { code: "WORK_SKILLS_SESSION_INVALID", error: "登录状态已失效，请重新登录。" });
    expect(error).toBeInstanceOf(WorkSkillsApiError);
    expect(error.code).toBe("WORK_SKILLS_SESSION_INVALID");
    expect(error.userMessage).toBe("登录状态已失效，请重新登录后重试。");
    expect(error.retryable).toBe(false);
  });

  it("4xx 透传上游 detail，5xx 泛化且可重试", () => {
    const badRequest = mapWorkSkillsError(400, { detail: "仅支持上传 .zip 或 SKILL.md 文件" });
    expect(badRequest.userMessage).toBe("仅支持上传 .zip 或 SKILL.md 文件");
    const internal = mapWorkSkillsError(500, { detail: "boom" });
    expect(internal.userMessage).toBe("Work Skill 服务暂不可用，请稍后重试。");
    expect(internal.retryable).toBe(true);
  });

  it("无 body 时生成状态码默认错误", () => {
    const error = mapWorkSkillsError(502, undefined);
    expect(error.code).toBe("WORK_SKILLS_HTTP_502");
  });

  it("网络故障包装为可重试网络错误，AbortError 原样抛出", async () => {
    const networkApi = createWorkSkillsApi({
      fetchImpl: vi.fn(() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch,
    });
    await expect(networkApi.listSkills()).rejects.toMatchObject({ code: "WORK_SKILLS_NETWORK" });

    const abortApi = createWorkSkillsApi({
      fetchImpl: vi.fn(() => Promise.reject(new DOMException("aborted", "AbortError"))) as typeof fetch,
    });
    await expect(abortApi.listSkills()).rejects.toBeInstanceOf(DOMException);
  });
});

describe("filenameFromContentDisposition", () => {
  it("解析普通、带引号与 RFC 5987 编码文件名", () => {
    expect(filenameFromContentDisposition('attachment; filename="mysql-reporter.zip"')).toBe(
      "mysql-reporter.zip",
    );
    expect(filenameFromContentDisposition("attachment; filename=plain.zip")).toBe("plain.zip");
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.zip"),
    ).toBe("报告.zip");
    expect(filenameFromContentDisposition(null)).toBeUndefined();
    expect(filenameFromContentDisposition("attachment")).toBeUndefined();
  });
});
