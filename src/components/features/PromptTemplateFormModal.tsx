import { useMemo, useState } from 'react';
import { HelpCircle, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { PromptTemplate } from '@/features/chat/types';
import { PRESET_CATEGORIES, PROMPT_PRESETS, type PromptPreset, type PromptPresetCategory } from '@/features/promptTemplates/presets';
import { checkPromptText, PROMPT_SYSTEM_LIMIT } from '@/features/promptTemplates/validation';

interface PromptTemplateFormModalProps {
  mode: 'create' | 'edit';
  template?: PromptTemplate | null;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string; systemInstruction: string }) => Promise<void>;
}

function FieldLabel({ label, tooltip, required, counter }: { label: string; tooltip: string; required?: boolean; counter?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">
          {label}{required && <span className="ml-0.5 text-red-400">*</span>}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle size={13} className="cursor-help text-muted-foreground/60" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 bg-bg-200 text-xs text-foreground">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      {counter && <span className="text-xs text-muted-foreground">{counter}</span>}
    </div>
  );
}

export function PromptTemplateFormModal({ mode, template, onClose, onSubmit }: PromptTemplateFormModalProps) {
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [systemInstruction, setSystemInstruction] = useState(template?.systemInstruction ?? '');
  const [category, setCategory] = useState<PromptPresetCategory>('개발');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const categoryPresets = useMemo(() => PROMPT_PRESETS.filter((preset) => preset.category === category), [category]);
  const systemError = systemInstruction.trim() ? checkPromptText(systemInstruction, PROMPT_SYSTEM_LIMIT) : 'System Instruction을 입력하세요.';
  const nameError = name.trim().length < 2 ? '이름은 2자 이상 입력하세요.' : name.trim().length > 30 ? '이름은 30자 이내로 입력하세요.' : null;
  const hasErrors = Boolean(nameError || systemError);

  const handlePresetSelect = (preset: PromptPreset) => {
    setName(preset.name);
    setDescription(preset.description);
    setSystemInstruction(preset.systemInstruction);
    setSelectedPresetId(preset.id);
  };

  const handleSubmit = async () => {
    if (hasErrors || isSaving) return;

    setIsSaving(true);
    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      systemInstruction: systemInstruction.trim(),
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-bg-100 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">{mode === 'create' ? '새 프롬프트 템플릿' : '프롬프트 템플릿 편집'}</h2>
              <p className="text-xs text-muted-foreground">System Instruction을 저장합니다</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground" aria-label="닫기">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">
            {mode === 'create' && (
              <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">프리셋으로 시작하기</h3>
                  <span className="text-xs text-muted-foreground">선택 후 자유롭게 수정 가능</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${category === item ? 'border-purple-500/40 bg-purple-500/15 text-purple-200' : 'border-white/10 bg-white/5 text-muted-foreground hover:text-foreground'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {categoryPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={`rounded-lg border p-3 text-left transition-colors ${selectedPresetId === preset.id ? 'border-purple-500/50 bg-purple-500/15' : 'border-white/10 bg-bg-200/50 hover:bg-white/10'}`}
                    >
                      <div className="text-sm font-medium">{preset.categoryIcon} {preset.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{preset.description}</div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="space-y-2">
                <FieldLabel label="이름" required tooltip="템플릿을 구분하는 이름입니다. 채팅 화면에서 불러올 때 이 이름으로 표시됩니다." counter={`${name.length}/30`} />
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={30} placeholder="프론트개발 프롬프트" className={`flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${nameError ? 'border-red-500' : 'border-input'}`} />
                {nameError && <p className="text-xs text-red-400">{nameError}</p>}
              </div>

              <div className="space-y-2">
                <FieldLabel label="설명" tooltip="템플릿의 용도를 간단히 적어두세요. 목록에서 미리보기로 표시됩니다." counter={`${description.length}/80`} />
                <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={80} placeholder="React/TypeScript 특화 어시스턴트" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
              </div>

              <div className="space-y-2">
                <FieldLabel label="System Instruction" required tooltip="AI가 대화 전반에 걸쳐 따를 역할과 규칙을 정의합니다." counter={`${systemInstruction.length}/${PROMPT_SYSTEM_LIMIT}`} />
                <textarea value={systemInstruction} onChange={(event) => setSystemInstruction(event.target.value)} maxLength={PROMPT_SYSTEM_LIMIT} className={`flex min-h-32 w-full resize-y rounded-md border bg-transparent p-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${systemError ? 'border-red-500' : 'border-input'}`} placeholder="너는 React/TypeScript 전문 프론트엔드 개발자야..." />
                {systemError && <p className="text-xs text-red-400">{systemError}</p>}
              </div>
            </section>
          </div>

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
              className={`gap-2 px-6 transition-all duration-200 ${
                hasErrors || isSaving
                  ? 'bg-white/10 text-muted-foreground cursor-not-allowed'
                  : 'border border-purple-500/30 bg-purple-500/15 text-purple-100 hover:bg-purple-500/25 hover:border-purple-500/40'
              }`}
            >
              <Save size={16} />
              {isSaving ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
