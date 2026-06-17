import type { ChatEvent, ChatPromptConfig, HistoryMessage } from '@/features/chat/types';
import { readChatDailyUsageHeaders, setChatDailyUsage } from '@/features/chat/dailyUsageStore';

// In production (Vercel) the API is same-origin at /api/v1.
// In local dev, Vite proxies /api to the FastAPI server (see vite.config.ts).
// Override with VITE_API_BASE_URL if the backend lives elsewhere.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export interface ChatDailyUsageResponse {
  limit: number;
  remaining: number;
}

const DAILY_USAGE_CACHE_TTL_MS = 30_000;
let dailyUsageCache: { value: ChatDailyUsageResponse; expiresAt: number } | null = null;
let pendingDailyUsageRequest: Promise<ChatDailyUsageResponse> | null = null;

function normalizeDailyUsage(data: Partial<ChatDailyUsageResponse>): ChatDailyUsageResponse {
  const limit = Number.isFinite(data.limit) ? Number(data.limit) : 10;
  const normalizedLimit = Math.max(1, limit);
  const remaining = Number.isFinite(data.remaining) ? Number(data.remaining) : normalizedLimit;

  return {
    limit: normalizedLimit,
    remaining: Math.max(0, Math.min(remaining, normalizedLimit)),
  };
}

function writeDailyUsageCache(usage: ChatDailyUsageResponse) {
  dailyUsageCache = {
    value: usage,
    expiresAt: Date.now() + DAILY_USAGE_CACHE_TTL_MS,
  };
}

function readDailyUsageFromHeaders(headers: Headers): ChatDailyUsageResponse | null {
  const limit = Number.parseInt(headers.get('X-Daily-Limit') ?? '', 10);
  const remaining = Number.parseInt(headers.get('X-Daily-Remaining') ?? '', 10);

  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) {
    return null;
  }

  return normalizeDailyUsage({ limit, remaining });
}

function syncDailyUsageFromHeaders(headers: Headers) {
  readChatDailyUsageHeaders(headers);

  const usage = readDailyUsageFromHeaders(headers);
  if (usage) {
    writeDailyUsageCache(usage);
  }
}

export async function fetchDailyUsage(): Promise<ChatDailyUsageResponse> {
  if (dailyUsageCache && dailyUsageCache.expiresAt > Date.now()) {
    return dailyUsageCache.value;
  }

  if (pendingDailyUsageRequest) {
    return pendingDailyUsageRequest;
  }

  pendingDailyUsageRequest = fetch(`${API_BASE_URL}/chat/daily-usage`)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Daily usage API Error: ${response.status} ${response.statusText}`);
      }

      syncDailyUsageFromHeaders(response.headers);

      const usage = normalizeDailyUsage(await response.json());
      writeDailyUsageCache(usage);
      return usage;
    })
    .finally(() => {
      pendingDailyUsageRequest = null;
    });

  return pendingDailyUsageRequest;
}

export class ChatRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`RATE_LIMITED:${retryAfterSeconds}`);
    this.name = 'ChatRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ChatDailyLimitError extends Error {
  constructor() {
    super('DAILY_LIMIT_EXCEEDED');
    this.name = 'ChatDailyLimitError';
  }
}

/**
 * Streaming chat API client
 * Yields ChatEvent objects as they arrive from the server
 */
export async function* streamChat(
  message: string,
  config?: ChatPromptConfig,
  history?: HistoryMessage[],
): AsyncGenerator<ChatEvent> {
  const body: any = { message };
  
  if (config) {
    if (config.systemInstruction) {
      body.system_instruction = config.systemInstruction;
    }
    if (config.examples && config.examples.length > 0) {
      body.few_shot_examples = config.examples.map(ex => ({
        input: ex.input,
        output: ex.output
      }));
    }
  }

  if (history && history.length > 0) {
    body.history = history;
  }

  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    syncDailyUsageFromHeaders(response.headers);
    await response.json().catch(() => ({}));
    const retryAfterHeader = response.headers.get('Retry-After');
    if (retryAfterHeader === '86400') {
      const limitedUsage = normalizeDailyUsage({ limit: dailyUsageCache?.value.limit, remaining: 0 });
      writeDailyUsageCache(limitedUsage);
      setChatDailyUsage(limitedUsage);
      throw new ChatDailyLimitError();
    }
    const retryAfterSeconds = Math.max(1, Number.parseInt(retryAfterHeader || '60', 10) || 60);
    throw new ChatRateLimitError(retryAfterSeconds);
  }

  syncDailyUsageFromHeaders(response.headers);

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          try {
            const event: ChatEvent = JSON.parse(trimmedLine);
            yield event;
          } catch (e) {
            console.warn('Failed to parse event:', trimmedLine);
          }
        }
      }
    }
    
    // Process any remaining data in buffer
    if (buffer.trim()) {
      try {
        const event: ChatEvent = JSON.parse(buffer.trim());
        yield event;
      } catch (e) {
        console.warn('Failed to parse final event:', buffer);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function summarizeConversation(
  messages: HistoryMessage[]
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/chat/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.summary ?? '';
}

export interface SharedTokenUsage {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  cachedTokens: number;
  requestCount: number;
}

export interface ChatModelInfo {
  modelId: string;
  displayName: string | null;
  inputTokenLimit: number;
  outputTokenLimit: number;
}

export async function fetchSharedTokenUsage(): Promise<SharedTokenUsage> {
  const res = await fetch(`${API_BASE_URL}/chat/token-usage`);
  if (!res.ok) {
    return {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      thoughtsTokens: 0,
      cachedTokens: 0,
      requestCount: 0,
    };
  }

  const data = await res.json();
  return {
    totalTokens: data.total_tokens,
    inputTokens: data.prompt_tokens,
    outputTokens: data.candidates_tokens,
    thoughtsTokens: data.thoughts_tokens,
    cachedTokens: data.cached_tokens,
    requestCount: data.request_count,
  };
}

export async function fetchChatModelInfo(): Promise<ChatModelInfo> {
  const res = await fetch(`${API_BASE_URL}/chat/model-info`);
  if (!res.ok) {
    throw new Error(`Model info API Error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return {
    modelId: data.model_id,
    displayName: data.display_name ?? null,
    inputTokenLimit: data.input_token_limit,
    outputTokenLimit: data.output_token_limit,
  };
}
