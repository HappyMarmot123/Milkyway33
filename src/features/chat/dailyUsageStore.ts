import { useSyncExternalStore } from 'react';

const DAILY_LIMIT = 10;

export interface ChatDailyUsageSnapshot {
  limit: number;
  remaining: number;
}

let snapshot: ChatDailyUsageSnapshot = {
  limit: DAILY_LIMIT,
  remaining: DAILY_LIMIT,
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
  const limit = next.limit ?? snapshot.limit;
  const remaining = next.remaining ?? snapshot.remaining;
  const normalized = {
    limit: Math.max(1, limit),
    remaining: Math.max(0, Math.min(remaining, Math.max(1, limit))),
  };

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
    () => ({ limit: DAILY_LIMIT, remaining: DAILY_LIMIT }),
  );
}
