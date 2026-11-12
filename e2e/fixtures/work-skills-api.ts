import type { Page, Request, Route } from "@playwright/test";

import { installGlobalAuthFixture } from "./global-auth";

const NOW = "2026-11-12 09:00:00";

interface WorkSkillRecord {
  can_manage: boolean;
  content_hash: string | null;
  created_at: string;
  created_by: string;
  description: string;
  dir_path: string;
  enabled: boolean;
  id: number;
  is_builtin: boolean;
  mcp_dependencies: string[];
  name: string;
  share_config: {
    access_level: "department" | "global" | "user";
    department_ids: number[];
    user_uids: string[];
  };
  skill_dependencies: string[];
  slug: string;
  source_type: "builtin" | "remote" | "upload";
  tool_dependencies: string[];
  updated_at: string;
  updated_by: string;
  version: string | null;
}

export interface WorkSkillsFixture {
  calls: Array<{ body?: unknown; method: string; path: string }>;
  state: {
    files: Record<string, string>;
    skills: WorkSkillRecord[];
  };
}

export async function installWorkSkillsFixture(page: Page): Promise<WorkSkillsFixture> {
  const calls: WorkSkillsFixture["calls"] = [];
  const state: WorkSkillsFixture["state"] = {
    files: {
      "meeting-notes:SKILL.md": "# Meeting Notes\n\nRead-only meeting helper.",
      "mysql-reporter:SKILL.md": "# MySQL Reporter\n\nGenerate a structured database report.",
    },
    skills: initialSkills(),
  };

  await installGlobalAuthFixture(page);

  await page.route("**/api/work-skills/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = postData(request);
    calls.push({ ...(body === undefined ? {} : { body }), method, path });

    if (method === "GET" && path === "/api/work-skills/api/system/skills") {
      await json(route, listEnvelope(state.skills));
      return;
    }
    if (method === "GET" && path === "/api/work-skills/api/system/skills/dependency-options") {
      await json(route, {
        success: true,
        data: {
          tools: [
            { slug: "terminal", name: "Terminal" },
            { slug: "read_file", name: "Read File" },
          ],
          mcps: ["mysql-mcp"],
          skills: ["workspace-files", "deep-research"],
        },
      });
      return;
    }
    if (method === "POST" && path === "/api/work-skills/api/skills/import/prepare") {
      await json(route, installDraft("upload-draft", "upload", "task6-skill.zip", "uploaded-task6", "Uploaded Task 6"));
      return;
    }
    if (method === "POST" && path === "/api/work-skills/api/skills/remote/list") {
      await json(route, {
        success: true,
        data: [
          { name: "skill-creator", description: "Create and maintain Agent Skills" },
          { name: "docx", description: "Create Word documents" },
        ],
      });
      return;
    }
    if (method === "POST" && path === "/api/work-skills/api/skills/remote/prepare") {
      await json(route, installDraft("remote-draft", "remote", "https://github.com/anthropics/skills", "skill-creator", "skill-creator"));
      return;
    }
    if (method === "POST" && path === "/api/work-skills/api/system/skills/delete-batch") {
      const slugs = objectBody(body).slugs;
      const requested = Array.isArray(slugs) ? slugs.filter((slug): slug is string => typeof slug === "string") : [];
      state.skills = state.skills.filter((skill) => !requested.includes(skill.slug));
      await json(route, {
        success: true,
        data: requested.map((slug) => ({ slug, success: true })),
        summary: { total: requested.length, success: requested.length, failed: 0 },
      });
      return;
    }

    const draftMatch = path.match(/^\/api\/work-skills\/api\/skills\/install-drafts\/([^/]+)(?:\/(confirm))?$/);
    if (draftMatch && method === "POST" && draftMatch[2] === "confirm") {
      const draftId = draftMatch[1];
      const installed = draftId === "upload-draft"
        ? makeSkill({ id: 4, slug: "uploaded-task6", name: "Uploaded Task 6", source_type: "upload" })
        : makeSkill({ id: 5, slug: "skill-creator", name: "skill-creator", source_type: "remote" });
      if (!state.skills.some((skill) => skill.slug === installed.slug)) state.skills.push(installed);
      await json(route, {
        success: true,
        data: [{ slug: installed.slug, success: true, skill: installed }],
        summary: { total: 1, success: 1, failed: 0 },
      });
      return;
    }
    if (draftMatch && method === "DELETE" && !draftMatch[2]) {
      await json(route, { success: true });
      return;
    }

    const skillMatch = path.match(/^\/api\/work-skills\/api\/system\/skills\/([^/]+)(?:\/(tree|file|enabled|share-config|dependencies|export))?$/);
    if (skillMatch) {
      const slug = decodeURIComponent(skillMatch[1]);
      const action = skillMatch[2];
      const skill = state.skills.find((item) => item.slug === slug);
      if (!skill) {
        await json(route, { detail: "Skill 不存在" }, 404);
        return;
      }
      if (method === "GET" && action === "tree") {
        await json(route, {
          success: true,
          data: [
            { name: "SKILL.md", path: "SKILL.md", is_dir: false },
            { name: "scripts", path: "scripts", is_dir: true, children: [] },
          ],
        });
        return;
      }
      if (method === "GET" && action === "file") {
        const filePath = url.searchParams.get("path") ?? "SKILL.md";
        await json(route, {
          success: true,
          data: { path: filePath, content: state.files[`${slug}:${filePath}`] ?? `# ${skill.name}` },
        });
        return;
      }
      if (method === "PUT" && action === "file") {
        const input = objectBody(body);
        if (typeof input.path === "string" && typeof input.content === "string") {
          state.files[`${slug}:${input.path}`] = input.content;
        }
        await json(route, { success: true });
        return;
      }
      if (method === "PUT" && action === "enabled") {
        const input = objectBody(body);
        if (typeof input.enabled === "boolean") skill.enabled = input.enabled;
        skill.updated_at = NOW;
        await json(route, { success: true, data: skill });
        return;
      }
      if (method === "PUT" && action === "share-config") {
        const input = objectBody(body);
        if (isShareConfig(input.share_config)) skill.share_config = input.share_config;
        skill.updated_at = NOW;
        await json(route, { success: true, data: skill });
        return;
      }
      if (method === "PUT" && action === "dependencies") {
        const input = objectBody(body);
        skill.tool_dependencies = stringArray(input.tool_dependencies);
        skill.mcp_dependencies = stringArray(input.mcp_dependencies);
        skill.skill_dependencies = stringArray(input.skill_dependencies);
        skill.updated_at = NOW;
        await json(route, { success: true, data: skill });
        return;
      }
      if (method === "GET" && action === "export") {
        await route.fulfill({
          body: Buffer.from("task-6-work-skill-zip"),
          contentType: "application/zip",
          headers: { "content-disposition": `attachment; filename=${slug}-task6.zip` },
          status: 200,
        });
        return;
      }
      if (method === "DELETE" && !action) {
        state.skills = state.skills.filter((item) => item.slug !== slug);
        await json(route, { success: true });
        return;
      }
    }

    await json(route, { detail: `Unhandled Work fixture route: ${method} ${path}` }, 404);
  });

  return { calls, state };
}

