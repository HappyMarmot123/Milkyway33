# 프롬프트 템플릿 시스템 설계

---

## 개요

사용자가 system prompt + few-shot 예시를 묶어 이름을 붙여 저장하고,
어떤 채팅방에서든 즉시 불러와 적용할 수 있는 템플릿 라이브러리 시스템.

**현재 구조와의 차이:**

|             | 현재                                | 변경 후                             |
| ----------- | ----------------------------------- | ----------------------------------- |
| 저장 단위   | 전역 단일 config (`default_config`) | 이름 붙인 템플릿 여러 개            |
| Few-shot 수 | 1개 고정                            | 복수 (추가/삭제)                    |
| 적용 방식   | 직접 텍스트 입력만                  | 저장된 템플릿 선택 + 직접 편집 모두 |
| 관리 위치   | PromptConfigModal 내부              | 설정 페이지 전용 섹션               |

---

## 1. 데이터 모델

### 신규 타입 추가

**`src/features/chat/types.ts`**

```ts
// 기존 ChatPromptConfig, ChatMessageExample 유지

export interface PromptTemplate {
  id: string;
  name: string; // "프론트개발 프롬프트"
  description: string; // "React/TypeScript 특화 어시스턴트"
  systemInstruction: string;
  examples: ChatMessageExample[]; // 복수 지원 (0개 이상)
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. DB 스키마 변경

**`src/lib/db.ts`** — Dexie version 4 마이그레이션

```ts
import { PromptTemplate } from "@/features/chat/types";

export type MilkywayDB = Dexie & {
  conversations: EntityTable<Conversation, "id">;
  messages: EntityTable<ChatMessage, "id">;
  configs: EntityTable<PromptConfigEntity, "id">;
  tokenUsage: EntityTable<TokenUsageEntity, "id">;
  promptTemplates: EntityTable<PromptTemplate, "id">; // 신규
};

