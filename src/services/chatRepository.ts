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
  async createConversation(title?: string): Promise<Conversation> {
    const db = dexieInit();
    const now = new Date();
    const conversation: Conversation = {
      id: `conv_${generateId()}`,
      title: title || '새 대화',
      createdAt: now,
      updatedAt: now,
    };
    await db.conversations.put(conversation);
    return conversation;
  },

  async getConversation(id: string): Promise<Conversation | undefined> {
    const db = dexieInit();
    return await db.conversations.get(id);
  },

  async getAllConversations(): Promise<Conversation[]> {
    const db = dexieInit();
    return await db.conversations.orderBy('updatedAt').reverse().toArray();
  },

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    const db = dexieInit();
    await db.conversations.update(id, { ...updates, updatedAt: new Date() });
  },

  async deleteConversation(id: string): Promise<void> {
    const db = dexieInit();
    // Delete all messages in this conversation
    await db.messages.where('conversationId').equals(id).delete();
    // Delete the conversation
    await db.conversations.delete(id);
  },

  // Messages
  async saveMessage(message: ChatMessage): Promise<void> {
    const db = dexieInit();
    await db.messages.put(message);
    // Update conversation's updatedAt
    await db.conversations.update(message.conversationId, { updatedAt: new Date() });
  },

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    const db = dexieInit();
    return await db.messages.where('conversationId').equals(conversationId).sortBy('timestamp');
  },

  async deleteMessages(ids: string[]): Promise<void> {
    const db = dexieInit();
    await db.messages.bulkDelete(ids);
  },

  async clearConversationMessages(conversationId: string): Promise<void> {
    const db = dexieInit();
    await db.messages.where('conversationId').equals(conversationId).delete();
  },

  // Settings
  async saveSettings(config: ChatPromptConfig): Promise<void> {
    const db = dexieInit();
    await db.configs.put({
      id: CONFIG_KEY,
      config,
      updatedAt: new Date(),
    });
  },

  async getSettings(): Promise<ChatPromptConfig | null> {
    const db = dexieInit();
    const result = await db.configs.get(CONFIG_KEY);
    return result ? result.config : null;
  },

  // Token Usage
  async addTokenUsage(inputTokens: number, outputTokens: number): Promise<void> {
    await this.addGeminiUsage({ prompt_token_count: inputTokens, candidates_token_count: outputTokens });
  },

  async addGeminiUsage(usage: UsageMetadata, modelId?: string): Promise<void> {
    const db = dexieInit();
    const inputTokens = usage.prompt_token_count || 0;
    const outputTokens = usage.candidates_token_count || 0;
    const cachedTokens = usage.cached_content_token_count || 0;
    const toolUsePromptTokens = usage.tool_use_prompt_token_count || 0;
    const thoughtsTokens = usage.thoughts_token_count || 0;
    const totalTokens = usage.total_token_count || inputTokens + outputTokens + thoughtsTokens;

    const incrementUsage = async (id: string, usageModelId?: string) => {
      const existing = await db.tokenUsage.get(id);
      const next: TokenUsageEntity = {
        id,
        modelId: usageModelId,
        inputTokens: (existing?.inputTokens || 0) + inputTokens,
        outputTokens: (existing?.outputTokens || 0) + outputTokens,
        cachedTokens: (existing?.cachedTokens || 0) + cachedTokens,
        toolUsePromptTokens: (existing?.toolUsePromptTokens || 0) + toolUsePromptTokens,
        thoughtsTokens: (existing?.thoughtsTokens || 0) + thoughtsTokens,
        totalTokens: (existing?.totalTokens || existingTotalTokens(existing)) + totalTokens,
        requestCount: (existing?.requestCount || 0) + 1,
        updatedAt: new Date(),
      };

      await db.tokenUsage.put(next);
    };

    await incrementUsage(TOKEN_USAGE_KEY);

    if (modelId) {
      await incrementUsage(`${MODEL_USAGE_PREFIX}${modelId}`, modelId);
    }
  },

  async getTotalTokenUsage(): Promise<TokenUsageEntity> {
    const db = dexieInit();
    const result = await db.tokenUsage.get(TOKEN_USAGE_KEY);
    return normalizeTokenUsage(result, TOKEN_USAGE_KEY);
  },

  async getTokenUsageByModel(): Promise<TokenUsageEntity[]> {
    const db = dexieInit();
    const records = await db.tokenUsage.toArray();
    return records
      .filter((record) => record.id.startsWith(MODEL_USAGE_PREFIX))
      .map((record) => normalizeTokenUsage(record, record.id))
      .sort((a, b) => b.totalTokens - a.totalTokens);
  },

  async resetTokenUsage(): Promise<void> {
    const db = dexieInit();
    await db.tokenUsage.clear();
  },
};

function existingTotalTokens(existing?: TokenUsageEntity): number {
  if (!existing) return 0;
  return existing.totalTokens || existing.inputTokens + existing.outputTokens + (existing.thoughtsTokens || 0);
}

function normalizeTokenUsage(record: TokenUsageEntity | undefined, id: string): TokenUsageEntity {
  return {
    id,
    modelId: record?.modelId,
    inputTokens: record?.inputTokens || 0,
    outputTokens: record?.outputTokens || 0,
    cachedTokens: record?.cachedTokens || 0,
    toolUsePromptTokens: record?.toolUsePromptTokens || 0,
    thoughtsTokens: record?.thoughtsTokens || 0,
    totalTokens: existingTotalTokens(record),
    requestCount: record?.requestCount || 0,
    updatedAt: record?.updatedAt || new Date(0),
  };
}
