# Codex 설정 탭 고도화 태스크

구현 순서: Task 1 → 2 → 3 → 4

---

## Task 1 — `src/components/features/ModelSettings.tsx` 수정

### 작업 유형

기존 파일 수정

### 현재 파일 내용

```tsx
import { useState } from "react";
import type { ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface ModelSettingsValue {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stream: boolean;
}

interface ModelSettingsProps {
  model?: string;
  settings?: ModelSettingsValue;
  onChange?: (settings: ModelSettingsValue) => void;
}

export function ModelSettings({
  model,
  settings,
  onChange,
}: ModelSettingsProps) {
  const [localSettings, setLocalSettings] = useState(
    settings || {
      temperature: 0.7,
      maxTokens: 2000,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      stream: true,
    },
  );

  const handleChange = <K extends keyof ModelSettingsValue>(
    key: K,
    value: ModelSettingsValue[K],
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onChange?.(newSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>모델 파라미터</CardTitle>
          <CardDescription>
            {model || "GPT-4"} 모델의 설정을 조정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Temperature */}
          <div className="space-y-2">...</div>
          <Separator />
          {/* Max Tokens */}
          <div className="space-y-2">...</div>
          <Separator />
          {/* Top P */}
          <div className="space-y-2">...</div>
          <Separator />
          {/* Streaming Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="stream">스트리밍</Label>
              <p className="text-xs text-muted-foreground">
                응답을 실시간으로 스트리밍합니다.
              </p>
            </div>
            <Switch
              id="stream"
              checked={localSettings.stream}
              onCheckedChange={(checked: boolean) =>
                handleChange("stream", checked)
              }
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 변경 사항

1. Temperature, Max Tokens, Top P 슬라이더/인풋 및 각 `<Separator />` 완전 제거
2. `ModelSettingsValue` 인터페이스에서 `temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty` 제거 — `stream: boolean` 만 유지
3. 스트리밍 토글을 Switch → ON/OFF 버튼 쌍으로 교체 (시각적으로 명확한 구분)
4. 사용하지 않는 import (`Input`, `Slider`, `Separator`, `ChangeEvent`) 제거

### 완성 코드

```tsx
import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Zap } from "lucide-react";

export interface ModelSettingsValue {
  stream: boolean;
}

interface ModelSettingsProps {
  model?: string;
  settings?: ModelSettingsValue;
  onChange?: (settings: ModelSettingsValue) => void;
}

