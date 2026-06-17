# Codex 프론트엔드 구현 태스크

백엔드 구현(codex-tasks-backend.md) 완료 후 진행합니다.  
설계 전문: `docs/conversation-history-design.md`

구현 순서를 반드시 지킵니다: Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

---

## Task 1 — `src/features/chat/types.ts` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```ts
// Chat API Types
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: ChatMetadata;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageExample {
  input: string;
  output: string;
}

export interface ChatPromptConfig {
  systemInstruction?: string;
  examples?: ChatMessageExample[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  examples: ChatMessageExample[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMetadata {
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
}

export interface SafetyRating {
  category: string;
  probability: string;
}

export interface UsageMetadata {
  prompt_token_count?: number | null;
  cached_content_token_count?: number | null;
  candidates_token_count?: number | null;
  tool_use_prompt_token_count?: number | null;
  thoughts_token_count?: number | null;
  total_token_count?: number | null;
}

// SSE Event Types
export type ChatEventStatus = 
  | 'thinking' 
  | 'generating' 
  | 'streaming' 
  | 'complete' 
  | 'error';

export interface ChatEvent {
  status: ChatEventStatus;
  model?: string;
  chunk?: string;
  response?: string;
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
  message?: string;
}

// Chat State
export interface ChatState {
  status: 'idle' | 'thinking' | 'generating' | 'streaming';
  messages: ChatMessage[];
  currentResponse: string;
  currentMetadata: ChatMetadata | null;
  error: string | null;
  promptConfig: ChatPromptConfig;
}
```

### 변경 사항

1. `ChatMessage`에 `liked`, `pinned` 필드 추가
2. `HistoryMessage` 인터페이스 추가 (백엔드 Gemini API 전송용 형식)

### 완성 코드

```ts
// Chat API Types
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: ChatMetadata;
  liked?: true | false | null;  // null = 피드백 없음
  pinned?: boolean;             // true = 히스토리에 항상 포함
}

// Gemini API 전송용 히스토리 메시지 형식
export interface HistoryMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageExample {
  input: string;
  output: string;
}

export interface ChatPromptConfig {
  systemInstruction?: string;
  examples?: ChatMessageExample[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  examples: ChatMessageExample[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMetadata {
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
}

export interface SafetyRating {
  category: string;
  probability: string;
}

export interface UsageMetadata {
  prompt_token_count?: number | null;
  cached_content_token_count?: number | null;
  candidates_token_count?: number | null;
  tool_use_prompt_token_count?: number | null;
  thoughts_token_count?: number | null;
  total_token_count?: number | null;
}

// SSE Event Types
export type ChatEventStatus = 
  | 'thinking' 
  | 'generating' 
  | 'streaming' 
  | 'complete' 
  | 'error';

export interface ChatEvent {
  status: ChatEventStatus;
  model?: string;
  chunk?: string;
  response?: string;
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
  message?: string;
}

// Chat State
export interface ChatState {
  status: 'idle' | 'thinking' | 'generating' | 'streaming';
  messages: ChatMessage[];
  currentResponse: string;
  currentMetadata: ChatMetadata | null;
  error: string | null;
  promptConfig: ChatPromptConfig;
}
```

### 주의사항
- `liked` 타입은 `true | false | null` (boolean이 아님). `null`은 피드백 없음, `false`는 싫어요
- `HistoryMessage.role`은 `'user' | 'model'` (Gemini API 규격, `'assistant'` 아님)

---

## Task 2 — `src/lib/db.ts` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```ts
import Dexie, { type EntityTable } from 'dexie';
import { ChatMessage, ChatPromptConfig, Conversation, PromptTemplate } from '@/features/chat/types';

export interface PromptConfigEntity {
    id: string;
    config: ChatPromptConfig;
    updatedAt: Date;
}

export interface TokenUsageEntity {
    id: string;
    modelId?: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    toolUsePromptTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
    requestCount: number;
    updatedAt: Date;
}

export type MilkywayDB = Dexie & {
    conversations: EntityTable<Conversation, 'id'>;
    messages: EntityTable<ChatMessage, 'id'>;
    configs: EntityTable<PromptConfigEntity, 'id'>;
    tokenUsage: EntityTable<TokenUsageEntity, 'id'>;
    promptTemplates: EntityTable<PromptTemplate, 'id'>;
};

let dbInstance: MilkywayDB | null = null;

export function dexieInit(): MilkywayDB {
    if (dbInstance) return dbInstance;

    const db = new Dexie('MilkywayDB') as MilkywayDB;

    db.version(3).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt'
    });

    db.version(4).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt',
        promptTemplates: 'id, name, updatedAt'
    });

    dbInstance = db;
    return db;
}
```

### 변경 사항

`db.version(5)` 마이그레이션 추가: `messages` 스토어에 `liked` 인덱스 추가.  
기존 version 3, 4는 그대로 유지.

### 완성 코드

```ts
import Dexie, { type EntityTable } from 'dexie';
import { ChatMessage, ChatPromptConfig, Conversation, PromptTemplate } from '@/features/chat/types';

export interface PromptConfigEntity {
    id: string;
    config: ChatPromptConfig;
    updatedAt: Date;
}

export interface TokenUsageEntity {
    id: string;
    modelId?: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    toolUsePromptTokens: number;
    thoughtsTokens: number;
    totalTokens: number;
    requestCount: number;
    updatedAt: Date;
}

export type MilkywayDB = Dexie & {
    conversations: EntityTable<Conversation, 'id'>;
    messages: EntityTable<ChatMessage, 'id'>;
    configs: EntityTable<PromptConfigEntity, 'id'>;
    tokenUsage: EntityTable<TokenUsageEntity, 'id'>;
    promptTemplates: EntityTable<PromptTemplate, 'id'>;
};

let dbInstance: MilkywayDB | null = null;

export function dexieInit(): MilkywayDB {
    if (dbInstance) return dbInstance;

    const db = new Dexie('MilkywayDB') as MilkywayDB;

    db.version(3).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt'
    });

    db.version(4).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt',
        promptTemplates: 'id, name, updatedAt'
    });

    db.version(5).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp, liked',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt',
        promptTemplates: 'id, name, updatedAt'
    });

    dbInstance = db;
    return db;
}
```

### 주의사항
- `version(3)`, `version(4)` 블록은 절대 수정하지 않음 (기존 사용자 마이그레이션 체인 보존)
- `liked` 인덱스가 필요한 이유: `db.messages.where('liked').equals(true)` 조회를 빠르게 하기 위함

---

## Task 3 — `src/lib/historyBuilder.ts` 신규 생성

### 작업 유형
신규 파일 생성

### 생성할 파일 전체 코드

```ts
import type { ChatMessage, HistoryMessage } from '@/features/chat/types';

