import { useCallback, useContext } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dexieInit } from '@/lib/db';
import { ChatActionsContext } from '@/contexts/ChatContext';
import { promptTemplateRepository, type PromptTemplateInput } from '@/services/promptTemplateRepository';
import type { PromptTemplate } from '@/features/chat/types';

export function usePromptTemplates() {
  const db = dexieInit();
  const chatActions = useContext(ChatActionsContext);

  const templates = useLiveQuery(
    () => db.promptTemplates.orderBy('updatedAt').reverse().toArray(),
    [],
  );

  const createTemplate = useCallback(async (input: PromptTemplateInput) => {
    await promptTemplateRepository.create(input);
  }, []);

  const updateTemplate = useCallback(async (id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>) => {
    await promptTemplateRepository.update(id, updates);
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    await promptTemplateRepository.delete(id);
  }, []);

  const applyTemplate = useCallback((templateId: string) => {
    const template = templates?.find((item) => item.id === templateId);
    if (!template) return;

    chatActions?.setPromptConfig({
      systemInstruction: template.systemInstruction,
    });
  }, [chatActions, templates]);

  return {
    templates: templates ?? [],
    isLoading: templates === undefined,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    applyTemplate,
  };
}
