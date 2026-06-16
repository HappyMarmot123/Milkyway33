import { useState, useCallback } from 'react';
import { streamChat } from '@/api/chat';
import type { 
  ChatMessage, 
  ChatMetadata, 
  ChatState,
  ChatPromptConfig
} from '@/features/chat/types';
import { chatRepository } from '@/services/chatRepository';
import { useChatStorage } from '@/hooks/useChatStorage';

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function useChat() {
  // Current conversation ID
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  
  // Persistent Storage
  const { messages: storedMessages, settings: storedSettings, conversations } = useChatStorage(currentConversationId ?? undefined);
  
  // Local State (Transient)
  const [status, setStatus] = useState<ChatState['status']>('idle');
  const [currentResponse, setCurrentResponse] = useState('');
  const [currentMetadata, setCurrentMetadata] = useState<ChatMetadata | null>(null);
  const [error, setErrorState] = useState<string | null>(null);

  const promptConfig: ChatPromptConfig = storedSettings || { systemInstruction: '', examples: [] };

  const setPromptConfig = useCallback((config: Partial<ChatPromptConfig>) => {
    const newConfig = { ...promptConfig, ...config };
    chatRepository.saveSettings(newConfig);
  }, [promptConfig]);

  // Create a new conversation (max 10 sessions)
  const createNewConversation = useCallback(async () => {
    // Check conversation limit
    if (conversations.length >= 10) {
      setErrorState('대화 세션은 최대 10개까지 생성 가능합니다. 기존 대화를 삭제해주세요.');
      return null;
    }
    
    const conversation = await chatRepository.createConversation();
    setCurrentConversationId(conversation.id);
    setCurrentResponse('');
    setCurrentMetadata(null);
    setErrorState(null);
    return conversation;
  }, [conversations.length]);

  // Switch to an existing conversation
  const switchConversation = useCallback((conversationId: string) => {
    setCurrentConversationId(conversationId);
    setCurrentResponse('');
    setCurrentMetadata(null);
    setErrorState(null);
  }, []);

  // Update conversation title based on first user message
  const updateConversationTitle = useCallback(async (conversationId: string, content: string) => {
    const title = content.length > 30 ? content.slice(0, 30) + '...' : content;
    await chatRepository.updateConversation(conversationId, { title });
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || status !== 'idle') return;

    let conversationId = currentConversationId;
    
    // If no conversation exists, create one
    if (!conversationId) {
      const conversation = await createNewConversation();
      if (!conversation) return; // Session limit reached
      conversationId = conversation.id;
    }

    // Add user message to DB
    const userMessage: ChatMessage = {
      id: generateId(),
      conversationId,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    await chatRepository.saveMessage(userMessage);

    // Update title if this is the first message
    if (storedMessages.length === 0) {
      await updateConversationTitle(conversationId, content.trim());
    }

    // Reset transient state
    setCurrentResponse('');
    setCurrentMetadata(null);
    setErrorState(null);

    try {
      let fullResponse = '';
      let metadata: ChatMetadata = {};

      for await (const event of streamChat(content, promptConfig)) {
        switch (event.status) {
          case 'thinking':
            setStatus('thinking');
            if (event.model) {
              metadata.model_used = event.model;
            }
            break;

          case 'generating':
            setStatus('generating');
            break;

          case 'streaming':
            setStatus('streaming');
            if (event.chunk) {
              fullResponse += event.chunk;
              setCurrentResponse(fullResponse);
            }
            break;

          case 'complete':
            metadata = {
              model_used: event.model_used,
              thought: event.thought,
              finish_reason: event.finish_reason,
              safety_ratings: event.safety_ratings,
              usage_metadata: event.usage_metadata,
            };

            // Add assistant message to DB
            {
              const assistantMessage: ChatMessage = {
                id: generateId(),
                conversationId,
                role: 'assistant',
                content: fullResponse || event.response || '',
                timestamp: new Date(),
                metadata,
              };
              await chatRepository.saveMessage(assistantMessage);
            }

            // Save token usage
            if (event.usage_metadata) {
              await chatRepository.addGeminiUsage(event.usage_metadata, event.model_used);
            }

            setStatus('idle');
            setCurrentResponse('');
            setCurrentMetadata(metadata);
            break;

          case 'error':
            setStatus('idle');
            setErrorState(event.message || 'An error occurred');
            break;
        }
      }
    } catch (error) {
      let errorMessage = 'An error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
        
        if (errorMessage.includes('403')) {
          errorMessage = '보안 정책에 의해 차단된 메시지입니다.';
        } else if (errorMessage.includes('400')) {
          errorMessage = '잘못된 요청입니다. 메시지 길이를 확인해주세요.';
        }
      }
      
      setStatus('idle');
      setErrorState(errorMessage);
    }
  }, [status, currentConversationId, promptConfig, storedMessages.length, createNewConversation, updateConversationTitle]);

  const clearMessages = useCallback(async () => {
    if (currentConversationId) {
      await chatRepository.clearConversationMessages(currentConversationId);
    }
    setCurrentResponse('');
    setCurrentMetadata(null);
    setErrorState(null);
  }, [currentConversationId]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    await chatRepository.deleteConversation(conversationId);
    if (currentConversationId === conversationId) {
      setCurrentConversationId(null);
    }
  }, [currentConversationId]);

  const renameConversation = useCallback(async (conversationId: string, newTitle: string) => {
    await chatRepository.updateConversation(conversationId, { title: newTitle });
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  const setError = useCallback((err: string) => {
    setErrorState(err);
  }, []);

  const regenerateLastResponse = useCallback(async () => {
    if (status !== 'idle' || storedMessages.length === 0 || !currentConversationId) return;

    let lastUserMessageIndex = -1;
    for (let i = storedMessages.length - 1; i >= 0; i--) {
      if (storedMessages[i].role === 'user') {
        lastUserMessageIndex = i;
        break;
      }
    }
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = storedMessages[lastUserMessageIndex];
    if (!lastUserMessage) return;

    const messagesToDelete = storedMessages.slice(lastUserMessageIndex).map(m => m.id);
    await chatRepository.deleteMessages(messagesToDelete);
    
    sendMessage(lastUserMessage.content);

  }, [status, storedMessages, currentConversationId, sendMessage]);

  return {
    // State
    status,
    messages: storedMessages,
    conversations,
    currentConversationId,
    currentResponse,
    currentMetadata,
    error,
    isLoading: status !== 'idle',
    promptConfig,
    
    // Actions
    sendMessage,
    regenerateLastResponse,
    clearMessages,
    clearError,
    setError,
    setPromptConfig,
    createNewConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
  };
}
