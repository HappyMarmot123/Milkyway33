import { useMemo, useState } from "react";
import { Bot, ChevronDown, MessageSquareQuote, Plus, Save, Settings2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPromptConfig, ChatMessageExample } from "@/features/chat/types";
import { usePromptTemplates } from "@/hooks/usePromptTemplates";
import {
  checkPromptText,
  getExampleErrors,
  normalizeExamples,
  PROMPT_EXAMPLE_LIMIT,
  PROMPT_EXAMPLE_MAX,
  PROMPT_SYSTEM_LIMIT,
} from "@/features/promptTemplates/validation";

interface PromptConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatPromptConfig;
  onSave: (config: ChatPromptConfig) => void;
}

function emptyExample(): ChatMessageExample {
  return { input: "", output: "" };
}

type PromptErrors = {
  system?: string;
  examples: Array<{ input?: string; output?: string }>;
};

function getPromptErrors(systemInstruction: string, examples: ChatMessageExample[]): PromptErrors {
  const system = systemInstruction
    ? checkPromptText(systemInstruction, PROMPT_SYSTEM_LIMIT) ?? undefined
    : undefined;
  return {
    ...(system ? { system } : {}),
    examples: examples.map(getExampleErrors),
  };
}

export const PromptConfigModal = ({ isOpen, onClose, config, onSave }: PromptConfigModalProps) => {
  if (!isOpen) return null;

  return (
    <PromptConfigForm
      key={JSON.stringify(config)}
      config={config}
      onClose={onClose}
      onSave={onSave}
    />
  );
};

