import { memo, useCallback, useState } from "react";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ErrorModal } from "@/components/features/ErrorModal";
import { PromptConfigModal } from "@/components/features/PromptConfigModal";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { MessageList } from "@/components/chat/MessageList";
import { StreamingPreview } from "@/components/chat/StreamingPreview";
import {
  useChatActions,
  useChatConfig,
  useChatHasMessages,
  useChatRuntime,
} from "@/contexts/ChatContext";
import type { ChatPromptConfig } from "@/features/chat/types";

const ChatBot = memo(() => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const { state: sidebarState } = useSidebar();
  const { hasMessages } = useChatHasMessages();
  const { status, error } = useChatRuntime();
  const { clearError, setPromptConfig } = useChatActions();
  const { promptConfig } = useChatConfig();


  const handleOpenConfig = useCallback(() => {
    setIsConfigOpen(true);
  }, []);

  const handleCloseConfig = useCallback(() => {
    setIsConfigOpen(false);
  }, []);

  const handleRetryError = useCallback(() => {
    clearError();
  }, [clearError]);

  const handleSaveConfig = useCallback((newConfig: Partial<ChatPromptConfig>) => {
    setPromptConfig(newConfig);
  }, [setPromptConfig]);

  return (
    <article aria-label="chat-container" className="flex flex-col h-full w-full">
      <div className="relative flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 sm:px-6">
        <Conversation className="flex-1 min-h-0 overflow-hidden">
          <ConversationContent className="h-full align-middle pb-56">
            {!hasMessages && status === "idle" && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-gradient-to-tr from-orange-500/10 via-amber-500/5 to-transparent rounded-full blur-[100px] pointer-events-none" />

                <div className="relative group cursor-default">
                  <h1 className="text-5xl sm:text-7xl font-bold tracking-tighter pb-2">
                    <span className="bg-gradient-to-br from-[#ff6b35] via-[#ff9f43] to-[#ffc107] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(255,107,53,0.3)]">
                      Milky Way
                    </span>
                  </h1>
                  <div className="absolute -inset-x-8 -inset-y-4 bg-gradient-to-r from-[#ff6b35]/20 via-[#ffc107]/10 to-[#ff6b35]/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                </div>

                <div className="space-y-3 max-w-md relative z-10 px-4">
                  <h2 className="text-lg sm:text-xl font-medium text-foreground/80 tracking-wide">
                    무엇을 도와드릴까요?
                  </h2>
                  <p className="text-sm text-muted-foreground/60 leading-relaxed font-light">
                    당신의 아이디어를 우주처럼 넓게 펼쳐보세요.<br className="hidden sm:block" />
                    복잡한 문제 해결부터 창의적인 영감까지 함께합니다.
                  </p>
                </div>
              </div>
            )}

            <MessageList />
            <StreamingPreview />
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <ChatComposer
          sidebarState={sidebarState}
          onOpenConfig={handleOpenConfig}
        />
      </div>

      <ErrorModal
        error={error}
        onClose={clearError}
        onRetry={handleRetryError}
      />

      <PromptConfigModal
        isOpen={isConfigOpen}
        onClose={handleCloseConfig}
        config={promptConfig}
        onSave={handleSaveConfig}
      />
    </article>
  );
});

ChatBot.displayName = "ChatBot";

export default ChatBot;
