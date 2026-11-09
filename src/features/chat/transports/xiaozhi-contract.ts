import { z } from "zod";

const dateString = z.string().refine(
  (value) => Number.isFinite(Date.parse(value)),
  "invalid datetime",
);

const threadSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  is_pinned: z.boolean(),
  updated_at: dateString,
});

const createdThreadSchema = z.object({
  id: z.string().min(1),
});

const createdRunSchema = z.object({
  run_id: z.string().min(1),
  thread_id: z.string().min(1),
});

const runResultSchema = z.object({
  status: z.string().min(1),
  output: z.string().nullable().optional(),
});

const historyMessageSchema = z.object({
  id: z.union([z.string(), z.number()]),
  type: z.string(),
  content: z.string(),
  created_at: dateString.nullable().optional(),
});

const historySchema = z.object({
  history: z.array(z.unknown()),
});

export type XiaozhiThread = z.infer<typeof threadSchema>;
export type XiaozhiHistoryMessage = z.infer<typeof historyMessageSchema>;

export function parseCreatedThread(payload: unknown): { id: string } {
  const parsed = createdThreadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("创建会话失败: 响应格式错误");
  return parsed.data;
}

export function parseCreatedRun(payload: unknown): {
  runId: string;
  threadId: string;
} {
  const parsed = createdRunSchema.safeParse(payload);
  if (!parsed.success) throw new Error("创建任务失败: 响应格式错误");
  return { runId: parsed.data.run_id, threadId: parsed.data.thread_id };
}

export function parseRunResult(payload: unknown): {
  status: string;
  output: string;
} {
  const parsed = runResultSchema.safeParse(payload);
  if (!parsed.success) throw new Error("读取任务结果失败: 响应格式错误");
  return {
    status: parsed.data.status,
    output: parsed.data.output ?? "",
  };
}

export function parseThreadList(payload: unknown): XiaozhiThread[] {
  const parsed = z.array(threadSchema).safeParse(payload);
  if (!parsed.success) throw new Error("会话列表响应格式错误");
  return parsed.data;
}

export function parseHistory(payload: unknown): XiaozhiHistoryMessage[] {
  const parsed = historySchema.safeParse(payload);
  if (!parsed.success) throw new Error("会话历史响应格式错误");
  return parsed.data.history.flatMap((item) => {
    const message = historyMessageSchema.safeParse(item);
    return message.success ? [message.data] : [];
  });
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : undefined;
}
