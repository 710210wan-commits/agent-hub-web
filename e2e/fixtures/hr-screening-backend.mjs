import { randomUUID } from "node:crypto";

const assistant = {
  id: "resume-screening",
  version: 1,
  name: "简历筛选助手",
  summary: "根据已确认岗位标准辅助筛选电子简历",
  icon: "file-search",
  tags: ["HR", "简历筛选"],
  status: "published",
  runtime: "dsi-native",
  requiredSkills: ["resume-screening"],
  allowedOptionalCapabilities: [],
  setupProfile: "resume-screening-v1",
  resultRenderer: "resume-screening-v1",
  modelPolicy: "hr-screening-default",
  retentionDays: 30,
};
const drafts = new Map();
export const hrAssistant = assistant;

export function resetHrFixture() {
  drafts.clear();
}

export async function handleHrRequest(input) {
  const { request, response, url } = input;
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/assistants") {
    input.sendJson(response, 200, { assistants: [assistant] });
    return true;
  }
  if (request.method === "GET" && path === "/api/assistants/resume-screening") {
    input.sendJson(response, 200, { assistant });
    return true;
  }
  if (path.startsWith("/api/upload-drafts")) {
    await handleDraft(input);
    return true;
  }
  if (request.method === "POST" && path === "/api/assistants/resume-screening/conversations") {
    await createAssistantConversation(input);
    return true;
  }
  if (path.startsWith("/api/hr/")) {
    await handleHr(input);
    return true;
  }
  return false;
}

async function handleDraft(input) {
  const { request, response, url } = input;
  const createMatch = url.pathname.match(/^\/api\/upload-drafts\/?$/);
  if (createMatch && request.method === "POST") {
    const body = await input.readJson(request);
    const existing = [...drafts.values()].find(draft => draft.requestId === body.clientRequestId);
    if (existing) {
      input.sendJson(response, 200, { reused: true, draft: publicDraft(existing) });
      return;
    }
    const draft = {
      draftId: randomUUID(),
      assistantId: body.assistantId,
      requestId: body.clientRequestId,
      status: "open",
      expiresAt: "2030-01-01T00:00:00.000Z",
      files: [],
    };
    drafts.set(draft.draftId, draft);
    input.sendJson(response, 201, { reused: false, draft: publicDraft(draft) });
    return;
  }
  const filesMatch = url.pathname.match(/^\/api\/upload-drafts\/([^/]+)\/files(?:\/([^/]+))?$/);
  if (!filesMatch) {
    input.sendError(response, 404, "UPLOAD_DRAFT_NOT_FOUND");
    return;
  }
  const draft = drafts.get(decodeURIComponent(filesMatch[1]));
  if (!draft) {
    input.sendError(response, 404, "UPLOAD_DRAFT_NOT_FOUND");
    return;
  }
  if (request.method === "POST" && !filesMatch[2]) {
    const raw = await readText(request);
    const role = /name="role"\r?\n\r?\n([^\r\n]+)/.exec(raw)?.[1]?.trim();
    const name = /filename="([^"]+)"/.exec(raw)?.[1] ?? "synthetic.pdf";
    const contentType = name.endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
    const file = {
      fileId: randomUUID(),
      role,
      name: name.replace(/[\r\n"]/g, "_").slice(0, 255),
      contentType,
      sizeBytes: Math.max(1, Buffer.byteLength(raw)),
    };
    draft.files.push(file);
    input.sendJson(response, 201, { file });
    return;
  }
  if (request.method === "DELETE" && filesMatch[2]) {
    draft.files = draft.files.filter(file => file.fileId !== decodeURIComponent(filesMatch[2]));
    input.sendJson(response, 200, { ok: true });
    return;
  }
  input.sendError(response, 405, "METHOD_NOT_ALLOWED");
}

async function createAssistantConversation(input) {
  const { request, response, userKey } = input;
  const body = await input.readJson(request);
  const draft = drafts.get(body.draftId);
  if (!draft || !draft.files.some(file => file.role === "job_description") || !draft.files.some(file => file.role === "resume")) {
    input.sendError(response, 409, "DRAFT_CONTENT_INVALID");
    return;
  }
  const conversations = input.conversations.get(userKey);
  const existing = [...conversations.values()].find(item => item.createRequestId === body.clientRequestId);
  if (existing) {
    input.sendJson(response, 200, setupResponse(existing, true));
    return;
  }
  const item = input.createConversationRecord(randomUUID(), "合成岗位筛选", true);
  item.createRequestId = body.clientRequestId;
  item.hr = createHrState(item, draft.files);
  conversations.set(item.metadata.conversationId, item);
  createSetupTurn(item, draft.files);
  input.sendJson(response, 201, setupResponse(item, false));
}