export function ModelSettings({ settings, onChange }: ModelSettingsProps) {
  const [localSettings, setLocalSettings] = useState<ModelSettingsValue>(
    settings ?? { stream: true },
  );

  const handleStreamChange = (value: boolean) => {
    const newSettings = { ...localSettings, stream: value };
    setLocalSettings(newSettings);
    onChange?.(newSettings);
  };

  return (
    <div className="space-y-6">
      <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-green-500/20 to-teal-500/10">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">응답 설정</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                AI 응답 방식을 설정합니다
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">스트리밍</Label>
              <p className="text-xs text-muted-foreground">
                응답을 실시간으로 스트리밍합니다
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleStreamChange(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  localSettings.stream
                    ? "bg-green-500/20 text-green-400 border border-green-500/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => handleStreamChange(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  !localSettings.stream
                    ? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                OFF
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 주의사항

- `ModelSettingsValue` 타입이 변경됨 — `SettingsPanel.tsx`의 `settings` state도 함께 수정 필요 (Task 2에서 처리)
- `Switch` 컴포넌트 import 제거

---

## Task 2 — `src/components/features/SettingsPanel.tsx` 수정

### 작업 유형

기존 파일 수정

### 현재 파일 내용

```tsx
// (전체 274줄 — 실제 파일 참고)
// 핵심 구조:
// - ModelOption 컴포넌트 (클릭 가능한 모델 선택 카드)
// - MODELS 배열 (Flash Lite, Flash, Pro 3개)
// - settings state (temperature, maxTokens, topP, stream 등)
// - isResetting state + handleResetTokenUsage 함수
// - 토큰 사용량 섹션 (초기화 버튼 포함)
// - PromptTemplateSection
// - 오류 테스트 섹션
// - AI 모델 선택 섹션 (MODELS.map)
// - ModelSettings 섹션 (advanced-settings-section)
```

### 변경 사항

1. `ModelOption` 컴포넌트 완전 제거
2. `MODELS` 배열 완전 제거
3. `settings` state에서 `temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty` 제거 — `{ stream: true }` 만 유지
4. `isResetting` state 제거
5. `handleResetTokenUsage` 함수 제거
6. 토큰 사용량 카드에서 초기화 `<Button>` 제거 (CardHeader의 flex justify-between → 단순 flex 로 변경)
7. AI 모델 섹션(`aria-label="model-settings-section"`)을 선택 불가 정보 카드로 교체
8. 불필요한 import 제거 (`RefreshCcw`, `ChevronRight`, `Cpu`)

### 완성 코드

```tsx
import { useCallback, useEffect, useState } from "react";
import { ModelSettings } from "@/components/features/ModelSettings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TokenUsage } from "@/components/features/TokenUsage";
import { PromptTemplateSection } from "@/components/features/PromptTemplateSection";
import { chatRepository } from "@/services/chatRepository";
import { AlertTriangle, Sparkles, Zap, Settings, Cpu } from "lucide-react";
import type { TokenUsageEntity } from "@/lib/db";
import { useChatActions } from "@/contexts/ChatContext";
import { Button } from "@/components/ui/button";

interface SettingsPanelProps {
  showHeader?: boolean;
}

export function SettingsPanel({ showHeader = true }: SettingsPanelProps) {
  const [settings, setSettings] = useState({ stream: true });
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
  });
  const [modelUsage, setModelUsage] = useState<TokenUsageEntity[]>([]);
  const { setError } = useChatActions();

  const loadTokenUsage = useCallback(async () => {
    const [usage, usageByModel] = await Promise.all([
      chatRepository.getTotalTokenUsage(),
      chatRepository.getTokenUsageByModel(),
    ]);
    setTokenUsage(usage);
    setModelUsage(usageByModel);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTokenUsage();
    });
  }, [loadTokenUsage]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {showHeader && (
        <header aria-label="page-header" className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/20">
              <Settings className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                설정
              </h1>
              <p className="text-sm text-muted-foreground">
                AI 모델과 애플리케이션 환경설정을 관리하세요
              </p>
            </div>
          </div>
        </header>
      )}

      {/* 토큰 사용량 — 초기화 버튼 없음 */}
      <section
        aria-label="token-usage-section"
        className="animate-in fade-in slide-in-from-bottom-4 duration-500"
      >
        <Card className="min-w-0 overflow-hidden bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/10">
                <Zap className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">
                  토큰 사용량
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  전체 대화에서 사용된 토큰 통계
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TokenUsage
              usage={tokenUsage}
              maxTokens={1000000}
              modelId="gemini-2.5-flash-lite"
            />
            {modelUsage.length > 0 && (
              <div className="mt-4 overflow-x-auto overflow-y-hidden rounded-lg border border-white/10">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-white/5 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">모델</th>
                      <th className="px-3 py-2 text-right font-medium">요청</th>
                      <th className="px-3 py-2 text-right font-medium">토큰</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelUsage.map((usage) => (
                      <tr key={usage.id} className="border-t border-white/10">
                        <td className="max-w-0 break-all px-3 py-2 font-mono text-xs">
                          {usage.modelId}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {usage.requestCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {usage.totalTokens.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <PromptTemplateSection />

      {/* 오류 테스트 */}
      <section
        aria-label="debug-error-section"
        className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75"
      >
        <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/10">
                <AlertTriangle className="h-5 w-5 text-red-300" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">
                  오류 테스트
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  오류 모달과 복구 흐름을 확인합니다
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setError("429 RESOURCE_EXHAUSTED: Quota exceeded test")
                }
                className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
              >
                429 테스트
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setError("500 INTERNAL_SERVER_ERROR test")}
                className="border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 hover:text-orange-100"
              >
                500 테스트
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* AI 모델 — 고정 정보 표시 (선택 불가) */}
      <section
        aria-label="model-info-section"
        className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100"
      >
        <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10">
                <Sparkles className="h-5 w-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">AI 모델</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  현재 사용 중인 모델
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/5 p-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 shrink-0">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    Gemini 2.5 Flash Lite
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium shrink-0">
                    사용 중
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  빠르고 효율적인 기본 모델
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 응답 설정 (스트리밍 ON/OFF) */}
      <section
        aria-label="advanced-settings-section"
        className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200"
      >
        <ModelSettings settings={settings} onChange={setSettings} />
      </section>
    </div>
  );
}
```

### 주의사항

- `model` prop은 더 이상 `ModelSettings`에 넘기지 않음 (Task 1에서 제거됨)
- `tokenUsage`에 `{ inputTokens: 0, outputTokens: 0 }` 초기값 — `TokenUsage` 컴포넌트 인터페이스 그대로 유지
- `loadTokenUsage`는 유지 (토큰 사용량 표시는 그대로 필요)

---

## Task 3 — `src/components/features/PromptTemplateSection.tsx` 수정

### 작업 유형

기존 파일 수정

### 현재 파일 내용

```tsx
// (전체 104줄 — 실제 파일 참고)
// 핵심 구조:
// - openCreate, openEdit, closeModal, handleDelete 핸들러
// - CardHeader: 제목 + "새 템플릿" Button
// - CardContent: 템플릿 목록 또는 빈 상태
// - PromptTemplateFormModal (mode && 조건부 렌더)
```

### 변경 사항

1. 템플릿 최대 8개 제한: `templates.length >= 8`이면 "새 템플릿" 버튼 `disabled`
2. CardHeader에 `{templates.length}/8` 카운터 표시
3. "새 템플릿" 버튼 UI 개선 — 그라디언트 스타일, 8개 도달 시 잠금 아이콘으로 교체

### 완성 코드

```tsx
import { useState } from "react";
import { FileText, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePromptTemplates } from "@/hooks/usePromptTemplates";
import type { PromptTemplate } from "@/features/chat/types";
import { PromptTemplateFormModal } from "@/components/features/PromptTemplateFormModal";

const MAX_TEMPLATES = 8;

export function PromptTemplateSection() {
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
  } = usePromptTemplates();
  const [mode, setMode] = useState<"create" | "edit" | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(
    null,
  );

  const isAtLimit = templates.length >= MAX_TEMPLATES;

  const openCreate = () => {
    if (isAtLimit) return;
    setEditingTemplate(null);
    setMode("create");
  };

  const openEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setMode("edit");
  };

  const closeModal = () => {
    setMode(null);
    setEditingTemplate(null);
  };

  const handleDelete = async (template: PromptTemplate) => {
    if (!window.confirm(`'${template.name}' 템플릿을 삭제하시겠습니까?`))
      return;
    await deleteTemplate(template.id);
  };

  return (
    <section
      aria-label="prompt-template-section"
      className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75"
    >
      <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-purple-500/10">
                <FileText className="h-5 w-5 text-sky-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">
                    프롬프트 템플릿
                  </CardTitle>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      isAtLimit
                        ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : "bg-white/10 text-muted-foreground"
                    }`}
                  >
                    {templates.length}/{MAX_TEMPLATES}
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  System prompt와 Few-shot 예시를 저장합니다
                </CardDescription>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={openCreate}
              disabled={isAtLimit}
              className={`gap-2 shrink-0 transition-all duration-200 ${
                isAtLimit
                  ? "opacity-50 cursor-not-allowed bg-white/5 border border-white/10 text-muted-foreground"
                  : "bg-gradient-to-r from-sky-500 to-purple-500 hover:from-sky-400 hover:to-purple-400 text-white border-0 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
              }`}
            >
              {isAtLimit ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    최대 {MAX_TEMPLATES}개
                  </span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">새 템플릿</span>
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
              불러오는 중...
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-muted-foreground">
              저장된 템플릿이 없습니다. 새 템플릿을 만들어 채팅 설정에서 불러올
              수 있습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {template.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {template.description || "설명 없음"}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground/70">
                      예시 {template.examples.length}개
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(template)}
                      aria-label="편집"
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template)}
                      aria-label="삭제"
                      className="h-8 w-8 text-muted-foreground hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {mode && (
        <PromptTemplateFormModal
          mode={mode}
          template={editingTemplate}
          onClose={closeModal}
          onSubmit={async (input) => {
            if (mode === "create") {
              await createTemplate(input);
              return;
            }
            if (editingTemplate) {
              await updateTemplate(editingTemplate.id, input);
            }
          }}
        />
      )}
    </section>
  );
}
```

### 주의사항

- `MAX_TEMPLATES = 8` 상수로 관리 (하드코딩 금지)
- 8개 도달 시 버튼이 `disabled` 처리되므로 `openCreate` 내부 가드도 함께 유지
- 기존 편집/삭제 기능은 변경하지 않음

---

## Task 4 — `src/components/features/PromptTemplateFormModal.tsx` 수정

### 작업 유형

기존 파일 수정 (저장 버튼 UI만 변경)

### 변경 사항

팝업 하단 footer의 `저장` 버튼만 UI 개선. 나머지 코드(프리셋, 폼 필드, 유효성 검사, 핸들러)는 일절 변경하지 않음.

### 변경할 부분

```tsx
// 변경 전 (파일 하단 footer 영역)
          <div className="flex justify-end gap-2 border-t border-white/10 bg-bg-200/40 px-5 py-4">
            <Button type="button" variant="ghost" onClick={onClose}>취소</Button>
            <Button type="button" onClick={handleSubmit} disabled={hasErrors || isSaving} className="gap-2">
              <Save size={16} /> 저장
            </Button>
          </div>

// 변경 후
          <div className="flex justify-end gap-2 border-t border-white/10 bg-bg-200/40 px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={hasErrors || isSaving}
              className={`gap-2 px-6 transition-all duration-200 border-0 text-white ${
                hasErrors || isSaving
                  ? 'bg-white/10 text-muted-foreground cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30'
              }`}
            >
              <Save size={16} />
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </div>
```

### 주의사항

- footer 영역만 변경. 그 외 컴포넌트 내용(프리셋 선택, 폼 필드, 예시 섹션) 수정 금지
- `isSaving` 중에는 버튼 텍스트가 `저장 중...`으로 변경됨
- `hasErrors`일 때는 흐린 스타일 유지 (그라디언트 적용 안 함)