const MAX_RECENT = 20;
const MAX_PINNED = 10;
const CHARS_PER_TOKEN = 4;
const MAX_HISTORY_TOKENS = 40_000;

/**
 * storedMessages(현재 대화의 DB 저장 메시지 전체)를 받아
 * Gemini API에 전달할 히스토리 배열을 반환한다.
 *
 * 구성 순서:
 * 1. 좋아요 누른 assistant 메시지 + 직전 user 메시지 쌍 (고정, 최대 10쌍)
 * 2. 고정되지 않은 최근 메시지 (최대 20개)
 * 3. 시간순 정렬 후 토큰 상한(40,000) 초과분 앞쪽 제거
 *
 * 호출 시점: sendMessage에서 사용자 메시지를 DB에 저장하기 전.
 * storedMessages에 현재 사용자 입력은 포함되지 않으므로 slice 불필요.
 */
export function buildHistory(messages: ChatMessage[]): HistoryMessage[] {
  if (messages.length === 0) return [];

  // 1. 고정 쌍: 좋아요 누른 assistant 메시지 중 최근 MAX_PINNED개와 직전 user 메시지
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

  // 2. 최근 메시지: 고정되지 않은 메시지 중 최근 MAX_RECENT개
  const pinnedIds = new Set(pinnedPairs.map(m => m.id));
  const recentMessages = messages
    .filter(m => !pinnedIds.has(m.id))
    .slice(-MAX_RECENT);

  // 3. 합산 후 중복 제거 + 시간순 정렬
  const seen = new Set<string>();
  const combined: ChatMessage[] = [];
  for (const m of [...pinnedPairs, ...recentMessages]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      combined.push(m);
    }
  }
  combined.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 4. 토큰 상한 검사: 뒤에서부터 누적, 초과하면 앞쪽 자름
  let totalChars = 0;
  const withinLimit: ChatMessage[] = [];
  for (const msg of [...combined].reverse()) {
    totalChars += msg.content.length;
    if (totalChars / CHARS_PER_TOKEN > MAX_HISTORY_TOKENS) break;
    withinLimit.unshift(msg);
  }

  // 5. Gemini API 형식으로 변환
  return withinLimit.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    content: m.content,
  }));
}
```

### 주의사항
- 이 함수는 `sendMessage`에서 사용자 메시지를 DB에 저장하기 **전에** 호출됨
- `storedMessages`는 `useLiveQuery` 기반이라 현재 렌더 시점의 스냅샷이므로, 방금 저장한 메시지는 아직 포함되지 않음
- 따라서 `slice(0, -1)`로 마지막 메시지를 제거할 필요 없음

---

## Task 4 — `src/services/chatRepository.ts` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

(전체 파일 — 149줄)

```ts
import { dexieInit } from '@/lib/db';
import type { TokenUsageEntity } from '@/lib/db';
import { ChatMessage, ChatPromptConfig, Conversation, type UsageMetadata } from '@/features/chat/types';

