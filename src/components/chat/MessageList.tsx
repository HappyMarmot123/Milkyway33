import { memo } from "react";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";
import { useChatActions, useChatMessages } from "@/contexts/ChatContext";

const MessageList = memo(() => {
  const { messages } = useChatMessages();
  const { regenerateLastResponse } = useChatActions();
  const lastIndex = messages.length - 1;

  return (
    <>
      {messages.map((message, index) => (
        <ChatMessageItem
          key={message.id}
          message={message}
          isLast={index === lastIndex}
          onRegenerate={regenerateLastResponse}
        />
      ))}
    </>
  );
});

MessageList.displayName = "MessageList";

export { MessageList };
