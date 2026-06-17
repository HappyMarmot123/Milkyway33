import { memo, useCallback } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { ResponseActionContainer } from "@/components/features/ResponseActionContainer";
import type { ChatMessage } from "@/features/chat/types";

interface ChatMessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  onRegenerate: () => void;
}

const ChatMessageItem = memo(({ message, isLast, onRegenerate }: ChatMessageItemProps) => {
  const handleRegenerate = useCallback(() => {
    if (isLast) {
      onRegenerate();
    }
  }, [isLast, onRegenerate]);

  return (
    <div>
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
            onRegenerate={handleRegenerate}
          />
        )}
      </Message>
    </div>
  );
});

ChatMessageItem.displayName = "ChatMessageItem";

export { ChatMessageItem };
