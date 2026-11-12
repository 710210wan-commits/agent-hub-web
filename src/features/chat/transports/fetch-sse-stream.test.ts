import { describe, expect, it, vi } from "vitest";

import { parseFetchSse } from "./fetch-sse-stream";

function responseFromBytes(bytes: Uint8Array, chunkSizes: number[]): Response {
  let offset = 0;
  let chunkIndex = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }
        const size = chunkSizes[chunkIndex % chunkSizes.length] ?? bytes.length;
        chunkIndex += 1;
        controller.enqueue(bytes.slice(offset, offset + size));
        offset += size;
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function responseFromText(text: string, chunkSizes = [text.length]): Response {
  return responseFromBytes(new TextEncoder().encode(text), chunkSizes);
}

async function collect(response: Response, signal?: AbortSignal) {
  const events = [];
  for await (const event of parseFetchSse(response, signal)) events.push(event);
  return events;
}

describe("parseFetchSse", () => {
  it("parses CRLF and LF events across arbitrary byte boundaries", async () => {
    const response = responseFromText(
      ": heartbeat\r\n\r\nevent: messages\r\ndata: {\"text\":\"你好\"}\r\nid: 1-0\r\n\r\n" +
        "event: end\ndata: {\"ok\":true}\n\n",
      [1, 2, 5, 3],
    );

    await expect(collect(response)).resolves.toEqual([
      { event: "messages", data: { text: "你好" }, id: "1-0" },
      { event: "end", data: { ok: true } },
    ]);
  });

  it("joins multiline data and emits multiple events from one chunk", async () => {
    const response = responseFromText(
      "event: custom\n" +
        "data: {\n" +
        "data: \"status\": \"working\"\n" +
        "data: }\n" +
        "id: 2-0\n\n" +
        "event: end\ndata: {\"status\":\"completed\"}\n\n",
    );

    await expect(collect(response)).resolves.toEqual([
      { event: "custom", data: { status: "working" }, id: "2-0" },
      { event: "end", data: { status: "completed" } },
    ]);
  });

  it("keeps unnamed events observable as the SSE message default", async () => {
    const response = responseFromText(
      ": heartbeat\n\n" +
        "id: conversation:1\n" +
        "data: {\"type\":\"conversation.created\"}\n\n",
    );

    await expect(collect(response)).resolves.toEqual([
      {
        event: "message",
        id: "conversation:1",
        data: { type: "conversation.created" },
      },
    ]);
  });

  it("skips malformed JSON and continues at the next event", async () => {
    const response = responseFromText(
      "event: messages\ndata: {not-json}\n\n" +
        "event: messages\ndata: {\"value\":2}\n\n",
    );

    await expect(collect(response)).resolves.toEqual([
      { event: "messages", data: { value: 2 } },
    ]);
  });

  it("cancels an in-flight reader when aborted", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull: () => new Promise<void>(() => undefined),
        cancel,
      }),
    );
    const controller = new AbortController();
    const iterator = parseFetchSse(response, controller.signal)[Symbol.asyncIterator]();
    const pending = iterator.next();

    await Promise.resolve();
    controller.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
