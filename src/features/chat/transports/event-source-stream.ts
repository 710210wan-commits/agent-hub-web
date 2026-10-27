export interface EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export type EventSourceFactory = (url: string) => EventSourceLike;

export type EventSourceStreamItem =
  | { type: "message"; data: string }
  | { type: "error" };

type QueueItem = EventSourceStreamItem | { type: "closed" };

export async function* eventSourceStream(
  url: string,
  factory: EventSourceFactory,
  signal?: AbortSignal,
): AsyncIterable<EventSourceStreamItem> {
  const queue: QueueItem[] = [];
  let wake: (() => void) | undefined;
  const push = (item: QueueItem) => {
    queue.push(item);
    wake?.();
    wake = undefined;
  };

  const source = factory(url);
  source.onmessage = (event) => push({ type: "message", data: event.data });
  source.onerror = () => {
    source.close();
    push({ type: "error" });
  };
  const onAbort = () => {
    source.close();
    push({ type: "closed" });
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      const item = queue.shift();
      if (!item || item.type === "closed") return;
      yield item;
      if (item.type === "error") return;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    source.close();
  }
}