function initialSkills(): WorkSkillRecord[] {
  return [
    makeSkill({ id: 1, slug: "deep-research", name: "Deep Research", source_type: "builtin", is_builtin: true }),
    makeSkill({ id: 2, slug: "mysql-reporter", name: "MySQL Reporter", source_type: "upload" }),
    makeSkill({ id: 3, slug: "meeting-notes", name: "Meeting Notes", source_type: "remote", can_manage: false, enabled: false }),
  ];
}

function makeSkill(input: Pick<WorkSkillRecord, "id" | "name" | "slug" | "source_type"> & Partial<WorkSkillRecord>): WorkSkillRecord {
  return {
    can_manage: true,
    content_hash: null,
    created_at: NOW,
    created_by: "task6-operator",
    description: `${input.name} Task 6 fixture`,
    dir_path: `skills/${input.slug}`,
    enabled: true,
    is_builtin: false,
    mcp_dependencies: [],
    share_config: { access_level: "user", department_ids: [], user_uids: ["task6-operator"] },
    skill_dependencies: [],
    tool_dependencies: [],
    updated_at: NOW,
    updated_by: "task6-operator",
    version: null,
    ...input,
  };
}

function listEnvelope(skills: WorkSkillRecord[]) {
  return { success: true, data: skills, allowed_access_levels: ["global", "department", "user"] };
}

function installDraft(
  draftId: string,
  sourceType: "remote" | "upload",
  source: string,
  slug: string,
  name: string,
) {
  return {
    success: true,
    data: {
      draft_id: draftId,
      created_by: "task6-operator",
      source_type: sourceType,
      source,
      created_at: 1794454800,
      expires_at: 1794458400,
      items: [{
        draft_item_id: `${draftId}-item`,
        source_dir: `items/${draftId}-item`,
        slug,
        name,
        original_name: slug,
        description: `${name} prepared for Task 6`,
        tool_dependencies: [],
        mcp_dependencies: [],
        skill_dependencies: [],
        warnings: [],
        success: true,
      }],
      default_share_config: { access_level: "user", department_ids: [], user_uids: ["task6-operator"] },
      allowed_access_levels: ["global", "department", "user"],
    },
  };
}

function postData(request: Request): unknown {
  try {
    return request.postDataJSON();
  } catch {
    return undefined;
  }
}

function objectBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isShareConfig(value: unknown): value is WorkSkillRecord["share_config"] {
  if (!value || typeof value !== "object") return false;
  const config = value as Record<string, unknown>;
  return (config.access_level === "global" || config.access_level === "department" || config.access_level === "user") &&
    Array.isArray(config.department_ids) && Array.isArray(config.user_uids);
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}
