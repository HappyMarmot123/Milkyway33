# 리렌더링 성능 개선 작업 목록

전체 컴포넌트 트리의 결합도와 메모이제이션을 점검한 결과입니다.
각 항목은 **파일 경로 + 줄 번호**, 원인, 수정 방향 순으로 기술합니다.

---

## Priority 1 — 즉각적인 리렌더링 cascade 차단

### 1. `ChatComposer`: `handleSubmit` deps에 `input` 포함

**파일**: `src/components/chat/ChatComposer.tsx:146`

```ts
// 현재 — 키 입력마다 handleSubmit 새 참조 생성
const handleSubmit = useCallback((message) => {
  const text = message.text || input; // input을 클로저로 읽음
}, [input, sendMessage, status]);     // input이 있어서 매 타이핑마다 재생성
```

`handleSubmit`이 `CooldownTextarea`에 `onSubmit`으로 전달되므로,
키 입력마다 memo가 무효화되어 강제 리렌더링됨.

**수정**:
```ts
const inputRef = useRef(input);
useEffect(() => { inputRef.current = input; }, [input]);

const handleSubmit = useCallback((message: { text?: string }) => {
  const text = message.text ?? inputRef.current;
  const cooldown = getChatCooldownSnapshot();
  if (!text.trim() || status !== "idle" || cooldown.isActive) return;
  sendMessage(text);
  setInput("");
}, [sendMessage, status]); // input 제거
```

---

### 2. `ChatComposer`: `useChatCooldown()` 3중 구독

**파일**: `src/components/chat/ChatComposer.tsx:47, 78, 125`

`CooldownTextarea`, `CooldownSubmitArea`, `CooldownDisclaimer` 세 컴포넌트가
각자 `useChatCooldown()`을 구독함. 쿨타임 틱(매 1초)마다 3개가 개별 리렌더 사이클로 실행됨.

**수정**: `useChatCooldown()`을 `ChatComposer`로 끌어올리고 `cooldown` 객체를 prop으로 내려보냄.
React 18 자동 배치(auto-batching)에 의해 1회 렌더 사이클로 통합됨.

```ts
// ChatComposer 내부
const cooldown = useChatCooldown();

// 각 서브컴포넌트 인터페이스에 cooldown prop 추가
interface CooldownTextareaProps {
  cooldown: ChatCooldownSnapshot;
  // ...
}
```

세 서브컴포넌트에서 `useChatCooldown()` 호출 제거 후 prop으로 대체.

---

### 3. `AppSidebar`: 불필요한 `ChatMessagesContext` 구독

**파일**: `src/components/layout/AppSidebar.tsx:36`

```ts
const { conversations, currentConversationId } = useChatMessages();
```

`ChatMessagesContext`는 `messages`, `conversations`, `currentConversationId`를 하나의 객체로 묶음.
`AppSidebar`는 `conversations`와 `currentConversationId`만 필요하지만,
`messages`가 변경될 때도 컨텍스트 value가 갱신되어 `AppSidebar`가 리렌더됨.

**수정**: `ChatProvider`에 `ChatConversationsContext`를 분리하여 추가.

```ts
// ChatContext.tsx에 추가
export type ChatConversationsContextType = Pick<
  ChatContextType,
  'conversations' | 'currentConversationId'
>;
export const ChatConversationsContext = createContext<ChatConversationsContextType | null>(null);
export function useChatConversations() { ... }

// ChatProvider.tsx에 추가
const conversations = useMemo<ChatConversationsContextType>(() => ({
  conversations: chat.conversations,
  currentConversationId: chat.currentConversationId,
}), [chat.conversations, chat.currentConversationId]);
```

`AppSidebar`에서 `useChatMessages()` → `useChatConversations()`로 교체.

---

### 4. `ChatBot`: `useChatRuntime()` 구독으로 스트리밍 중 매 청크마다 리렌더

**파일**: `src/components/ChatBot.tsx:29`

```ts
const { status, currentMetadata, error } = useChatRuntime();
```

`ChatRuntimeContext`는 `currentResponse`를 포함하므로 스트리밍 중 매 청크마다 value가 갱신됨.
`ChatBot`은 `currentResponse`를 직접 사용하지 않지만 컨텍스트 갱신에 의해 리렌더됨.

**수정**: `ChatRuntimeContext`를 두 개로 분리.