db.version(4).stores({
  conversations: "id, updatedAt",
  messages: "id, conversationId, timestamp",
  configs: "id, updatedAt",
  tokenUsage: "id, updatedAt",
  promptTemplates: "id, name, updatedAt", // 신규
});
```

---

## 3. Repository 설계

**`src/services/promptTemplateRepository.ts`** (신규)

```ts
export const promptTemplateRepository = {

  // 전체 목록 조회 (최신순)
  async getAll(): Promise<PromptTemplate[]>,

  // 단건 조회
  async getById(id: string): Promise<PromptTemplate | undefined>,

  // 생성
  async create(input: {
    name: string;
    description: string;
    systemInstruction: string;
    examples: ChatMessageExample[];
  }): Promise<PromptTemplate>,

  // 수정
  async update(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>): Promise<void>,

  // 삭제
  async delete(id: string): Promise<void>,
};
```

---

## 4. Hook 설계

**`src/hooks/usePromptTemplates.ts`** (신규)

```ts
export function usePromptTemplates() {
  return {
    templates, // PromptTemplate[]
    isLoading,

    createTemplate, // (input) => Promise<void>
    updateTemplate, // (id, updates) => Promise<void>
    deleteTemplate, // (id) => Promise<void>

    // 채팅 적용: 선택한 템플릿을 현재 채팅의 promptConfig에 반영
    applyTemplate, // (templateId) => void
  };
}
```

`applyTemplate` 내부 동작:

```ts
const applyTemplate = useCallback(
  (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setPromptConfig({
      systemInstruction: template.systemInstruction,
      examples: template.examples,
    });
  },
  [templates, setPromptConfig],
);
```

---

## 5. UI 컴포넌트 설계

### 5-1. 설정 페이지 — 템플릿 관리 섹션

**`src/pages/SettingsPage.tsx`** 에 새 섹션 추가

각 템플릿 카드에 **[미리보기]** 버튼 추가. 클릭 시 해당 템플릿의 system prompt + few-shot을 읽기 전용으로 확인 가능.

```
┌──────────────────────────────────────────────────┐
│  프롬프트 템플릿                        [+ 새 템플릿] │
├──────────────────────────────────────────────────┤
│  ● 프론트개발 프롬프트                              │
│    React/TypeScript 특화 어시스턴트                 │
│                         [미리보기] [편집] [삭제]    │
│                                                  │
│  ● 데이터리서치 프롬프트                            │
│    데이터 분석 및 인사이트 도출                      │
│                         [미리보기] [편집] [삭제]    │
│                                                  │
│  ● 코드리뷰 프롬프트                               │
│    PR 리뷰 및 개선 제안                            │
│                         [미리보기] [편집] [삭제]    │
└──────────────────────────────────────────────────┘
```

[미리보기] 클릭 → `PromptPreviewModal` 오픈 (읽기 전용, 수정 버튼 포함)

**`src/components/features/PromptTemplateSection.tsx`** (신규)

---

### 5-2. 템플릿 편집 폼

**`src/components/features/PromptTemplateFormModal.tsx`** (신규)

생성/수정 공용 모달. 상단에 **[편집] / [미리보기]** 탭 전환 UI 포함.
**생성(mode: "create") 시에만** 편집 탭 내 프리셋 선택 영역이 표시됨.

```
┌────────────────────────────────────────────────┐
│  새 프롬프트 템플릿                            [X] │
├────────────────────────────────────────────────┤
│  [편집 ●]  [미리보기]                           │  ← 탭 (● = 활성)
├────────────────────────────────────────────────┤
│                                                │
│  ── 프리셋으로 시작하기 ──────────────────────   │  ← create 모드에만 표시
│                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 💻 개발   │ │ 📊 리서치 │ │ ✍️ 창작   │ ...   │  ← 카테고리 탭
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                │
│  ┌───────────────────┐  ┌───────────────────┐  │
│  │ LLM 개발 전문가    │  │ 프론트엔드 개발자  │  │  ← 프리셋 카드
│  │ 입문자 대상, 300자 │  │ React/TS 특화     │  │
│  │ 이내 요약          │  │                   │  │
│  └───────────────────┘  └───────────────────┘  │
│  ┌───────────────────┐  ┌───────────────────┐  │
│  │ 코드 리뷰어        │  │ 빈 양식으로 시작   │  │
│  │ PR 리뷰 및 개선    │  │                   │  │
│  └───────────────────┘  └───────────────────┘  │
│  프리셋을 선택하면 아래 양식이 자동으로 채워집니다. │
│                                                │
│  ────────────────────────────────────────────  │
│                                                │
│  이름 *                               [?]      │  ← 툴팁
│  ┌──────────────────────────────────────────┐  │
│  │ 프론트개발 프롬프트                         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  설명                                 [?]      │  ← 툴팁
│  ┌──────────────────────────────────────────┐  │
│  │ React/TypeScript 특화 어시스턴트            │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  System Instruction *    [0/1000]     [?]      │  ← 툴팁
│  ┌──────────────────────────────────────────┐  │
│  │ 너는 React/TypeScript 전문 프론트엔드     │  │
│  │ 개발자야. 사용자 수준은 입문자야...         │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Few-shot 예시          [+ 추가]      [?]      │  ← 툴팁
│  ┌──────────────────────────────────────────┐  │
│  │ 예시 1                              [삭제] │  │
│  │  User: useState와 useReducer 차이?        │  │
│  │  Assistant: useState는 단순한 값...       │  │
│  └──────────────────────────────────────────┘  │
│                                                │
├────────────────────────────────────────────────┤
│                          [취소]  [저장]          │
└────────────────────────────────────────────────┘
```

**미리보기 탭 전환 시:**

```
┌────────────────────────────────────────────────┐
│  새 프롬프트 템플릿                            [X] │
├────────────────────────────────────────────────┤
│  [편집]  [미리보기 ●]                           │  ← 미리보기 탭 활성
├────────────────────────────────────────────────┤
│                                                │
│  📋 System Instruction             [✏️ 수정]   │  ← 수정 버튼 클릭 → 편집 탭으로 전환
│  ┌──────────────────────────────────────────┐  │
│  │ 너는 React/TypeScript 전문 프론트엔드     │  │
│  │ 개발자야. 사용자 수준은 입문자야.          │  │
│  │ 코드 예시는 항상 TypeScript로...          │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  💬 Few-shot 예시 (1개)            [✏️ 수정]   │  ← 수정 버튼 클릭 → 편집 탭으로 전환
│                                                │
│  ┌─ 예시 1 ──────────────────────────────────┐ │
│  │                                           │ │
│  │  👤 User                                  │ │
│  │  ╔═══════════════════════════════════╗    │ │
│  │  ║ useState와 useReducer 언제 써?     ║    │ │
│  │  ╚═══════════════════════════════════╝    │ │
│  │                                           │ │
│  │  🤖 Assistant                             │ │
│  │  ┌───────────────────────────────────┐    │ │
│  │  │ 상태가 단순한 값 하나면 useState,  │    │ │
│  │  │ 여러 값이 연관되면 useReducer를 써. │   │ │
│  │  └───────────────────────────────────┘    │ │
│  └───────────────────────────────────────────┘ │
│                                                │
│  ─────────────────────────────────────────     │
│  ℹ️  AI에게 실제로 전달되는 구조입니다.          │
│                                                │
├────────────────────────────────────────────────┤
│                          [취소]  [저장]          │
└────────────────────────────────────────────────┘
```

---

### 5-3. PromptPreviewModal — 독립 미리보기

**`src/components/features/PromptPreviewModal.tsx`** (신규)

설정 페이지 목록의 [미리보기] 버튼에서 열리는 읽기 전용 모달.
편집 없이 내용만 확인하고, 바로 채팅에 적용하거나 편집 화면으로 이동 가능.

```
┌────────────────────────────────────────────────┐
│  프론트개발 프롬프트                           [X] │
│  React/TypeScript 특화 어시스턴트                │
├────────────────────────────────────────────────┤
│                                                │
│  📋 System Instruction                         │
│  ┌──────────────────────────────────────────┐  │
│  │ 너는 React와 TypeScript 전문 프론트엔드    │  │
│  │ 개발자야. 코드 예시는 항상 TypeScript로   │  │
│  │ 작성하고, 최신 React 패턴을 사용해.        │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  💬 Few-shot 예시 (1개)                        │
│                                                │
│  ┌─ 예시 1 ──────────────────────────────────┐ │
│  │  👤  useState와 useReducer 언제 써?        │ │
│  │  🤖  상태가 단순한 값 하나면 useState...   │ │
│  └───────────────────────────────────────────┘ │
│                                                │
├────────────────────────────────────────────────┤
│  [편집하기]              [현재 채팅에 바로 적용] │
└────────────────────────────────────────────────┘
```

- **[편집하기]**: `PromptTemplateFormModal`을 edit 모드로 오픈
- **[현재 채팅에 바로 적용]**: `applyTemplate()` 호출 후 모달 닫힘 (채팅 화면에서 열었을 때만 표시)

---

### 5-4. PromptConfigModal — 미리보기 탭 + 템플릿 불러오기 추가

**`src/components/features/PromptConfigModal.tsx`** 수정

기존 폼에 **[편집] / [미리보기]** 탭 + 템플릿 불러오기 드롭다운 추가.

```
┌────────────────────────────────────────────────┐
│  Prompt Settings                           [X] │
├────────────────────────────────────────────────┤
│  [편집 ●]  [미리보기]                           │  ← 탭
├────────────────────────────────────────────────┤
│                                                │
│  템플릿에서 불러오기                              │
│  ┌──────────────────────────────────────────┐  │
│  │ 템플릿 선택...                        [▼] │  │  ← 드롭다운
│  └──────────────────────────────────────────┘  │
│  ※ 선택 시 아래 내용을 덮어씁니다               │
│                                                │
│  ─────────────────────────────────────────     │
│                                                │
│  System Instruction                [0/1000]   │
│  ┌──────────────────────────────────────────┐  │
│  │ (직접 입력 또는 템플릿 선택으로 자동 채움)    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  Few-shot 예시                      [+ 추가]   │
│  ...                                           │
│                                                │
├────────────────────────────────────────────────┤
│                          [취소]  [Save Changes] │
└────────────────────────────────────────────────┘
```

미리보기 탭 전환 시 `PromptTemplateFormModal`과 동일한 `PromptPreviewPanel` 컴포넌트를 재사용.

---

## 6. 비즈니스 로직 흐름

### 흐름 A: 템플릿 생성

```
설정 페이지 진입
→ "프롬프트 템플릿" 섹션 렌더링
  → usePromptTemplates() 로 전체 목록 조회 (Dexie)
