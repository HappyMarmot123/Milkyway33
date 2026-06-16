import { memo, useCallback, useState, useEffect } from "react";
import { RefreshCcwIcon, Settings2, Sparkles, TimerReset } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Loader } from "@/components/ai-elements/loader";
import { ErrorModal } from "@/components/features/ErrorModal";
import { ResponseActionContainer } from "@/components/features/ResponseActionContainer";
import { PromptConfigModal } from "@/components/features/PromptConfigModal";
import { useChatContext } from "@/contexts/ChatContext";
import {
  getChatCooldownSnapshot,
  useChatCooldown,
} from "@/features/chat/cooldownStore";
import type { ChatMetadata, ChatState } from "@/features/chat/types";

interface ChatBotProps {
  onMetadataUpdate?: (metadata: ChatMetadata) => void;
}

type ChatStatus = ChatState["status"];
type SubmitStatus = "submitted" | "streaming" | undefined;

interface CooldownTextareaProps {
  input: string;
  status: ChatStatus;
  onInputChange: (value: string) => void;
  onFocusChange: (isFocused: boolean) => void;
  onSubmit: (message: { text?: string }) => void;
}

const CooldownTextarea = memo(({
  input,
  status,
  onInputChange,
  onFocusChange,
  onSubmit,
}: CooldownTextareaProps) => {
  const cooldown = useChatCooldown();
  const cooldownLabel = `${cooldown.remainingSeconds}초`;

  return (
    <PromptInputTextarea
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onInputChange(e.target.value)}
      value={input}
      placeholder={cooldown.isActive ? `${cooldownLabel} 후 다시 요청할 수 있습니다` : "메시지를 입력하세요..."}
      disabled={cooldown.isActive || status !== 'idle'}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit({ text: input });
        }
      }}
    />
  );
});

CooldownTextarea.displayName = "CooldownTextarea";

interface CooldownSubmitAreaProps {
  input: string;
  status: ChatStatus;
  submitStatus: SubmitStatus;
  onSetError: (error: string) => void;
}

const CooldownSubmitArea = memo(({ input, status, submitStatus, onSetError }: CooldownSubmitAreaProps) => {
  const cooldown = useChatCooldown();
  const cooldownLabel = `${cooldown.remainingSeconds}초`;
  const canSubmit = input.trim() && !cooldown.isActive && status === 'idle';

  return (
    <div className="flex items-center gap-2">
      {cooldown.isActive && (
        <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-200">
          <TimerReset size={12} className="text-orange-300" />
          <span>{cooldownLabel}</span>
        </div>
      )}

      {/* DEV: Error Simulation (hidden in production) */}
      <div className="hidden sm:flex gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => onSetError("429 RESOURCE_EXHAUSTED: Quota exceeded test")}
          className="text-[9px] bg-red-500/20 text-red-400/80 border border-red-500/30 px-1.5 py-0.5 rounded hover:bg-red-500/30 transition-colors"
          title="Simulate 429 Error"
        >
          429
        </button>
        <button
          type="button"
          onClick={() => onSetError("500 INTERNAL_SERVER_ERROR test")}
          className="text-[9px] bg-orange-500/20 text-orange-400/80 border border-orange-500/30 px-1.5 py-0.5 rounded hover:bg-orange-500/30 transition-colors"
          title="Simulate 500 Error"
        >
          500
        </button>
      </div>

      <PromptInputSubmit
        disabled={!canSubmit}
        status={submitStatus}
        className={`
          rounded-xl h-9 w-9 transition-all duration-300
          ${canSubmit
            ? "text-white"
            : "bg-white/10 text-muted-foreground/50"
          }
        `}
      />
    </div>
  );
});

CooldownSubmitArea.displayName = "CooldownSubmitArea";

const CooldownDisclaimer = memo(() => {
  const cooldown = useChatCooldown();

  return (
    <p className="text-[10px] sm:text-[11px] text-muted-foreground text-center mt-3">
      {cooldown.isActive
        ? `무료 플랜 보호를 위해 요청 간 ${cooldown.remainingSeconds}초 대기 중`
        : "Milkyway-33 / Made by @HappyMarmot123"}
    </p>
  );
});