```ts
// 스트리밍 데이터 (고빈도)
export type ChatStreamingContextType = Pick<ChatContextType, 'currentResponse'>;
export const ChatStreamingContext = createContext<...>(null);

// 나머지 런타임 상태 (저빈도)
export type ChatRuntimeContextType = Pick<ChatContextType, 'status' | 'currentMetadata' | 'error' | 'isLoading'>;
```

`StreamingPreview`만 `ChatStreamingContext`를 구독하도록 이동.
`ChatBot`은 고빈도 스트리밍 컨텍스트에서 분리됨.

---

## Priority 2 — 불필요한 참조 재생성 제거

### 5. `ChatComposer`: `messages.length`를 위해 `ChatMessagesContext` 전체 구독

**파일**: `src/components/chat/ChatComposer.tsx:141`

```ts
const { messages } = useChatMessages(); // Clear 버튼 disabled 판별용
```

`PromptInputButton`의 `disabled={messages.length === 0}` 하나를 위해
`ChatComposer` 전체가 메시지 변경 시마다 리렌더됨.

**수정**: Clear 버튼을 `HasMessagesButton`이라는 별도 컴포넌트로 분리하여
그 컴포넌트만 `useChatMessages()`를 구독하도록 처리.

또는 `3번 항목`에서 분리한 `ChatConversationsContext`와 마찬가지로,
`hasMessages: boolean`만 노출하는 최소 컨텍스트를 추가.

---

### 6. `ChatPage`: `handleMetadataUpdate` useCallback 미적용

**파일**: `src/pages/ChatPage.tsx:144`

```ts
// 현재 — ChatPage 리렌더 시마다 새 참조 생성
const handleMetadataUpdate = (metadata: ChatMetadata) => {
  setLastMetadata(metadata);
};
```

`ChatBot`에 `onMetadataUpdate={handleMetadataUpdate}`로 전달됨.
`ChatBot`을 `memo`로 감쌀 경우 이 참조 변경이 memo를 무효화함.

**수정**:
```ts
const handleMetadataUpdate = useCallback((metadata: ChatMetadata) => {
  setLastMetadata(metadata);
}, []);

// onToggle도 동일하게 처리
const handleToggleInfo = useCallback(() => {
  setIsInfoExpanded(v => !v);
}, []);
```

`MetadataPanel` 컴포넌트도 `memo`로 감싸기.

---

### 7. `AppSidebar`: 이벤트 핸들러 전체 useCallback 미적용

**파일**: `src/components/layout/AppSidebar.tsx:50–80`

`handleNewChat`, `handleConversationClick`, `handleRenameStart`,
`handleRenameSubmit`, `handleRenameCancel`, `handleDelete` 모두 일반 함수.
`AppSidebar` 리렌더 시마다 새 참조가 생성되어 자식에게 전달됨.

**수정**: 모두 `useCallback`으로 감싸기.

```ts
const handleNewChat = useCallback(async () => {
  await createNewConversation();
}, [createNewConversation]);

const handleConversationClick = useCallback((id: string) => {
  if (editingId !== id) switchConversation(id);
}, [editingId, switchConversation]);

const handleRenameStart = useCallback((conv: { id: string; title: string }) => {
  setEditingId(conv.id);
  setEditingTitle(conv.title);
}, []);

const handleRenameSubmit = useCallback(async () => {
  if (editingId && editingTitle.trim()) {
    await renameConversation(editingId, editingTitle.trim());
  }
  setEditingId(null);
  setEditingTitle("");
}, [editingId, editingTitle, renameConversation]);

const handleRenameCancel = useCallback(() => {
  setEditingId(null);
  setEditingTitle("");
}, []);

const handleDelete = useCallback(async (id: string) => {
  await deleteConversation(id);
}, [deleteConversation]);
```

---

### 8. `ChatMessageItem`: `handleRegenerate` useCallback 미적용

**파일**: `src/components/chat/ChatMessageItem.tsx:22`

```ts
// 현재 — memo 내부지만 ResponseActionContainer에 새 참조 전달
const handleRegenerate = () => {
  if (isLast) onRegenerate();
};
```

**수정**:
```ts
const handleRegenerate = useCallback(() => {
  if (isLast) onRegenerate();
}, [isLast, onRegenerate]);
```

---