→ [+ 새 템플릿] 클릭
  → PromptTemplateFormModal 오픈 (mode: "create")
→ 이름 / 설명 / systemInstruction 입력
→ [+ 추가] 클릭 시 examples 배열에 빈 항목 추가
→ [저장] 클릭
  → 유효성 검사 (이름 필수, systemInstruction 필수, 주입 패턴 검사)
  → promptTemplateRepository.create() → Dexie promptTemplates 테이블에 저장
  → 모달 닫힘, 목록 갱신
```

### 흐름 B: 채팅에 템플릿 적용

```
채팅 화면에서 설정 아이콘(⚙) 클릭
→ PromptConfigModal 오픈
→ "템플릿 선택" 드롭다운에 저장된 템플릿 목록 표시
→ 사용자가 "프론트개발 프롬프트" 선택
  → systemInstruction 필드 = template.systemInstruction 으로 채워짐
  → examples 필드 = template.examples 으로 채워짐
→ 필요 시 내용 직접 수정 가능 (템플릿 원본은 변경 안 됨)
→ [Save Changes] 클릭
  → chatRepository.saveSettings() — 현재 채팅의 promptConfig 업데이트
  → 이후 sendMessage 시 해당 system + examples 가 Gemini API로 전송
```

### 흐름 C: 템플릿 수정

```
설정 페이지 → 해당 템플릿 [편집] 클릭
→ PromptTemplateFormModal 오픈 (mode: "edit", 기존 값 채워짐)
→ 수정 후 [저장]
  → promptTemplateRepository.update()
  → 목록 갱신
  ※ 이미 채팅에 적용된 내용은 그대로 유지 (적용은 스냅샷 방식)