const CONFIG_KEY = 'default_config';
const TOKEN_USAGE_KEY = 'total_usage';
const MODEL_USAGE_PREFIX = 'model_usage:';

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const chatRepository = {
  // Conversations
  async createConversation(title?: string): Promise<Conversation> { ... },
  async getConversation(id: string): Promise<Conversation | undefined> { ... },
  async getAllConversations(): Promise<Conversation[]> { ... },
  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> { ... },
  async deleteConversation(id: string): Promise<void> { ... },

  // Messages
  async saveMessage(message: ChatMessage): Promise<void> { ... },
  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> { ... },
  async deleteMessages(ids: string[]): Promise<void> { ... },
  async clearConversationMessages(conversationId: string): Promise<void> { ... },

  // Settings
  async saveSettings(config: ChatPromptConfig): Promise<void> { ... },
  async getSettings(): Promise<ChatPromptConfig | null> { ... },

  // Token Usage
  async addTokenUsage(...): Promise<void> { ... },
  async addGeminiUsage(usage: UsageMetadata, modelId?: string): Promise<void> { ... },
  async getTotalTokenUsage(): Promise<TokenUsageEntity> { ... },
  async getTokenUsageByModel(): Promise<TokenUsageEntity[]> { ... },
  async resetTokenUsage(): Promise<void> { ... },
};
```

실제 파일 위치: `src/services/chatRepository.ts`  
파일을 열어 전체 내용을 확인한 뒤 아래 메서드 2개를 `chatRepository` 객체 안에 추가한다.

### 추가할 메서드 (Messages 섹션 끝에 삽입)

```ts
  async setMessageLiked(
    messageId: string,
    liked: true | false | null
  ): Promise<void> {
    const db = dexieInit();
    await db.messages.update(messageId, {
      liked,
      pinned: liked === true,
    });
  },

  async getLikedMessages(): Promise<ChatMessage[]> {
    const db = dexieInit();
    return await db.messages
      .where('liked').equals(1)  // Dexie는 boolean을 0/1로 저장
      .reverse()
      .toArray();
  },
```

### 주의사항
- 기존 메서드 일체 수정하지 않음
- `getLikedMessages`에서 `.equals(true)` 대신 `.equals(1)` 사용: Dexie IndexedDB에서 boolean `true`는 `1`로 저장됨
- 삽입 위치: `clearConversationMessages` 메서드 바로 뒤, Settings 섹션 시작 전

---

## Task 5 — `src/api/chat.ts` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

(실제 파일: `src/api/chat.ts` 전체 193줄)

핵심 함수 시그니처:
```ts
export async function* streamChat(message: string, config?: ChatPromptConfig): AsyncGenerator<ChatEvent>
```

### 변경 사항

1. `streamChat` 함수에 `history?: HistoryMessage[]` 파라미터 추가
2. `body`에 `history` 포함 로직 추가
3. `summarizeConversation` 함수 신규 추가 (파일 맨 아래)

### 변경할 부분 1: import 수정

```ts
// 변경 전
import type { ChatEvent, ChatPromptConfig } from '@/features/chat/types';

