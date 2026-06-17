import { dexieInit } from '@/lib/db';
import type { PromptTemplate } from '@/features/chat/types';
import { PROMPT_PRESETS } from '@/features/promptTemplates/presets';

function generateId(): string {
  return `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export interface PromptTemplateInput {
  name: string;
  description: string;
  systemInstruction: string;
}

export const promptTemplateRepository = {
  async getAll(): Promise<PromptTemplate[]> {
    const db = dexieInit();
    return db.promptTemplates.orderBy('updatedAt').reverse().toArray();
  },

  async getById(id: string): Promise<PromptTemplate | undefined> {
    const db = dexieInit();
    return db.promptTemplates.get(id);
  },

  async create(input: PromptTemplateInput): Promise<PromptTemplate> {
    const db = dexieInit();
    const now = new Date();
    const template: PromptTemplate = {
      id: generateId(),
      name: input.name.trim(),
      description: input.description.trim(),
      systemInstruction: input.systemInstruction.trim(),
      createdAt: now,
      updatedAt: now,
    };

    await db.promptTemplates.put(template);
    return template;
  },

  async update(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>): Promise<void> {
    const db = dexieInit();
    await db.promptTemplates.update(id, {
      ...updates,
      updatedAt: new Date(),
    });
  },

  async delete(id: string): Promise<void> {
    const db = dexieInit();
    await db.promptTemplates.delete(id);
  },

  async seed(): Promise<void> {
    const db = dexieInit();
    const now = new Date();

    // 사용자가 직접 수정한 시드 템플릿은 덮어쓰지 않는다.
    // createdAt === updatedAt 이면 미수정 상태로 간주하고 upsert.
    const existing = await db.promptTemplates
      .where('id')
      .startsWithAnyOf(PROMPT_PRESETS.map((_, i) => `template_seed_${i}`))
      .toArray();
    const modifiedIds = new Set(
      existing
        .filter((t) => t.createdAt.getTime() !== t.updatedAt.getTime())
        .map((t) => t.id),
    );

    const templates: PromptTemplate[] = PROMPT_PRESETS
      .map((preset, index) => ({
        id: `template_seed_${index}`,
        name: preset.name,
        description: preset.description,
        systemInstruction: preset.systemInstruction,
        createdAt: new Date(now.getTime() - (PROMPT_PRESETS.length - index) * 1000),
        updatedAt: new Date(now.getTime() - (PROMPT_PRESETS.length - index) * 1000),
      }))
      .filter((t) => !modifiedIds.has(t.id));

    if (templates.length > 0) {
      await db.promptTemplates.bulkPut(templates);
    }
  },
};