function createSetupTurn(item, files) {
  const turnId = randomUUID();
  const taskId = randomUUID();
  const user = inputSafeMessage(item, turnId, "user", "请生成可确认的筛选标准");
  user.content = { kind: "assistant_setup", text: "请生成可确认的筛选标准", attachments: files };
  item.messages.push(user);
  inputAppend(item, "message.created", { message: user }, { turnId, taskId, messageId: user.messageId });
  const turn = {
    turnId,
    taskId,
    turnIndex: "1",
    status: "queued",
    acceptedEventSeq: String(BigInt(item.metadata.lastEventSeq) + 1n),
    errorCode: null,
  };
  item.turns.push(turn);
  item.metadata.lastTurnIndex = "1";
  inputAppend(item, "turn.queued", { turn, userMessageId: user.messageId }, { turnId, taskId });
  const answer = inputSafeMessage(item, turnId, "assistant", "已生成可编辑的筛选标准");
  item.messages.push(answer);
  inputAppend(item, "message.created", { message: answer }, { turnId, taskId, messageId: answer.messageId });
  turn.status = "completed";
  inputAppend(item, "turn.completed", { turn, messageId: answer.messageId }, { turnId, taskId, messageId: answer.messageId });
  item.activeTurn = null;
}

function inputSafeMessage(item, turnId, role, text) {
  return {
    messageId: randomUUID(),
    conversationId: item.metadata.conversationId,
    turnId,
    ordinal: String(item.messages.length + 1),
    role,
    content: { kind: "text", text },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    capabilitySelection: null,
    createdAt: new Date().toISOString(),
  };
}

function inputAppend(item, type, payload, extra) {
  // Installed by the canonical fixture so every event shares its stream/cursor implementation.
  item.appendEvent(type, payload, extra);
}

function createHrState(item, files) {
  const timestamp = new Date().toISOString();
  const jdId = randomUUID();
  const criteriaVersionId = randomUUID();
  return {
    conversationId: item.metadata.conversationId,
    assistantId: "resume-screening",
    assistantVersion: 1,
    retentionUntil: "2030-01-01T00:00:00.000Z",
    activeJobDescription: {
      jobDescriptionVersionId: jdId,
      version: 1,
      parseStatus: "parsed",
      createdAt: timestamp,
    },
    activeCriteria: {
      criteriaVersionId,
      conversationId: item.metadata.conversationId,
      jobDescriptionVersionId: jdId,
      version: 1,
      status: "draft",
      criteria: [{
        criterionId: randomUUID(),
        kind: "required",
        title: "TypeScript",
        instruction: "熟练使用 TypeScript",
        evidenceExpectation: "合成项目证据",
      }],
      createdAt: timestamp,
      confirmedAt: null,
    },
    activeBatch: null,
    latestCompletedBatch: null,
    candidates: files.filter(file => file.role === "resume").map(file => ({
      candidateId: file.fileId,
      displayName: file.name.replace(/\.(pdf|docx)$/i, ""),
      status: "active",
      parseStatus: "parsed",
      errorCode: null,
      createdAt: timestamp,
      retiredAt: null,
    })),
  };
}

