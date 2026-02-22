import type { LiveChannelMessage } from "@/lib/live/types";

function canUseBroadcastChannel(): boolean {
  return typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined";
}

export function getLiveChannelName(sessionId: string): string {
  return `music-bingo-live:${sessionId}`;
}

function isValidMessage(value: unknown): value is LiveChannelMessage {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { type?: unknown };
  return maybe.type === "runtime_update" || maybe.type === "host_heartbeat" || maybe.type === "warning";
}

export function publishLiveMessage(sessionId: string, message: LiveChannelMessage): void {
  if (!canUseBroadcastChannel()) return;

  const channel = new BroadcastChannel(getLiveChannelName(sessionId));
  try {
    channel.postMessage(message);
  } finally {
    channel.close();
  }
}

export function subscribeLiveChannel(
  sessionId: string,
  handler: (message: LiveChannelMessage) => void
): () => void {
  if (!canUseBroadcastChannel()) {
    return () => {};
  }

  const channel = new BroadcastChannel(getLiveChannelName(sessionId));
  const onMessage = (event: MessageEvent<unknown>) => {
    if (!isValidMessage(event.data)) return;
    handler(event.data);
  };

  channel.addEventListener("message", onMessage);
  return () => {
    channel.removeEventListener("message", onMessage);
    channel.close();
  };
}
