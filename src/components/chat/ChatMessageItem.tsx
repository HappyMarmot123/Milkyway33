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
import { useChatActions } from "@/contexts/ChatContext";

interface ChatMessageItemProps {
  message: ChatMessage;
}

const ChatMessageItem = memo(({ message }: ChatMessageItemProps) => {
  const { setMessageLiked } = useChatActions();

  const handleFeedback = useCallback((type: 'up' | null) => {
    if (message.role !== 'assistant') return;
    setMessageLiked(message.id, type === 'up' ? true : null);
  }, [message.id, message.role, setMessageLiked]);

  const feedbackState = message.liked === true ? 'up' : null;

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
            onFeedback={handleFeedback}
            feedbackState={feedbackState}
          />
        )}
      </Message>
    </div>
  );
});

ChatMessageItem.displayName = "ChatMessageItem";

export { ChatMessageItem };
