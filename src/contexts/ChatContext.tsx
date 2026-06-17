import { createContext, useContext } from 'react';
import { useChat } from '@/hooks/useChat';

type ChatContextType = ReturnType<typeof useChat>;

export type ChatActionsContextType = Pick<
  ChatContextType,
  | 'sendMessage'
  | 'regenerateLastResponse'
  | 'clearMessages'
  | 'clearError'
  | 'setError'
  | 'setPromptConfig'
  | 'createNewConversation'
  | 'switchConversation'
  | 'deleteConversation'
  | 'renameConversation'
  | 'setMessageLiked'
>;

export type ChatMessagesContextType = Pick<
  ChatContextType,
  'messages'
>;

export type ChatConversationsContextType = Pick<
  ChatContextType,
  'conversations' | 'currentConversationId'
>;

export type ChatHasMessagesContextType = {
  hasMessages: boolean;
};

export type ChatRuntimeContextType = Pick<
  ChatContextType,
  'status' | 'currentMetadata' | 'error' | 'isLoading'
>;

export type ChatStreamingContextType = Pick<
  ChatContextType,
  'currentResponse'
>;

export type ChatConfigContextType = Pick<ChatContextType, 'promptConfig'>;

export const ChatActionsContext = createContext<ChatActionsContextType | null>(null);
export const ChatMessagesContext = createContext<ChatMessagesContextType | null>(null);
export const ChatConversationsContext = createContext<ChatConversationsContextType | null>(null);
export const ChatHasMessagesContext = createContext<ChatHasMessagesContextType | null>(null);
export const ChatRuntimeContext = createContext<ChatRuntimeContextType | null>(null);
export const ChatStreamingContext = createContext<ChatStreamingContextType | null>(null);
export const ChatConfigContext = createContext<ChatConfigContextType | null>(null);

function useRequiredContext<T>(context: T | null, hookName: string) {
  if (!context) {
    throw new Error(`${hookName} must be used within a ChatProvider`);
  }
  return context;
}

export function useChatActions() {
  return useRequiredContext(useContext(ChatActionsContext), 'useChatActions');
}

export function useChatMessages() {
  return useRequiredContext(useContext(ChatMessagesContext), 'useChatMessages');
}

export function useChatConversations() {
  return useRequiredContext(useContext(ChatConversationsContext), 'useChatConversations');
}

export function useChatHasMessages() {
  return useRequiredContext(useContext(ChatHasMessagesContext), 'useChatHasMessages');
}

export function useChatRuntime() {
  return useRequiredContext(useContext(ChatRuntimeContext), 'useChatRuntime');
}

export function useChatStreaming() {
  return useRequiredContext(useContext(ChatStreamingContext), 'useChatStreaming');
}

export function useChatConfig() {
  return useRequiredContext(useContext(ChatConfigContext), 'useChatConfig');
}

export function useChatContext() {
  return {
    ...useChatMessages(),
    ...useChatConversations(),
    ...useChatHasMessages(),
    ...useChatRuntime(),
    ...useChatStreaming(),
    ...useChatConfig(),
    ...useChatActions(),
  };
}