CooldownDisclaimer.displayName = "CooldownDisclaimer";

const ChatBot = ({ onMetadataUpdate }: ChatBotProps) => {
  const [input, setInput] = useState("");
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { state: sidebarState } = useSidebar();
  const { 
    messages, 
    status, 
    currentResponse, 
    currentMetadata,
    sendMessage,
    regenerateLastResponse,
    clearMessages,
    error,
    clearError,
    setError,
    promptConfig,
    setPromptConfig,
  } = useChatContext();

  // Notify parent when metadata changes
  useEffect(() => {
    if (onMetadataUpdate && currentMetadata) {
      onMetadataUpdate(currentMetadata);
    }
  }, [currentMetadata, onMetadataUpdate]);

  const handleSubmit = useCallback((message: { text?: string }) => {
    const text = message.text || input;
    const cooldown = getChatCooldownSnapshot();
    if (!text.trim() || status !== 'idle' || cooldown.isActive) return;
    
    sendMessage(text);
    setInput("");
  }, [input, sendMessage, status]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleFocusChange = useCallback((nextIsFocused: boolean) => {
    setIsFocused(nextIsFocused);
  }, []);

  // Map our status to PromptInputSubmit's expected format
  const getSubmitStatus = () => {
    switch (status) {
      case 'thinking': return 'submitted';
      case 'generating':
      case 'streaming': return 'streaming';
      default: return undefined;
    }
  };

  const hasMessages = messages.length > 0;
  const submitStatus = getSubmitStatus();

  return (
    <article aria-label="chat-container" className="flex flex-col h-full w-full">
      <div className="relative flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 sm:px-6">
        <Conversation className="flex-1 min-h-0 overflow-hidden">
          <ConversationContent className="h-full align-middle pb-56">
            {/* Empty state - centered welcome */}
            {!hasMessages && status === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                {/* Decorative Background Glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-tr from-orange-500/10 via-amber-500/5 to-transparent rounded-full blur-[100px] pointer-events-none" />
                
                <div className="relative group cursor-default">
                  <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter pb-2">
                    <span className="bg-gradient-to-br from-[#ff6b35] via-[#ff9f43] to-[#ffc107] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,107,53,0.3)]">
                      Milky Way
                    </span>
                  </h1>
                  {/* Floating particles/stars effect behind text could be added here */}
                  <div className="absolute -inset-x-8 -inset-y-4 bg-gradient-to-r from-[#ff6b35]/20 via-[#ffc107]/10 to-[#ff6b35]/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                </div>

                <div className="space-y-3 max-w-md relative z-10 px-4">
                  <h2 className="text-lg sm:text-xl font-medium text-foreground/80 tracking-wide">
                    무엇을 도와드릴까요?
                  </h2>
                  <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
                    당신의 아이디어를 우주처럼 넓게 펼쳐보세요.<br className="hidden sm:block"/>
                    복잡한 문제 해결부터 창의적인 영감까지 함께합니다.
                  </p>
                </div>
              </div>
            )}
            
            {messages.map((message, index) => (
              <div key={message.id}>
                {/* Show reasoning/thought if available */}
                {message.role === "assistant" && message.metadata?.thought && (
                  <Reasoning className="w-full" isStreaming={false}>
                    <ReasoningTrigger />
                    <ReasoningContent>{message.metadata.thought}</ReasoningContent>
                  </Reasoning>
                )}
                
                <Message from={message.role}>
                  <MessageContent>
                    <MessageResponse>{message.content}</MessageResponse>
                  </MessageContent>
                  {message.role === "assistant" && (
                    <ResponseActionContainer 
                      content={message.content}
                      onRegenerate={() => {
                        if (index === messages.length - 1) {
                           regenerateLastResponse();
                        }
                      }}
                    />
                  )}
                </Message>
              </div>
            ))}

            {/* Show status-specific loader */}
            {status === 'thinking' && (
              <Loader variant="thinking" />
            )}

            {status === 'generating' && (
              <Loader variant="generating" />
            )}

            {status === 'streaming' && currentResponse && (
              <Message from="assistant">
                <MessageContent>
                  <MessageResponse>{currentResponse}</MessageResponse>
                </MessageContent>
              </Message>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        {/* Gemini-style input area - fixed at viewport bottom */}
        <div 
          className="fixed bottom-0 right-0 z-40 transition-all duration-200 ease-linear"
          style={{ left: sidebarState === 'expanded' ? '19rem' : '0' }}
        >
          {/* Gradient fade overlay - creates smooth content fading effect */}
          <div className="absolute bottom-full left-0 right-0 h-8 bg-gradient-to-t from-bg-100 via-bg-100/60 to-transparent pointer-events-none" />
          
          <div className="max-w-4xl mx-auto p-4 bg-bg-100">
          <div className="relative">
            {/* Subtle glow effect when focused - around entire container */}
            {isFocused && (
              <div className="absolute -inset-[2px] rounded-[30px] bg-gradient-to-r from-[#ff6b35]/10 via-[#ff8c5a]/5 to-[#ffc107]/10 blur-xl transition-all duration-700" />
            )}
            
            <div className={`
              relative rounded-[28px] transition-all duration-300 ease-out border
              ${isFocused 
                ? "bg-bg-200/95 border-[#ff6b35]/40 shadow-[0_0_15px_-5px_rgba(255,107,53,0.15)]" 
                : "bg-bg-200/70 border-[#ff6b35]/30 shadow-[0_0_10px_-5px_rgba(255,107,53,0.05)] hover:border-[#ff6b35]/40 hover:bg-bg-200/80 hover:shadow-[0_0_15px_-5px_rgba(255,107,53,0.1)]"
              }
            `}>
            
            <PromptInput
              onSubmit={handleSubmit}
              className="bg-transparent rounded-[28px]"
            >
              <PromptInputBody>
                <CooldownTextarea
                  input={input}
                  status={status}
                  onInputChange={handleInputChange}
                  onFocusChange={handleFocusChange}
                  onSubmit={handleSubmit}
                />
              </PromptInputBody>
              
              <PromptInputFooter className="px-4 pb-4 pt-2">
                <PromptInputTools className="gap-1">
                  <PromptInputButton
                    variant="ghost"
                    size="sm"
                    onClick={clearMessages}
                    disabled={messages.length === 0}
                    label="Clear"
                    tooltip="대화 초기화"
                    className="text-muted-foreground/70 hover:text-foreground hover:bg-white/5 rounded-lg px-3 h-8 transition-all duration-200"
                  >
                    <RefreshCcwIcon size={14} />
                    <span className="text-xs">초기화</span>
                  </PromptInputButton>

                  <div className="w-px h-4 bg-white/10 mx-1" />

                  <PromptInputButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsConfigOpen(true)}
                    label="Prompt Settings"
                    tooltip="시스템 설정"
                    className={`text-muted-foreground/70 hover:text-foreground hover:bg-white/5 rounded-lg px-3 h-8 transition-all duration-200 ${
                      promptConfig.systemInstruction || (promptConfig.examples?.length || 0) > 0 
                        ? "text-purple-400/80" 
                        : ""
                    }`}
                  >
                    <Settings2 size={14} />
                    <span className="text-xs">설정</span>
                  </PromptInputButton>

                  {/* Model indicator */}
                  <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-lg bg-white/5 text-muted-foreground/60">
                    <Sparkles size={12} className="text-purple-400/70" />
                    <span className="text-[11px] font-medium">Gemini 2.5</span>
                  </div>
                </PromptInputTools>
                
                <CooldownSubmitArea
                  input={input}
                  status={status}
                  submitStatus={submitStatus}
                  onSetError={setError}
                />
              </PromptInputFooter>
            </PromptInput>
            </div>
          </div>
          
          <CooldownDisclaimer />
        </div>
      </div>
    </div>

      <ErrorModal 
        error={error} 
        onClose={clearError}
        onRetry={() => {
          clearError();
        }}
      />

      <PromptConfigModal 
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        config={promptConfig}
        onSave={(newConfig) => setPromptConfig(newConfig)}
      />
    </article>
  );
};

export default ChatBot;
