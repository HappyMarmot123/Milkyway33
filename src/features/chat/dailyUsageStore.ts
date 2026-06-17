import { useSyncExternalStore } from 'react';

export const DAILY_LIMIT = 10;

export interface ChatDailyUsageSnapshot {
  limit: number;
  remaining: number | null;
}

let snapshot: ChatDailyUsageSnapshot = {
  limit: DAILY_LIMIT,
  remaining: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChatDailyUsageSnapshot() {
  return snapshot;
}

export function setChatDailyUsage(next: Partial<ChatDailyUsageSnapshot>) {
  const limit = Math.max(1, next.limit ?? snapshot.limit);
  const remaining = next.remaining === undefined
    ? snapshot.remaining
    : next.remaining === null
      ? null
      : Math.max(0, Math.min(next.remaining, limit));
  const normalized = { limit, remaining };

  if (snapshot.limit === normalized.limit && snapshot.remaining === normalized.remaining) {
    return;
  }

  snapshot = normalized;
  emit();
}

export function readChatDailyUsageHeaders(headers: Headers) {
  const limit = Number.parseInt(headers.get('X-Daily-Limit') ?? '', 10);
  const remaining = Number.parseInt(headers.get('X-Daily-Remaining') ?? '', 10);

  if (Number.isFinite(limit) || Number.isFinite(remaining)) {
    setChatDailyUsage({
      limit: Number.isFinite(limit) ? limit : undefined,
      remaining: Number.isFinite(remaining) ? remaining : undefined,
    });
  }
}

export function useChatDailyUsage() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => ({ limit: DAILY_LIMIT, remaining: null }),
  );
}