// 변경 후
import type { ChatEvent, ChatPromptConfig, HistoryMessage } from '@/features/chat/types';
```

### 변경할 부분 2: streamChat 시그니처 및 body 구성

```ts
// 변경 전
export async function* streamChat(message: string, config?: ChatPromptConfig): AsyncGenerator<ChatEvent> {
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

  const response = await fetch(`${API_BASE_URL}/chat`, {

// 변경 후
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
```

### 변경할 부분 3: 파일 맨 아래에 추가

```ts
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
```

### 주의사항
- `fetchDailyUsage`, rate limit 에러 처리 등 기존 로직은 변경하지 않음
- `streamChat` 내부 스트리밍 처리 로직(reader, decoder, buffer)은 변경하지 않음

---

## Task 6 — `src/hooks/useChat.ts` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

(실제 파일: `src/hooks/useChat.ts` 전체 288줄)

### 변경 사항 목록

1. `import` 2개 추가
2. `sendMessage` 내부: history 빌드 후 `streamChat` 전달
3. `sendMessage` 내부 `complete` 케이스: 6개 도달 시 자동 요약
4. `setMessageLiked` 콜백 추가
5. `return` 값에 `setMessageLiked` 추가

### 변경할 부분 1: import 추가

```ts
// 기존 import 아래에 추가
import { buildHistory } from '@/lib/historyBuilder';
import { summarizeConversation } from '@/api/chat';
```

### 변경할 부분 2: sendMessage 내 streamChat 호출 수정

```ts
// 변경 전 (useChat.ts 120번째 줄 근처)
      for await (const event of streamChat(content, promptConfig)) {

// 변경 후
      const history = buildHistory(storedMessages);
      for await (const event of streamChat(content, promptConfig, history)) {
```

### 변경할 부분 3: complete 케이스에서 자동 요약 추가

assistantMessage를 DB에 저장하는 `await chatRepository.saveMessage(assistantMessage)` 바로 뒤에 추가:

```ts
              // 3턴(6개 메시지) 도달 시 자동 요약으로 대화 제목 갱신
              // storedMessages는 LiveQuery 스냅샷이라 아직 이번 턴 2개가 반영 안 됨
              if (storedMessages.length + 2 === 6) {
                const historyForSummary: import('@/features/chat/types').HistoryMessage[] = [
                  ...storedMessages,
                  userMessage,
                  assistantMessage,
                ].map(m => ({
                  role: m.role === 'assistant' ? 'model' : 'user',
                  content: m.content,
                }));
                summarizeConversation(historyForSummary).then(summary => {
                  if (summary) {
                    chatRepository.updateConversation(conversationId, { title: summary });
                  }
                });
              }
```

### 변경할 부분 4: setMessageLiked 콜백 추가

`clearError` 콜백 선언 아래에 추가:

```ts
  const setMessageLiked = useCallback(async (
    messageId: string,
    liked: true | false | null
  ) => {
    await chatRepository.setMessageLiked(messageId, liked);
  }, []);
```

### 변경할 부분 5: return 값에 추가

```ts
  return {
    // ... 기존 return 값들 ...
    setMessageLiked,  // 추가
  };
```

### 주의사항
- `storedMessages`는 `useLiveQuery` 기반 스냅샷이므로, `sendMessage` 콜백 내에서는 이번 턴에 저장한 메시지가 아직 반영되지 않음
- 자동 요약 실패는 무시 (제목이 갱신 안 될 뿐, 채팅에는 영향 없음)
- `HistoryMessage` 타입 import는 inline type import 사용 (`import('@/features/chat/types').HistoryMessage`)
- `userMessage`와 `assistantMessage` 변수는 이미 해당 스코프에 존재함 (기존 코드 확인)

---

## Task 7 — `src/contexts/ChatContext.tsx` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```ts
import { createContext, useContext } from 'react';
import { useChat } from '@/hooks/useChat';

type ChatContextType = ReturnType<typeof useChat>;

export type ChatActionsContextType = Pick<
  ChatContextType,
  | 'sendMessage'
  | 'regenerateLastResponse'
  | 'clearMessages'
  | 'clearError'
  | 'setError'
  | 'setPromptConfig'
  | 'createNewConversation'
  | 'switchConversation'
  | 'deleteConversation'
  | 'renameConversation'
>;

export type ChatMessagesContextType = Pick<
  ChatContextType,
  'messages'
>;

export type ChatConversationsContextType = Pick<
  ChatContextType,
  'conversations' | 'currentConversationId'
>;

export type ChatHasMessagesContextType = {
  hasMessages: boolean;
};

export type ChatRuntimeContextType = Pick<
  ChatContextType,
  'status' | 'currentMetadata' | 'error' | 'isLoading'
>;

export type ChatStreamingContextType = Pick<
  ChatContextType,
  'currentResponse'
>;

export type ChatConfigContextType = Pick<ChatContextType, 'promptConfig'>;

export const ChatActionsContext = createContext<ChatActionsContextType | null>(null);
export const ChatMessagesContext = createContext<ChatMessagesContextType | null>(null);
export const ChatConversationsContext = createContext<ChatConversationsContextType | null>(null);
export const ChatHasMessagesContext = createContext<ChatHasMessagesContextType | null>(null);
export const ChatRuntimeContext = createContext<ChatRuntimeContextType | null>(null);
export const ChatStreamingContext = createContext<ChatStreamingContextType | null>(null);
export const ChatConfigContext = createContext<ChatConfigContextType | null>(null);

function useRequiredContext<T>(context: T | null, hookName: string) {
  if (!context) {
    throw new Error(`${hookName} must be used within a ChatProvider`);
  }
  return context;
}

export function useChatActions() {
  return useRequiredContext(useContext(ChatActionsContext), 'useChatActions');
}
// ... 나머지 훅들
```

### 변경 사항

`ChatActionsContextType`의 `Pick` 목록에 `'setMessageLiked'` 추가.

### 변경할 부분

```ts
// 변경 전
export type ChatActionsContextType = Pick<
  ChatContextType,
  | 'sendMessage'
  | 'regenerateLastResponse'
  | 'clearMessages'
  | 'clearError'
  | 'setError'
  | 'setPromptConfig'
  | 'createNewConversation'
  | 'switchConversation'
  | 'deleteConversation'
  | 'renameConversation'
>;

// 변경 후
export type ChatActionsContextType = Pick<
  ChatContextType,
  | 'sendMessage'
  | 'regenerateLastResponse'
  | 'clearMessages'
  | 'clearError'
  | 'setError'
  | 'setPromptConfig'
  | 'createNewConversation'
  | 'switchConversation'
  | 'deleteConversation'
  | 'renameConversation'
  | 'setMessageLiked'
>;
```

### 주의사항
- 이 파일의 나머지 코드(Context 생성, 훅 함수들)는 변경하지 않음

---

## Task 8 — `src/contexts/ChatProvider.tsx` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```tsx
import { ReactNode, useMemo, useRef } from "react";
import {
  ChatActionsContext,
  ChatConfigContext,
  ChatConversationsContext,
  ChatHasMessagesContext,
  ChatMessagesContext,
  ChatRuntimeContext,
  ChatStreamingContext,
  type ChatActionsContextType,
  // ... 나머지 타입들
} from "@/contexts/ChatContext";
import { useChat } from "@/hooks/useChat";

export function ChatProvider({ children }: { children: ReactNode }) {
  const chat = useChat();
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const actions = useMemo<ChatActionsContextType>(() => ({
    sendMessage: (...args) => chatRef.current.sendMessage(...args),
    regenerateLastResponse: (...args) => chatRef.current.regenerateLastResponse(...args),
    clearMessages: (...args) => chatRef.current.clearMessages(...args),
    clearError: (...args) => chatRef.current.clearError(...args),
    setError: (...args) => chatRef.current.setError(...args),
    setPromptConfig: (...args) => chatRef.current.setPromptConfig(...args),
    createNewConversation: (...args) => chatRef.current.createNewConversation(...args),
    switchConversation: (...args) => chatRef.current.switchConversation(...args),
    deleteConversation: (...args) => chatRef.current.deleteConversation(...args),
    renameConversation: (...args) => chatRef.current.renameConversation(...args),
  }), []);

  // ... 나머지 context 값들 및 Provider 트리
}
```

### 변경 사항

`actions` useMemo 객체에 `setMessageLiked` 한 줄 추가.

### 변경할 부분

```ts
// 변경 전
  const actions = useMemo<ChatActionsContextType>(() => ({
    sendMessage: (...args) => chatRef.current.sendMessage(...args),
    regenerateLastResponse: (...args) => chatRef.current.regenerateLastResponse(...args),
    clearMessages: (...args) => chatRef.current.clearMessages(...args),
    clearError: (...args) => chatRef.current.clearError(...args),
    setError: (...args) => chatRef.current.setError(...args),
    setPromptConfig: (...args) => chatRef.current.setPromptConfig(...args),
    createNewConversation: (...args) => chatRef.current.createNewConversation(...args),
    switchConversation: (...args) => chatRef.current.switchConversation(...args),
    deleteConversation: (...args) => chatRef.current.deleteConversation(...args),
    renameConversation: (...args) => chatRef.current.renameConversation(...args),
  }), []);

// 변경 후
  const actions = useMemo<ChatActionsContextType>(() => ({
    sendMessage: (...args) => chatRef.current.sendMessage(...args),
    regenerateLastResponse: (...args) => chatRef.current.regenerateLastResponse(...args),
    clearMessages: (...args) => chatRef.current.clearMessages(...args),
    clearError: (...args) => chatRef.current.clearError(...args),
    setError: (...args) => chatRef.current.setError(...args),
    setPromptConfig: (...args) => chatRef.current.setPromptConfig(...args),
    createNewConversation: (...args) => chatRef.current.createNewConversation(...args),
    switchConversation: (...args) => chatRef.current.switchConversation(...args),
    deleteConversation: (...args) => chatRef.current.deleteConversation(...args),
    renameConversation: (...args) => chatRef.current.renameConversation(...args),
    setMessageLiked: (...args) => chatRef.current.setMessageLiked(...args),  // 추가
  }), []);
```

### 주의사항
- `actions` useMemo 외 나머지 코드(messages, conversations, runtime, streaming, config context)는 변경하지 않음

---

## Task 9 — `src/components/features/ResponseActionContainer.tsx` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```tsx
import { useState } from "react";
import type { ComponentType } from "react";
import { ThumbsUp, ThumbsDown, RotateCw, Copy, MoreVertical, Check, Volume2, FileText, Mail } from "lucide-react";
// ... tooltip, dropdown imports

interface ResponseActionContainerProps {
  content: string;
  onRegenerate?: () => void;
  onFeedback?: (type: 'up' | 'down') => void;
  className?: string;
}

export function ResponseActionContainer({ content, onRegenerate, onFeedback, className = "" }) {
  const [isCopied, setIsCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleFeedback = (type: 'up' | 'down') => {
    const newFeedback = feedback === type ? null : type;
    setFeedback(newFeedback);
    if (onFeedback && newFeedback) onFeedback(newFeedback);
  };

  return (
    <div ...>
      <ActionButton isActive={feedback === 'up'} ... />
      <ActionButton isActive={feedback === 'down'} ... />
      ...
    </div>
  );
}
```

### 변경 사항

1. `interface ResponseActionContainerProps`에 `feedbackState?: 'up' | 'down' | null` 추가
2. 함수 파라미터에 `feedbackState` 추가
3. 내부 `feedback` `useState` 제거
4. `handleFeedback` 로직: 토글 계산 시 `feedbackState` 기준으로 변경, `onFeedback` 항상 호출
5. `ActionButton`의 `isActive` prop을 `feedbackState` 기반으로 변경

### 완성 코드

```tsx
import { useState } from "react";
import type { ComponentType } from "react";
import { 
  ThumbsUp, 
  ThumbsDown, 
  RotateCw, 
  Copy, 
  MoreVertical, 
  Check,
  Volume2,
  FileText,
  Mail
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResponseActionContainerProps {
  content: string;
  onRegenerate?: () => void;
  onFeedback?: (type: 'up' | 'down' | null) => void;
  feedbackState?: 'up' | 'down' | null;
  className?: string;
}

function ActionButton({ 
  icon: Icon, 
  label, 
  onClick, 
  isActive = false 
}: { 
  icon: ComponentType<{ className?: string; strokeWidth?: number }>; 
  label: string; 
  onClick: () => void; 
  isActive?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`p-1 !bg-transparent ${
              isActive 
                ? "text-blue-400" 
                : "text-zinc-500 hover:text-zinc-200"
            }`}
            onClick={onClick}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-200 border-zinc-700/50"
          sideOffset={5}
        >
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResponseActionContainer({ 
  content, 
  onRegenerate, 
  onFeedback,
  feedbackState = null,
  className = ""
}: ResponseActionContainerProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFeedback = (type: 'up' | 'down') => {
    const next = feedbackState === type ? null : type;
    onFeedback?.(next);
  };

  return (
    <div className={`flex items-center gap-3 mt-3 ml-1 ${className}`}>
      <ActionButton 
        icon={ThumbsUp} 
        label="Good response" 
        onClick={() => handleFeedback('up')}
        isActive={feedbackState === 'up'}
      />
      <ActionButton 
        icon={ThumbsDown} 
        label="Bad response" 
        onClick={() => handleFeedback('down')}
        isActive={feedbackState === 'down'}
      />
      <ActionButton 
        icon={RotateCw} 
        label="Regenerate" 
        onClick={() => onRegenerate?.()} 
      />
      <ActionButton 
        icon={isCopied ? Check : Copy} 
        label={isCopied ? "Copied" : "Copy"} 
        onClick={handleCopy} 
      />
      
      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1.5 !bg-transparent rounded-full transition-all duration-200 focus:outline-none text-zinc-500 hover:text-zinc-200 hover:scale-105 data-[state=open]:text-zinc-200"
                >
                  <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-200 border-zinc-700/50"
              sideOffset={5}
            >
              <p>More</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <DropdownMenuContent align="start" className="w-56 bg-[#1e1e1e] border-zinc-800 text-zinc-300">
          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer gap-2">
            <Volume2 className="h-4 w-4" />
            <span>Listen Voice</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer gap-2">
            <FileText className="h-4 w-4" />
            <span>Export to Docs</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer gap-2">
            <Mail className="h-4 w-4" />
            <span>Email Send</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

### 주의사항
- `feedback` localStorage 제거됨. 상태는 DB → `message.liked` → `feedbackState` prop으로만 관리
- `onFeedback` 시그니처가 `(type: 'up' | 'down')` → `(type: 'up' | 'down' | null)`로 변경됨 (취소 시 `null` 전달)
- DropdownMenu 항목(Listen Voice, Export to Docs, Email Send)은 기존 유지

---

## Task 10 — `src/components/chat/ChatMessageItem.tsx` 수정

### 작업 유형
기존 파일 수정

### 현재 파일 내용

```tsx
import { memo, useCallback } from "react";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { ResponseActionContainer } from "@/components/features/ResponseActionContainer";
import type { ChatMessage } from "@/features/chat/types";

interface ChatMessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate: () => void;
}

const ChatMessageItem = memo(({ message, isLast, onRegenerate }: ChatMessageItemProps) => {
  const handleRegenerate = useCallback(() => {
    if (isLast) {
      onRegenerate();
    }
  }, [isLast, onRegenerate]);

  return (
    <div>
      {message.role === "assistant" && message.metadata?.thought && (
        <Reasoning className="w-full" isStreaming={false}>
          <ReasoningTrigger />
          <ReasoningContent>{message.metadata.thought}</ReasoningContent>
        </Reasoning>
      )}

      <Message from={message.role}>
        <MessageContent>
          <MessageResponse>{message.content}</MessageResponse>
        </MessageContent>
        {message.role === "assistant" && (
          <ResponseActionContainer
            content={message.content}
            onRegenerate={handleRegenerate}
          />
        )}
      </Message>
    </div>
  );
});

ChatMessageItem.displayName = "ChatMessageItem";
export { ChatMessageItem };
```

### 변경 사항

1. `useChatActions` import 추가
2. `handleFeedback` 콜백 추가
3. `ResponseActionContainer`에 `onFeedback`, `feedbackState` props 전달

### 완성 코드

```tsx
import { memo, useCallback } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { ResponseActionContainer } from "@/components/features/ResponseActionContainer";
import type { ChatMessage } from "@/features/chat/types";
import { useChatActions } from "@/contexts/ChatContext";

interface ChatMessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate: () => void;
}

const ChatMessageItem = memo(({ message, isLast, onRegenerate }: ChatMessageItemProps) => {
  const { setMessageLiked } = useChatActions();

  const handleRegenerate = useCallback(() => {
    if (isLast) {
      onRegenerate();
    }
  }, [isLast, onRegenerate]);

  const handleFeedback = useCallback((type: 'up' | 'down' | null) => {
    if (message.role !== 'assistant') return;
    setMessageLiked(message.id, type === 'up' ? true : type === 'down' ? false : null);
  }, [message.id, message.role, setMessageLiked]);

  const feedbackState = message.liked === true ? 'up'
    : message.liked === false ? 'down'
    : null;

  return (
    <div>
      {message.role === "assistant" && message.metadata?.thought && (
        <Reasoning className="w-full" isStreaming={false}>
          <ReasoningTrigger />
          <ReasoningContent>{message.metadata.thought}</ReasoningContent>
        </Reasoning>
      )}

      <Message from={message.role}>
        <MessageContent>
          <MessageResponse>{message.content}</MessageResponse>
        </MessageContent>
        {message.role === "assistant" && (
          <ResponseActionContainer
            content={message.content}
            onRegenerate={handleRegenerate}
            onFeedback={handleFeedback}
            feedbackState={feedbackState}
          />
        )}
      </Message>
    </div>
  );
});

ChatMessageItem.displayName = "ChatMessageItem";
export { ChatMessageItem };
```

### 주의사항
- `message.liked`는 `true | false | null | undefined`. `undefined`는 `null`과 동일하게 처리됨
- `useChatActions()`는 반드시 `ChatProvider` 내부에서 호출됨 (기존 구조 유지)

---

## Task 11 — `src/components/features/LikedMessagesPanel.tsx` 신규 생성

### 작업 유형
신규 파일 생성

### 참고: 기존 사이드바 패턴 (`src/components/layout/AppSidebar.tsx`)

```tsx
// SettingsModal 패턴 참고
const [isSettingsOpen, setIsSettingsOpen] = useState(false);
// ...
<SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
```

기존 사이드바에는 설정 버튼이 있고, 클릭 시 `SettingsModal`이 열림.  
`LikedMessagesPanel`도 동일하게 Sheet(드로어)로 구현한다.

### 생성할 파일 전체 코드

```tsx
import { useEffect, useState } from "react";
import { Bookmark, ExternalLink, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatRepository } from "@/services/chatRepository";
import type { ChatMessage } from "@/features/chat/types";
import { useChatActions } from "@/contexts/ChatContext";

interface LikedMessagesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LikedMessagesPanel({ open, onOpenChange }: LikedMessagesPanelProps) {
  const [likedMessages, setLikedMessages] = useState<ChatMessage[]>([]);
  const { switchConversation, setMessageLiked } = useChatActions();

  useEffect(() => {
    if (!open) return;
    chatRepository.getLikedMessages().then(setLikedMessages);
  }, [open]);

  const handleNavigate = (conversationId: string) => {
    switchConversation(conversationId);
    onOpenChange(false);
  };

  const handleRemove = async (messageId: string) => {
    await setMessageLiked(messageId, null);
    setLikedMessages(prev => prev.filter(m => m.id !== messageId));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[380px] bg-bg-100 border-white/10 flex flex-col p-0"
      >
        <SheetHeader className="px-5 py-4 border-b border-white/10">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Bookmark className="h-4 w-4 text-orange-400" />
            저장된 응답
            {likedMessages.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {likedMessages.length}개
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {likedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                <Bookmark className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground/50">
                좋아요를 누른 응답이 없습니다
              </p>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              {likedMessages.map(message => (
                <div
                  key={message.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2"
                >
                  <p className="text-xs text-foreground/80 line-clamp-4 leading-relaxed">
                    {message.content}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <span className="text-[10px] text-muted-foreground/50">
                      {new Date(message.timestamp).toLocaleDateString('ko-KR')}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleNavigate(message.conversationId)}
                        title="대화로 이동"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-400"
                        onClick={() => handleRemove(message.id)}
                        title="저장 취소"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
```

### AppSidebar.tsx에도 추가 필요

`src/components/layout/AppSidebar.tsx`를 열어 아래 2가지를 추가한다.

**import 추가:**
```tsx
import { LikedMessagesPanel } from "@/components/features/LikedMessagesPanel";
import { Bookmark } from "lucide-react";
```

**상태 추가 (기존 `isSettingsOpen` 선언 아래에):**
```tsx
const [isLikedOpen, setIsLikedOpen] = useState(false);
```

**버튼 추가 (Settings 버튼 바로 위에):**
```tsx
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  onClick={() => setIsLikedOpen(true)}
                  className="flex w-full items-center gap-3 h-10 px-3 rounded-xl transition-all duration-200 !bg-transparent hover:!bg-white/5 text-foreground/70 hover:text-foreground"
                >
                  <Bookmark className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-sm font-medium">저장된 응답</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
```

**Panel 추가 (`<SettingsModal ... />` 바로 아래에):**
```tsx
      <LikedMessagesPanel open={isLikedOpen} onOpenChange={setIsLikedOpen} />
```

### 주의사항
- `Sheet`는 기존 프로젝트에 이미 설치된 shadcn/ui 컴포넌트 (`src/components/ui/sheet.tsx` 존재 확인됨)
- `ScrollArea`도 동일 (`src/components/ui/scroll-area.tsx` 존재 확인됨)
- `handleNavigate` 후 navigate('/chat')는 필요 없음: `switchConversation`이 currentConversationId를 변경하면 ChatPage가 자동으로 해당 대화를 표시함
