import Dexie, { type EntityTable } from 'dexie';
import { ChatMessage, ChatPromptConfig, Conversation, PromptTemplate } from '@/features/chat/types';

// Define DB entities
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
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt',
        promptTemplates: 'id, name, updatedAt'
    });

    dbInstance = db;
    return db;
}
