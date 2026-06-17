import type { ChatMessage, HistoryMessage } from '@/features/chat/types';

const MAX_RECENT = 20;
const MAX_PINNED = 10;
const CHARS_PER_TOKEN = 4;
const MAX_HISTORY_TOKENS = 40_000;

export function buildHistory(messages: ChatMessage[]): HistoryMessage[] {
  if (messages.length === 0) return [];

  const assistantMessages = messages.filter(m => m.role === 'assistant');
  const likedAssistants = assistantMessages
    .filter(m => m.liked === true)
    .slice(-MAX_PINNED);

  const pinnedPairs: ChatMessage[] = [];
  for (const msg of likedAssistants) {
    const idx = messages.indexOf(msg);
    if (idx > 0 && messages[idx - 1].role === 'user') {
      pinnedPairs.push(messages[idx - 1], msg);
    }
  }

  const pinnedIds = new Set(pinnedPairs.map(m => m.id));
  const recentMessages = messages
    .filter(m => !pinnedIds.has(m.id))
    .slice(-MAX_RECENT);

  const seen = new Set<string>();
  const combined: ChatMessage[] = [];
  for (const message of [...pinnedPairs, ...recentMessages]) {
    if (!seen.has(message.id)) {
      seen.add(message.id);
      combined.push(message);
    }
  }
  combined.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let totalChars = 0;
  const withinLimit: ChatMessage[] = [];
  for (const message of [...combined].reverse()) {
    totalChars += message.content.length;
    if (totalChars / CHARS_PER_TOKEN > MAX_HISTORY_TOKENS) break;
    withinLimit.unshift(message);
  }

  return withinLimit.map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    content: message.content,
  }));
}