```

### 흐름 D: 템플릿 삭제

```
설정 페이지 → [삭제] 클릭
→ 확인 다이얼로그 ("이 템플릿을 삭제하시겠습니까?")
→ 확인 시
  → promptTemplateRepository.delete()
  → 목록에서 제거
  ※ 이미 채팅에 적용된 promptConfig는 영향 없음
```

### 흐름 E: 미리보기에서 수정으로 전환

```
[경로 1 — 설정 페이지]
설정 페이지 템플릿 목록 → [미리보기] 클릭
→ PromptPreviewModal 오픈 (읽기 전용)
→ system instruction / few-shot 내용 확인
→ [편집하기] 클릭
  → PromptPreviewModal 닫힘
  → PromptTemplateFormModal 오픈 (mode: "edit", 해당 템플릿 데이터 채워짐)
→ 수정 후 [저장]

[경로 2 — 폼 내 탭 전환]
PromptTemplateFormModal 편집 탭에서 내용 입력 중
→ [미리보기] 탭 클릭
  → 현재 입력 중인 내용이 실시간으로 미리보기로 표시
  → system instruction 섹션 우측 [✏️ 수정] 클릭
    → [편집] 탭으로 전환 + systemInstruction 입력 필드로 스크롤/포커스
  → few-shot 섹션 우측 [✏️ 수정] 클릭
    → [편집] 탭으로 전환 + examples 영역으로 스크롤/포커스

[경로 3 — PromptConfigModal]
채팅 설정 모달 → [미리보기] 탭 클릭
→ 현재 입력/선택된 내용을 미리보기로 확인
→ 미리보기 내 [✏️ 수정] 클릭 → [편집] 탭으로 전환
```

### 흐름 F: 미리보기에서 채팅 바로 적용

```
설정 페이지 → [미리보기] → PromptPreviewModal 오픈
→ [현재 채팅에 바로 적용] 클릭
  → applyTemplate(templateId) 호출
    → setPromptConfig({ systemInstruction, examples }) — 현재 채팅 설정 업데이트
  → 모달 닫힘
  → 채팅 화면으로 이동 (location.pathname !== '/chat' 이면 navigate('/chat'))
