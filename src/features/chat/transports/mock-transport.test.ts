import { describe, expect, it } from "vitest";

import type { ChatStreamEvent } from "../contracts/events";
import { mockRunFixtures } from "../fixtures/default-run";
import { createMockTransport } from "./mock-transport";

async function collect(stream: AsyncIterable<ChatStreamEvent>) {
  const events: ChatStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const emptySelection = {
  knowledgeBaseIds: [],
  skillIds: [],
  mcpIds: [],
};

describe("mock transport", () => {
  it("replays the completed fixture in deterministic order", async () => {
    const transport = createMockTransport({ delayMs: 0, scenario: "completed" });
    const run = await transport.createRun({
      mode: "daily",
      content: "测试问题",
      selection: emptySelection,
    });

    expect(run.runId).toBe("mock-run-completed");
    await expect(collect(transport.streamRun(run.runId))).resolves.toEqual(
      mockRunFixtures.completed,
    );
  });

  it("stops replay when the signal is aborted", async () => {
    const transport = createMockTransport({ delayMs: 20, scenario: "completed" });
    const controller = new AbortController();
    const run = await transport.createRun({
      mode: "daily",
      content: "测试问题",
      selection: emptySelection,
    });
    controller.abort();

    await expect(
      collect(transport.streamRun(run.runId, controller.signal)),
    ).resolves.toEqual([]);
  });

  it("ships fixtures for every visible terminal state", () => {
    const eventTypes = new Set(
      Object.values(mockRunFixtures)
        .flat()
        .map((event) => event.type),
    );

    expect(eventTypes).toEqual(
      new Set([
        "run.connected",
        "activity.update",
        "answer.delta",
        "answer.done",
        "run.stopped",
        "run.disconnected",
        "run.failed",
      ]),
    );
  });
});
