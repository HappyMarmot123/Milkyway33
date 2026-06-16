import Dexie, { type EntityTable } from 'dexie';
import { ChatMessage, ChatPromptConfig, Conversation } from '@/features/chat/types';

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
};

let dbInstance: MilkywayDB | null = null;

export function dexieInit(): MilkywayDB {
    if (dbInstance) return dbInstance;

    const db = new Dexie('MilkywayDB') as MilkywayDB;

    // Schema definition - version 3 adds tokenUsage table
    db.version(3).stores({
        conversations: 'id, updatedAt',
        messages: 'id, conversationId, timestamp',
        configs: 'id, updatedAt',
        tokenUsage: 'id, updatedAt'
    });

    dbInstance = db;
    return db;
}