```

---

## 7. 미리보기 패널 컴포넌트 설계

### PromptPreviewPanel

편집 폼과 PromptPreviewModal에서 공통으로 재사용하는 미리보기 렌더링 컴포넌트.

**`src/components/features/PromptPreviewPanel.tsx`** (신규)

```tsx
interface PromptPreviewPanelProps {
  systemInstruction: string;
  examples: ChatMessageExample[];
  // 수정 버튼 클릭 시 호출 — 없으면 수정 버튼 미표시 (읽기 전용 모드)
  onEditSystem?: () => void;
  onEditExamples?: () => void;
}
```

**렌더링 규칙:**

| 상태                       | 표시                                                |
| -------------------------- | --------------------------------------------------- |
| systemInstruction 비어있음 | "System Instruction이 설정되지 않았습니다." (muted) |
| examples 비어있음          | "Few-shot 예시가 없습니다." (muted)                 |
| 내용 있음                  | 아래 포맷으로 렌더링                                |

**System Instruction 렌더링:**

```
📋 System Instruction                    [✏️ 수정]  ← onEditSystem 있을 때만
┌──────────────────────────────────────────────┐
│  (system instruction 텍스트, 줄바꿈 유지)      │
│  배경색: muted/20, 폰트: mono, 테두리: dashed  │
└──────────────────────────────────────────────┘
```

**Few-shot 예시 렌더링 (채팅 말풍선 형태):**

```
💬 Few-shot 예시 (N개)                   [✏️ 수정]  ← onEditExamples 있을 때만

┌─ 예시 1 ────────────────────────────────────┐
│                                             │
│  👤 User                                    │
│  ╔═══════════════════════════════════════╗  │  ← 사용자 말풍선 (우측 정렬)
│  ║  useState와 useReducer 언제 써?        ║  │
│  ╚═══════════════════════════════════════╝  │
│                                             │
│  🤖 Assistant                               │
│  ┌───────────────────────────────────────┐  │  ← AI 말풍선 (좌측 정렬)
│  │  상태가 단순한 값 하나면 useState,     │  │
│  │  여러 값이 연관되면 useReducer를 써.   │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**실시간 동기화:**
`systemInstruction`과 `examples` props가 변경될 때마다 즉시 반영.
별도 상태나 `useEffect` 불필요 — props 직접 렌더링.

---

## 8. 도움말 툴팁

각 입력 필드 우측에 `?` 아이콘을 배치하고, 호버/클릭 시 설명을 표시.
기존 프로젝트의 `src/components/ui/tooltip.tsx` (shadcn) 컴포넌트를 재사용.

### 필드별 툴팁 문구

| 필드                   | 툴팁 내용                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **이름**               | 템플릿을 구분하는 이름입니다. 채팅 화면에서 불러올 때 이 이름으로 표시됩니다.                                                           |
| **설명**               | 템플릿의 용도를 간단히 적어두세요. 목록에서 미리보기로 표시됩니다.                                                                      |
| **System Instruction** | AI가 대화 전반에 걸쳐 따를 역할과 규칙을 정의합니다. 사용자에게는 보이지 않으며, 매 메시지마다 자동으로 적용됩니다.                     |
| **Few-shot 예시**      | AI가 어떻게 답변해야 하는지 예시를 보여줍니다. 입력/출력 쌍으로 구성하며, 더 일관된 응답을 유도합니다. 최대 5개까지 추가할 수 있습니다. |
| **예시 — User 입력**   | 사용자가 실제로 입력할 법한 질문이나 요청을 작성합니다.                                                                                 |
| **예시 — AI 응답**     | 위 입력에 대해 AI가 이상적으로 답변해야 할 내용을 작성합니다.                                                                           |

### 툴팁 컴포넌트 구조

```tsx
// 재사용 헬퍼 컴포넌트
const FieldLabel = ({
  label,
  tooltip,
  required,
  counter,
}: {
  label: string;
  tooltip: string;
  required?: boolean;
  counter?: string;
}) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle
            size={13}
            className="text-muted-foreground/50 cursor-help"
          />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-56 text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </div>
    {counter && (
      <span className="text-xs text-muted-foreground">{counter}</span>
    )}
  </div>
);
```

---

## 8. 프롬프트 프리셋

### 개념

앱이 기본 제공하는 읽기 전용 프리셋. DB에 저장하지 않고 소스 코드 상수로 관리.
사용자가 선택하면 폼에 자동으로 채워지며, 저장 시 사용자 소유의 템플릿으로 복사됨.

### 데이터 구조

**`src/features/promptTemplates/presets.ts`** (신규)

