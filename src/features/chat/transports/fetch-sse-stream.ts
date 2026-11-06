export interface ParsedSseEvent {
  event: string;
  data: unknown;
  id?: string;
}

interface EventState {
  event: string;
  data: string[];
  id?: string;
}

export async function* parseFetchSse(
  response: Response,
  signal?: AbortSignal,
): AsyncIterable<ParsedSseEvent> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: EventState = { event: "message", data: [] };
  let buffer = "";
  const onAbort = () => {
    void reader.cancel();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    if (signal?.aborted) {
      await reader.cancel();
      return;
    }

    while (!signal?.aborted) {
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await reader.read();
      } catch (error) {
        if (signal?.aborted) return;
        throw error;
      }

      buffer += decoder.decode(result.value, { stream: !result.done });
      const lines = takeCompleteLines(buffer, result.done);
      buffer = lines.rest;

      for (const line of lines.items) {
        const parsed = consumeLine(state, line);
        if (parsed) yield parsed;
      }

      if (result.done) return;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function takeCompleteLines(
  source: string,
  eof: boolean,
): { items: string[]; rest: string } {
  const items: string[] = [];
  let start = 0;
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char !== "\r" && char !== "\n") {
      index += 1;
      continue;
    }
    if (char === "\r" && index === source.length - 1 && !eof) break;

    items.push(source.slice(start, index));
    if (char === "\r" && source[index + 1] === "\n") index += 1;
    index += 1;
    start = index;
  }

  if (eof && start < source.length) {
    items.push(source.slice(start));
    start = source.length;
  }
  return { items, rest: source.slice(start) };
}

function consumeLine(
  state: EventState,
  line: string,
): ParsedSseEvent | undefined {
  if (line === "") {
    const parsed = dispatch(state);
    state.event = "message";
    state.data = [];
    state.id = undefined;
    return parsed;
  }
  if (line.startsWith(":")) return undefined;

  const separator = line.indexOf(":");
  const field = separator === -1 ? line : line.slice(0, separator);
  let value = separator === -1 ? "" : line.slice(separator + 1);
  if (value.startsWith(" ")) value = value.slice(1);

  if (field === "event") state.event = value || "message";
  if (field === "data") state.data.push(value);
  if (field === "id" && !value.includes("\0")) state.id = value;
  return undefined;
}

function dispatch(state: EventState): ParsedSseEvent | undefined {
  if (state.data.length === 0) return undefined;
  try {
    const parsed: ParsedSseEvent = {
      event: state.event,
      data: JSON.parse(state.data.join("\n")) as unknown,
    };
    if (state.id !== undefined) parsed.id = state.id;
    return parsed;
  } catch {
    return undefined;
  }
}
