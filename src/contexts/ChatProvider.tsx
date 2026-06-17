import { ReactNode, useMemo, useRef } from "react";
import {
  ChatActionsContext,
  ChatConfigContext,
  ChatConversationsContext,
  ChatHasMessagesContext,
  ChatMessagesContext,
  ChatRuntimeContext,
  ChatStreamingContext,
  type ChatActionsContextType,
  type ChatConfigContextType,
  type ChatConversationsContextType,
  type ChatHasMessagesContextType,
  type ChatMessagesContextType,
  type ChatRuntimeContextType,
  type ChatStreamingContextType,
} from "@/contexts/ChatContext";
import { useChat } from "@/hooks/useChat";

export function ChatProvider({ children }: { children: ReactNode }) {
  const chat = useChat();
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const actions = useMemo<ChatActionsContextType>(() => ({
    sendMessage: (...args) => chatRef.current.sendMessage(...args),
    regenerateLastResponse: (...args) => chatRef.current.regenerateLastResponse(...args),
    clearMessages: (...args) => chatRef.current.clearMessages(...args),
    clearError: (...args) => chatRef.current.clearError(...args),
    setError: (...args) => chatRef.current.setError(...args),
    setPromptConfig: (...args) => chatRef.current.setPromptConfig(...args),
    createNewConversation: (...args) => chatRef.current.createNewConversation(...args),
    switchConversation: (...args) => chatRef.current.switchConversation(...args),
    deleteConversation: (...args) => chatRef.current.deleteConversation(...args),
    renameConversation: (...args) => chatRef.current.renameConversation(...args),
  }), []);

  const messages = useMemo<ChatMessagesContextType>(() => ({
    messages: chat.messages,
  }), [chat.messages]);

  const conversations = useMemo<ChatConversationsContextType>(() => ({
    conversations: chat.conversations,
    currentConversationId: chat.currentConversationId,
  }), [chat.conversations, chat.currentConversationId]);

  const hasMessages = useMemo<ChatHasMessagesContextType>(() => ({
    hasMessages: chat.messages.length > 0,
  }), [chat.messages.length]);

  const runtime = useMemo<ChatRuntimeContextType>(() => ({
    status: chat.status,
    currentMetadata: chat.currentMetadata,
    error: chat.error,
    isLoading: chat.isLoading,
  }), [
    chat.status,
    chat.currentMetadata,
    chat.error,
    chat.isLoading,
  ]);

  const streaming = useMemo<ChatStreamingContextType>(() => ({
    currentResponse: chat.currentResponse,
  }), [chat.currentResponse]);

  const config = useMemo<ChatConfigContextType>(() => ({
    promptConfig: chat.promptConfig,
  }), [chat.promptConfig]);

  return (
    <ChatActionsContext.Provider value={actions}>
      <ChatMessagesContext.Provider value={messages}>
        <ChatConversationsContext.Provider value={conversations}>
          <ChatHasMessagesContext.Provider value={hasMessages}>
            <ChatRuntimeContext.Provider value={runtime}>
              <ChatStreamingContext.Provider value={streaming}>
                <ChatConfigContext.Provider value={config}>
                  {children}
                </ChatConfigContext.Provider>
              </ChatStreamingContext.Provider>
            </ChatRuntimeContext.Provider>
          </ChatHasMessagesContext.Provider>
        </ChatConversationsContext.Provider>
      </ChatMessagesContext.Provider>
    </ChatActionsContext.Provider>
  );
}