```ts
export interface PromptPreset {
  id: string;
  category: "개발" | "리서치" | "창작" | "업무";
  categoryIcon: string;
  name: string;
  description: string;
  systemInstruction: string;
  examples: ChatMessageExample[];
}

export const PROMPT_PRESETS: PromptPreset[] = [
  // ── 개발 ──────────────────────────────────────
  {
    id: "preset_llm_dev",
    category: "개발",
    categoryIcon: "💻",
    name: "LLM 개발 전문가",
    description: "입문자 대상, 간결한 답변",
    systemInstruction:
      "너는 LLM 개발 전문가야. 사용자의 수준은 입문자야. " +
      "응답 내용은 300글자 이내로 요약해줘. " +
      "어려운 용어는 반드시 쉽게 풀어서 설명해.",
    examples: [
      {
        input: "프롬프트 엔지니어링이 뭐야?",
        output:
          "AI에게 원하는 답변을 얻기 위해 질문을 잘 다듬는 기술이에요. " +
          "예를 들어 '번역해줘'보다 '한국어를 영어로 격식체로 번역해줘'가 더 정확한 결과를 줍니다.",
      },
    ],
  },

  {
    id: "preset_frontend_dev",
    category: "개발",
    categoryIcon: "💻",
    name: "프론트엔드 개발자",
    description: "React/TypeScript 특화 어시스턴트",
    systemInstruction:
      "너는 React와 TypeScript 전문 프론트엔드 개발자야. " +
      "코드 예시는 항상 TypeScript로 작성하고, " +
      "최신 React 패턴(hooks, functional component)을 사용해. " +
      "성능과 접근성을 항상 고려해서 답변해.",
    examples: [
      {
        input: "useState와 useReducer 언제 써?",
        output:
          "상태가 단순한 값 하나면 useState, " +
          "여러 값이 서로 연관되거나 업데이트 로직이 복잡하면 useReducer를 써. " +
          "예: 폼 필드 5개가 함께 움직이면 useReducer가 깔끔해.",
      },
    ],
  },

  {
    id: "preset_code_review",
    category: "개발",
    categoryIcon: "💻",
    name: "코드 리뷰어",
    description: "PR 리뷰 및 개선 제안",
    systemInstruction:
      "너는 시니어 소프트웨어 엔지니어야. " +
      "코드를 리뷰할 때 가독성, 성능, 보안, 테스트 가능성 네 가지 관점에서 분석해. " +
      "문제점은 구체적인 이유와 개선 코드를 함께 제시해. " +
      "칭찬할 부분도 함께 언급해.",
    examples: [],
  },

  // ── 리서치 ────────────────────────────────────
  {
    id: "preset_data_researcher",
    category: "리서치",
    categoryIcon: "📊",
    name: "데이터 리서치 전문가",
    description: "데이터 분석 및 인사이트 도출",
    systemInstruction:
      "너는 데이터 사이언티스트야. " +
      "숫자와 통계를 다룰 때 항상 출처와 한계를 명시해. " +
      "인사이트를 도출할 때 상관관계와 인과관계를 구분해서 설명해. " +
      "차트나 시각화가 필요한 경우 어떤 차트 유형이 적합한지 제안해.",
    examples: [
      {
        input: "A/B 테스트 결과를 어떻게 해석해?",
        output:
          "먼저 통계적 유의성(p-value < 0.05)을 확인하고, " +
          "실용적 유의성(effect size)도 함께 봐야 해. " +
          "샘플 크기가 충분한지, 테스트 기간이 최소 1-2주인지도 체크해.",
      },
    ],
  },

  {
    id: "preset_paper_summary",
    category: "리서치",
    categoryIcon: "📊",
    name: "논문 요약가",
    description: "학술 논문 핵심 요약",
    systemInstruction:
      "너는 학술 논문 요약 전문가야. " +
      "논문의 연구 목적, 방법론, 핵심 결과, 한계점을 각각 bullet point로 정리해. " +
      "전문 용어는 괄호 안에 쉬운 설명을 추가해. " +
      "응답은 500자 이내로 요약해.",
    examples: [],
  },

  // ── 창작 ──────────────────────────────────────
  {
    id: "preset_copywriter",
    category: "창작",
    categoryIcon: "✍️",
    name: "마케팅 카피라이터",
    description: "설득력 있는 카피 작성",
    systemInstruction:
      "너는 10년 경력의 마케팅 카피라이터야. " +
      "감성적 호소와 논리적 근거를 균형 있게 사용해. " +
      "타겟 오디언스를 항상 고려하고, CTA(행동 유도 문구)를 명확하게 포함해. " +
      "요청 시 여러 버전의 카피를 제시해.",
    examples: [],
  },

  {
    id: "preset_translator",
    category: "창작",
    categoryIcon: "✍️",
    name: "한영 번역가",
    description: "뉘앙스를 살린 자연스러운 번역",
    systemInstruction:
      "너는 한국어-영어 전문 번역가야. " +
      "직역보다 자연스러운 의역을 우선하되 원문의 뉘앙스와 격식을 유지해. " +
      "번역 결과만 출력하고, 애매한 표현이 있으면 번역 후 주석으로 설명해.",
    examples: [
      {
        input: "'눈치가 빠르다'를 영어로 번역해줘.",
        output:
          '"She reads the room well." ' +
          "(주석: '눈치'는 직접 대응하는 영어 단어가 없어 상황 파악 능력을 표현하는 관용구로 번역했습니다.)",
      },
    ],
  },

  // ── 업무 ──────────────────────────────────────
  {
    id: "preset_assistant",
    category: "업무",
    categoryIcon: "📋",
    name: "업무 비서",
    description: "일정, 이메일, 문서 정리 전문",
    systemInstruction:
      "너는 나의 업무 비서야. " +
      "요청한 내용을 간결하고 실행 가능한 형태로 정리해줘. " +
      "이메일 작성 시 격식체를 기본으로 사용하고, " +
      "문서 정리 시 중요도 순으로 bullet point로 구조화해.",
    examples: [],
  },
];
```

