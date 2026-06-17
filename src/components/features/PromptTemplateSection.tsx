import { useState } from 'react';
import { FileText, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePromptTemplates } from '@/hooks/usePromptTemplates';
import type { PromptTemplate } from '@/features/chat/types';
import { PromptTemplateFormModal } from '@/components/features/PromptTemplateFormModal';

const MAX_TEMPLATES = 8;

export function PromptTemplateSection() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate } = usePromptTemplates();
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);

  const isAtLimit = templates.length >= MAX_TEMPLATES;

  const openCreate = () => {
    if (isAtLimit) return;
    setEditingTemplate(null);
    setMode('create');
  };

  const openEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setMode('edit');
  };

  const closeModal = () => {
    setMode(null);
    setEditingTemplate(null);
  };

  const handleDelete = async (template: PromptTemplate) => {
    if (!window.confirm(`'${template.name}' 템플릿을 삭제하시겠습니까?`)) return;
    await deleteTemplate(template.id);
  };

  return (
    <section aria-label="prompt-template-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
      <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-purple-500/10">
                <FileText className="h-5 w-5 text-sky-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">프롬프트 템플릿</CardTitle>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    isAtLimit
                      ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                      : 'bg-white/10 text-muted-foreground'
                  }`}>
                    {templates.length}/{MAX_TEMPLATES}
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm">System prompt와 Few-shot 예시를 저장합니다</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={openCreate}
              disabled={isAtLimit}
              className={`gap-2 shrink-0 transition-all duration-200 ${
                isAtLimit
                  ? 'opacity-50 cursor-not-allowed bg-white/5 border border-white/10 text-muted-foreground'
                  : 'border border-white/10 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {isAtLimit ? (
                <>
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">최대 {MAX_TEMPLATES}개</span>
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
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">불러오는 중...</div>
          ) : templates.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-muted-foreground">
              저장된 템플릿이 없습니다. 새 템플릿을 만들어 채팅 설정에서 불러올 수 있습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <div key={template.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{template.name}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{template.description || '설명 없음'}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground/70">예시 {template.examples.length}개</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(template)} aria-label="편집" className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(template)} aria-label="삭제" className="h-8 w-8 text-muted-foreground hover:text-red-300">
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
            if (mode === 'create') {
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