### 9. `Header > StatusIndicator`: statusConfig 매 렌더마다 재생성

**파일**: `src/components/layout/Header.tsx:13`

`StatusIndicator` 내부의 `statusConfig` 객체가 렌더마다 새로 생성됨.
`StatusIndicator` 자체도 `memo` 없이 `Header` 리렌더 시 항상 재실행됨.

**수정**:
```ts
// 모듈 최상단으로 이동
const STATUS_CONFIG: Record<string, { label: string; gradient: string; pulse: boolean }> = {
  thinking: { label: "생각하는 중...", gradient: "from-purple-500 via-pink-500 to-indigo-500", pulse: true },
  generating: { label: "생성 중...", gradient: "from-blue-500 via-cyan-400 to-teal-500", pulse: true },
  streaming: { label: "응답 중...", gradient: "from-green-400 via-emerald-500 to-teal-500", pulse: true },
  idle: { label: "준비됨", gradient: "from-gray-400 to-gray-500", pulse: false },
};

const StatusIndicator = memo(({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
  // ...
});
```

---

## Priority 3 — 중간 컴포넌트 트리 memo 적용

### 10. `PromptInput` 계열 컴포넌트 memo 미적용

**파일**: `src/components/ai-elements/prompt-input.tsx:367, 695, 810, 820, 827`

`PromptInputImpl`, `PromptInputBody`, `PromptInputFooter`, `PromptInputTools`,
`PromptInputButton` 모두 `memo` 없는 일반 함수.
`ChatComposer` 리렌더 시 이 트리 전체가 매번 재실행됨.

**수정**: 각 컴포넌트를 `memo`로 감싸기.

```ts
export const PromptInputBody = memo(({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("contents", className)} {...props} />
));

export const PromptInputFooter = memo(({ className, ...props }: ComponentProps<"div">) => (
  <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />
));

export const PromptInputTools = memo(({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
));

export const PromptInputButton = memo(({ variant = "ghost", className, size, ...props }) => { ... });
```

`PromptInputImpl`은 `onSubmit` prop이 안정적일 때만 효과가 있으므로,
1번 항목(`handleSubmit` deps 수정) 완료 후 적용.

---

### 11. `ChatBot`: `memo` 미적용

**파일**: `src/components/ChatBot.tsx:25`

`ChatBot`은 `ChatPage`의 직계 자식이며 크기가 큰 컴포넌트.
`ChatPage`가 `isInfoExpanded` 상태로 리렌더될 때 `ChatBot`도 함께 재실행됨.

**수정**:
```ts
const ChatBot = memo(({ onMetadataUpdate }: ChatBotProps) => {
  // ...
});
```

단, 6번 항목(`handleMetadataUpdate` useCallback 적용) 완료 후 적용해야 효과 있음.

---

## 작업 순서 권장

| 순서 | 항목 | 예상 효과 |
|------|------|-----------|
| 1 | `handleSubmit` deps에서 `input` 제거 (항목 1) | 타이핑 시 `CooldownTextarea` 불필요 리렌더 제거 |
| 2 | `useChatCooldown()` 단일 구독으로 통합 (항목 2) | 쿨타임 틱 3→1회 렌더 사이클 |
| 3 | `ChatConversationsContext` 분리 (항목 3) | 스트리밍 중 `AppSidebar` 리렌더 제거 |
| 4 | `ChatRuntimeContext` / `ChatStreamingContext` 분리 (항목 4) | 스트리밍 중 `ChatBot` 리렌더 제거 |
| 5 | `handleMetadataUpdate` useCallback (항목 6) + `ChatBot` memo (항목 11) | `ChatPage` 상태 변경 시 `ChatBot` 보호 |
| 6 | `StatusIndicator` memo + `STATUS_CONFIG` 상수화 (항목 9) | 사이드 이펙트 없는 간단한 개선 |
| 7 | `AppSidebar` 핸들러 useCallback (항목 7) | 사이드바 리렌더 시 자식 보호 |
| 8 | `PromptInput` 계열 memo (항목 10) | 1번 완료 이후 적용 |
| 9 | `ChatComposer` messages 구독 분리 (항목 5) | 항목 3 완료 이후 결정 |
| 10 | `ChatMessageItem` handleRegenerate useCallback (항목 8) | `ResponseActionContainer` 구현 확인 후 적용 |