function PromptConfigForm({
  config,
  onClose,
  onSave,
}: Pick<PromptConfigModalProps, "config" | "onClose" | "onSave">) {
  const { templates, isLoading } = usePromptTemplates();
  const [systemInstruction, setSystemInstruction] = useState(config.systemInstruction || "");
  const [examples, setExamples] = useState<ChatMessageExample[]>(
    config.examples?.length ? config.examples : [emptyExample()],
  );

  const errors = useMemo(
    () => getPromptErrors(systemInstruction, examples),
    [systemInstruction, examples],
  );
  const hasErrors = Boolean(
    errors.system || errors.examples.some((e) => e.input || e.output),
  );

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    setSystemInstruction(template.systemInstruction);
    setExamples(
      template.examples.length
        ? template.examples.map((e) => ({ ...e }))
        : [emptyExample()],
    );
  };

  const handleSave = () => {
    if (hasErrors) return;
    onSave({ systemInstruction, examples: normalizeExamples(examples) });
    onClose();
  };

  const updateExample = (index: number, field: keyof ChatMessageExample, value: string) => {
    setExamples((cur) =>
      cur.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)),
    );
  };

  const addExample = () => {
    setExamples((cur) => (cur.length >= PROMPT_EXAMPLE_MAX ? cur : [...cur, emptyExample()]));
  };

  const removeExample = (index: number) => {
    setExamples((cur) =>
      cur.length <= 1 ? [emptyExample()] : cur.filter((_, i) => i !== index),
    );
  };

  const systemPct = Math.min((systemInstruction.length / PROMPT_SYSTEM_LIMIT) * 100, 100);

  return (
    /* ── Backdrop ── */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6
                 bg-black/60 backdrop-blur-md
                 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* ── Panel ── */}
      <div
        className="relative flex w-full max-w-3xl flex-col overflow-hidden
                   rounded-2xl border border-white/10
                   bg-gradient-to-br from-bg-200/90 to-bg-100/90 backdrop-blur-2xl
                   shadow-[0_32px_80px_-12px_rgba(0,0,0,0.6)]
                   animate-in zoom-in-95 fade-in duration-300 ease-out
                   max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ── */}
        <div className="relative flex items-center justify-between border-b border-white/8 px-7 py-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl
                            bg-gradient-to-br from-amber-500/20 to-orange-500/10
                            border border-amber-500/20 shadow-inner">
              <Settings2 size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground/95">Prompt Settings</h2>
              <p className="text-[11px] text-muted-foreground">AI 역할과 행동 방식을 정의합니다</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-lg
                       text-muted-foreground/60
                       hover:bg-white/8 hover:text-foreground
                       transition-all duration-150"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6
                        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">

          {/* Template Selector */}
          <div className="rounded-xl border  p-4
                          transition-colors border-white/12 bg-white/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-medium">템플릿에서 불러오기</span>
            </div>
            <div className="relative">
              <select
                value=""
                onChange={(e) => handleTemplateSelect(e.target.value)}
                disabled={isLoading || templates.length === 0}
                className="w-full appearance-none rounded-lg border border-white/10
                           bg-bg-100/60 px-3 py-2 pr-8 text-sm
                           text-foreground/80
                           focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/40
                           disabled:cursor-not-allowed disabled:opacity-40
                           transition-all duration-150"
              >
                <option value="" disabled>
                  {isLoading
                    ? "불러오는 중..."
                    : templates.length
                    ? "템플릿 선택…"
                    : "저장된 템플릿 없음"}
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/60">
              선택 시 아래 내용을 덮어씁니다. 템플릿 원본은 변경되지 않습니다.
            </p>
          </div>

          {/* System Instruction */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">System Instruction</span>
              </div>
              {errors.system ? (
                <span className="text-[11px] font-medium text-red-400 animate-in fade-in duration-150">
                  {errors.system}
                </span>
              ) : (
                <span className="text-[11px] tabular-nums text-muted-foreground/50">
                  {systemInstruction.length} / {PROMPT_SYSTEM_LIMIT}
                </span>
              )}
            </div>

            <textarea
              value={systemInstruction}
              onChange={(e) => setSystemInstruction(e.target.value)}
              maxLength={PROMPT_SYSTEM_LIMIT}
              placeholder="AI의 역할, 응답 스타일, 제약 조건을 입력하세요…"
              className={`w-full min-h-52 resize-y rounded-xl border px-4 py-3 text-sm
                          bg-bg-100/40 placeholder:text-muted-foreground/40
                          focus:outline-none focus:ring-1
                          transition-all duration-200
                          ${errors.system
                            ? "border-red-500/50 focus:ring-red-500/40 focus:border-red-500/60"
                            : "border-white/10 focus:ring-purple-500/40 focus:border-purple-500/30 hover:border-white/16"
                          }`}
            />

            {/* progress bar */}
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  systemPct > 90
                    ? "bg-red-500/60"
                    : systemPct > 70
                    ? "bg-amber-500/60"
                    : "bg-purple-500/40"
                }`}
                style={{ width: `${systemPct}%` }}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="relative flex items-center gap-4">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          {/* Few-shot Examples */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div>
                  <span className="text-sm font-medium">Few-shot</span>
                  <span className="ml-2 text-[11px] text-muted-foreground/50">
                    {examples.filter((e) => e.input || e.output).length} / {PROMPT_EXAMPLE_MAX}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addExample}
                disabled={examples.length >= PROMPT_EXAMPLE_MAX}
                className="h-8 gap-1.5 border-white/10 bg-white/5 text-xs
                           hover:bg-white/10 hover:border-white/20
                           disabled:opacity-30 transition-all duration-150"
              >
                <Plus size={13} />
                예시 추가
              </Button>
            </div>

            <div className="space-y-3">
              {examples.map((example, index) => (
                <div
                  key={index}
                  className="group rounded-xl border
                             overflow-hidden transition-all duration-200
                             border-white/12 bg-white/[0.05]"
                >
                  {/* Example header */}
                  <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md
                                       bg-emerald-500/15 text-[10px] font-semibold text-emerald-400">
                        {index + 1}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground/70">
                        예시 쌍
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExample(index)}
                      aria-label="예시 삭제"
                      className="flex h-6 w-6 items-center justify-center rounded-md
                                 text-muted-foreground/40
                                 hover:bg-red-500/12 hover:text-red-400
                                 opacity-0 group-hover:opacity-100
                                 transition-all duration-150"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Input / Output */}
                  <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/6">
                    {/* User Input */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-blue-400/70">
                          User
                        </span>
                        {errors.examples[index]?.input ? (
                          <span className="text-[10px] text-red-400">{errors.examples[index].input}</span>
                        ) : (
                          <span className="text-[10px] tabular-nums text-muted-foreground/40">
                            {example.input.length}/{PROMPT_EXAMPLE_LIMIT}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={example.input}
                        onChange={(e) => updateExample(index, "input", e.target.value)}
                        maxLength={PROMPT_EXAMPLE_LIMIT}
                        placeholder="사용자 질문이나 입력…"
                        className={`w-full min-h-[96px] resize-y rounded-lg border px-3 py-2.5 text-sm
                                    bg-bg-100/30 placeholder:text-muted-foreground/30
                                    focus:outline-none focus:ring-1
                                    transition-all duration-150
                                    ${errors.examples[index]?.input
                                      ? "border-red-500/40 focus:ring-red-500/30"
                                      : "border-white/8 focus:ring-blue-500/30 focus:border-blue-500/25 hover:border-white/14"
                                    }`}
                      />
                    </div>

                    {/* Model Response */}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/70">
                          Assistant
                        </span>
                        {errors.examples[index]?.output ? (
                          <span className="text-[10px] text-red-400">{errors.examples[index].output}</span>
                        ) : (
                          <span className="text-[10px] tabular-nums text-muted-foreground/40">
                            {example.output.length}/{PROMPT_EXAMPLE_LIMIT}
                          </span>
                        )}
                      </div>
                      <textarea
                        value={example.output}
                        onChange={(e) => updateExample(index, "output", e.target.value)}
                        maxLength={PROMPT_EXAMPLE_LIMIT}
                        placeholder="모델이 응답해야 할 내용…"
                        className={`w-full min-h-[96px] resize-y rounded-lg border px-3 py-2.5 text-sm
                                    bg-bg-100/30 placeholder:text-muted-foreground/30
                                    focus:outline-none focus:ring-1
                                    transition-all duration-150
                                    ${errors.examples[index]?.output
                                      ? "border-red-500/40 focus:ring-red-500/30"
                                      : "border-white/8 focus:ring-emerald-500/30 focus:border-emerald-500/25 hover:border-white/14"
                                    }`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="relative flex items-center justify-between gap-3
                        border-t border-white/8 bg-white/[0.015] px-7 py-4">
          <p className="text-[11px] text-muted-foreground/40">
            {hasErrors ? "입력값을 확인해주세요." : "변경사항은 저장 후 적용됩니다."}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              className="h-9 px-4 text-sm text-muted-foreground/70
                         hover:bg-white/6 hover:text-foreground
                         transition-all duration-150"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={hasErrors}
              className="h-9 gap-2 px-5 text-sm font-medium
                         bg-gradient-to-r from-amber-600 to-amber-500
                         hover:from-amber-500 hover:to-amber-400
                         text-white shadow-lg shadow-amber-500/20
                         disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all duration-200"
            >
              <Save size={15} />
              저장
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