async function handleHr(input) {
  const { request, response, url } = input;
  const stateMatch = url.pathname.match(/^\/api\/hr\/conversations\/([^/]+)\/state$/);
  if (stateMatch && request.method === "GET") {
    const item = input.findConversation(decodeURIComponent(stateMatch[1]));
    if (!item?.hr) return input.sendError(response, 404, "HR_CONVERSATION_NOT_FOUND");
    input.sendJson(response, 200, { state: item.hr });
    return;
  }
  const criteriaMatch = url.pathname.match(/^\/api\/hr\/conversations\/([^/]+)\/criteria(?:\/(\d+)(?:\/(confirm))?|\/(generate))?$/);
  if (criteriaMatch) {
    const item = input.findConversation(decodeURIComponent(criteriaMatch[1]));
    if (!item?.hr) return input.sendError(response, 404, "HR_CONVERSATION_NOT_FOUND");
    if (criteriaMatch[4] === "generate" && request.method === "POST") {
      input.sendJson(response, 200, { state: item.hr });
      return;
    }
    const body = await input.readJson(request);
    if (criteriaMatch[2] && request.method === "PATCH") {
      item.hr.activeCriteria.criteria = body.criteria;
      input.sendJson(response, 200, { state: item.hr });
      return;
    }
    if (criteriaMatch[3] === "confirm" && request.method === "POST") {
      item.hr.activeCriteria.status = "confirmed";
      item.hr.activeCriteria.confirmedAt = new Date().toISOString();
      input.sendJson(response, 200, { state: item.hr });
      return;
    }
  }
  const batchMatch = url.pathname.match(/^\/api\/hr\/conversations\/([^/]+)\/screening-batches$/);
  if (batchMatch && request.method === "POST") {
    const item = input.findConversation(decodeURIComponent(batchMatch[1]));
    if (!item?.hr) return input.sendError(response, 404, "HR_CONVERSATION_NOT_FOUND");
    startBatch(item);
    input.sendJson(response, 201, { batch: item.hr.activeBatch, items: item.batchItems, reused: false });
    return;
  }
  const itemMatch = url.pathname.match(/^\/api\/hr\/screening-batches\/([^/]+)(?:\/(cancel|continue|export\.csv|items\/([^/]+)\/retry))?$/);
  if (!itemMatch) return input.sendError(response, 404, "BATCH_NOT_FOUND");
  const item = input.findConversation(decodeURIComponent(itemMatch[1]));
  if (!item?.hr) return input.sendError(response, 404, "BATCH_NOT_FOUND");
  const action = itemMatch[2];
  if (!action && request.method === "GET") {
    const batch = item.hr.activeBatch ?? item.hr.latestCompletedBatch;
    input.sendJson(response, 200, { batch, items: item.batchItems });
    return;
  }
  if (action === "export.csv" && request.method === "GET") {
    response.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resume-screening-${itemMatch[1].slice(0, 8)}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    response.end("candidateId,advisoryTier,decision,evidenceExcerpts\ncandidate,recommended,meets,synthetic evidence\n");
    return;
  }
  if (action === "cancel" && request.method === "POST") {
    const batch = item.hr.activeBatch;
    batch.status = "cancelled";
    item.hr.activeBatch = null;
    item.hr.latestCompletedBatch = batch;
    input.sendJson(response, 200, { batch, items: item.batchItems });
    return;
  }
  if (action === "continue" && request.method === "POST") {
    continueBatch(item);
    input.sendJson(response, 200, { batch: item.hr.activeBatch, items: item.batchItems });
    return;
  }
  if (action?.startsWith("items/") && request.method === "POST") {
    const failed = item.batchItems.find(candidate => candidate.itemId === itemMatch[3]);
    if (failed) {
      failed.status = "completed";
      failed.attemptCount += 1;
      failed.advisoryTier = "recommended";
      failed.assessments = [assessment(item.hr.activeCriteria.criteria[0].criterionId)];
      failed.errorCode = null;
      failed.finishedAt = new Date().toISOString();
      const batch = item.hr.activeBatch;
      batch.completedCount = batch.totalCount;
      batch.failedCount = 0;
      batch.status = "completed";
      batch.finishedAt = new Date().toISOString();
      item.hr.activeBatch = null;
      item.hr.latestCompletedBatch = batch;
      input.sendJson(response, 200, { batch, items: item.batchItems });
      return;
    }
  }
  input.sendError(response, 405, "METHOD_NOT_ALLOWED");
}

export function startBatch(item) {
  const timestamp = new Date().toISOString();
  const criteria = item.hr.activeCriteria;
  const batch = {
    batchId: item.metadata.conversationId,
    conversationId: item.metadata.conversationId,
    assistantVersion: 1,
    jobDescriptionVersionId: item.hr.activeJobDescription.jobDescriptionVersionId,
    criteriaVersionId: criteria.criteriaVersionId,
    assessmentFingerprint: "a".repeat(64),
    status: "running",
    totalCount: item.hr.candidates.length,
    completedCount: Math.max(0, item.hr.candidates.length - 1),
    failedCount: 1,
    createdAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
  };
  item.hr.activeBatch = batch;
  item.hr.latestCompletedBatch = null;
  item.batchItems = item.hr.candidates.map((candidate, index) => {
    const failed = index === item.hr.candidates.length - 1;
    return {
      itemId: candidate.candidateId,
      batchId: batch.batchId,
      candidateId: candidate.candidateId,
      status: failed ? "failed" : "completed",
      attemptCount: 1,
      advisoryTier: failed ? null : "recommended",
      assessments: failed ? [] : [assessment(criteria.criteria[0].criterionId)],
      errorCode: failed ? "CANDIDATE_MODEL_UNAVAILABLE" : null,
      startedAt: timestamp,
      finishedAt: timestamp,
    };
  });
}

export function continueBatch(item) {
  const batch = item.hr.latestCompletedBatch;
  batch.status = "running";
  batch.finishedAt = null;
  item.hr.activeBatch = batch;
  item.hr.latestCompletedBatch = null;
}

function assessment(criterionId) {
  return {
    criterionId,
    decision: "meets",
    evidence: [{ blockId: "page-1:block-1", quote: "合成项目证据" }],
    missingInformation: [],
    followUpQuestions: [],
  };
}

function publicDraft(draft) {
  return {
    draftId: draft.draftId,
    assistantId: draft.assistantId,
    status: draft.status,
    expiresAt: draft.expiresAt,
  };
}

function setupResponse(item, reused) {
  const turn = item.turns[0];
  return {
    conversation: item.metadata,
    reused,
    turn: {
      conversationId: item.metadata.conversationId,
      turnId: turn.turnId,
      taskId: turn.taskId,
      userMessageId: item.messages[0].messageId,
      acceptedEventSeq: turn.acceptedEventSeq,
      status: turn.status,
      reused,
    },
    attachments: item.messages[0].content.attachments,
  };
}

async function readText(request) {
  let value = "";
  for await (const chunk of request) value += chunk;
  return value;
}
