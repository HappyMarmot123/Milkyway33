import { useSyncExternalStore } from 'react';

export const CHAT_COOLDOWN_SECONDS = 60;

const CHAT_COOLDOWN_STORAGE_KEY = 'milkyway_chat_cooldown_until';

export interface ChatCooldownSnapshot {
  isActive: boolean;
  remainingSeconds: number;
  until: number;
}

const emptySnapshot: ChatCooldownSnapshot = {
  isActive: false,
  remainingSeconds: 0,
  until: 0,
};

const listeners = new Set<() => void>();
let timerId: number | null = null;
let snapshot: ChatCooldownSnapshot = emptySnapshot;

function readStoredCooldownUntil(): number {
  const raw = localStorage.getItem(CHAT_COOLDOWN_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSnapshot(): ChatCooldownSnapshot {
  const until = readStoredCooldownUntil();
  const remainingSeconds = Math.max(0, Math.ceil((until - Date.now()) / 1000));

  if (remainingSeconds <= 0) {
    if (until > 0) {
      localStorage.removeItem(CHAT_COOLDOWN_STORAGE_KEY);
    }
    return emptySnapshot;
  }

  return {
    isActive: true,
    remainingSeconds,
    until,
  };
}

function isSameSnapshot(next: ChatCooldownSnapshot): boolean {
  return (
    snapshot.isActive === next.isActive &&
    snapshot.remainingSeconds === next.remainingSeconds &&
    snapshot.until === next.until
  );
}

function emitIfChanged() {
  const next = buildSnapshot();
  if (isSameSnapshot(next)) return;

  snapshot = next;
  listeners.forEach((listener) => listener());
  syncTimer();
}

function syncTimer() {
  if (snapshot.isActive && timerId === null) {
    timerId = window.setInterval(emitIfChanged, 1000);
    return;
  }

  if (!snapshot.isActive && timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function handleStorage(event: StorageEvent) {
  if (event.key === CHAT_COOLDOWN_STORAGE_KEY) {
    emitIfChanged();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    window.addEventListener('storage', handleStorage);
  }

  emitIfChanged();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

export function getChatCooldownSnapshot(): ChatCooldownSnapshot {
  const next = buildSnapshot();
  if (!isSameSnapshot(next)) {
    snapshot = next;
    syncTimer();
  }
  return snapshot;
}

export function startChatCooldown(seconds = CHAT_COOLDOWN_SECONDS) {
  const nextCooldownUntil = Date.now() + seconds * 1000;
  localStorage.setItem(CHAT_COOLDOWN_STORAGE_KEY, String(nextCooldownUntil));
  emitIfChanged();
}

export function useChatCooldown() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => emptySnapshot,
  );
}
