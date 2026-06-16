// Chat API Types
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: ChatMetadata;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageExample {
  input: string;
  output: string;
}

export interface ChatPromptConfig {
  systemInstruction?: string;
  examples?: ChatMessageExample[];
}

export interface ChatMetadata {
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
}

export interface SafetyRating {
  category: string;
  probability: string;
}

export interface UsageMetadata {
  prompt_token_count?: number | null;
  cached_content_token_count?: number | null;
  candidates_token_count?: number | null;
  tool_use_prompt_token_count?: number | null;
  thoughts_token_count?: number | null;
  total_token_count?: number | null;
}

// SSE Event Types
export type ChatEventStatus = 
  | 'thinking' 
  | 'generating' 
  | 'streaming' 
  | 'complete' 
  | 'error';

export interface ChatEvent {
  status: ChatEventStatus;
  model?: string;
  chunk?: string;
  response?: string;
  model_used?: string;
  thought?: string | null;
  finish_reason?: string | null;
  safety_ratings?: SafetyRating[] | null;
  usage_metadata?: UsageMetadata | null;
  message?: string; // for error status
}

// Chat State
export interface ChatState {
  status: 'idle' | 'thinking' | 'generating' | 'streaming';
  messages: ChatMessage[];
  currentResponse: string;
  currentMetadata: ChatMetadata | null;
  error: string | null;
  promptConfig: ChatPromptConfig;
}