### 카테고리별 표시 순서

```ts
export const PRESET_CATEGORIES = ["개발", "리서치", "창작", "업무"] as const;
```

### 프리셋 선택 → 폼 반영 로직

```ts
// PromptTemplateFormModal 내부
const handlePresetSelect = (preset: PromptPreset) => {
  setName(preset.name);
  setDescription(preset.description);
  setSystemInstruction(preset.systemInstruction);
  setExamples(
    preset.examples.length > 0 ? preset.examples : [{ input: "", output: "" }],
  );
  setSelectedPresetId(preset.id); // 선택된 카드 하이라이트용
};
```

프리셋 선택 후에도 모든 필드를 자유롭게 수정할 수 있음.
저장 시 프리셋 원본과 무관한 독립적인 사용자 템플릿으로 생성됨.

---

## 9. 유효성 검사

`PromptConfigModal`의 기존 `DENY_PATTERNS` + `checkInjection()`을 재사용.
템플릿 폼에서도 동일 함수로 검사.

추가 규칙:

- 이름: 필수, 2자 이상, 30자 이하
- systemInstruction: 필수, 1000자 이하 (현재 300자 제한을 템플릿에서는 완화)
- 예시 각 항목: 300자 이하, 주입 패턴 없음
- 예시 개수: 최대 5개

---

## 12. 구현 파일 목록

| 파일                                                  | 작업                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `src/features/chat/types.ts`                          | `PromptTemplate` 타입 추가                                 |
| `src/features/promptTemplates/presets.ts`             | 신규 — 앱 제공 프리셋 상수 (8종)                           |
| `src/lib/db.ts`                                       | `promptTemplates` 테이블 추가, version 4 마이그레이션      |
| `src/services/promptTemplateRepository.ts`            | 신규 — CRUD                                                |
| `src/hooks/usePromptTemplates.ts`                     | 신규 — 목록 조회 + applyTemplate                           |
| `src/components/features/PromptPreviewPanel.tsx`      | 신규 — system + few-shot 미리보기 공통 컴포넌트            |
| `src/components/features/PromptPreviewModal.tsx`      | 신규 — 읽기 전용 독립 미리보기 모달                        |
| `src/components/features/PromptTemplateSection.tsx`   | 신규 — 설정 페이지 템플릿 목록 ([미리보기] 버튼 포함)      |
| `src/components/features/PromptTemplateFormModal.tsx` | 신규 — 편집/미리보기 탭 + 프리셋 선택 + 생성/수정 폼       |
| `src/components/features/PromptConfigModal.tsx`       | 수정 — 편집/미리보기 탭 + 템플릿 드롭다운 + 예시 복수 지원 |
| `src/pages/SettingsPage.tsx`                          | 수정 — PromptTemplateSection 섹션 추가                     |
