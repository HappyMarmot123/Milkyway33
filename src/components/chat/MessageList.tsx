import { memo } from "react";
import { ChatMessageItem } from "@/components/chat/ChatMessageItem";
import { useChatMessages } from "@/contexts/ChatContext";

const MessageList = memo(() => {
  const { messages } = useChatMessages();

  return (
    <>
      {messages.map((message) => (
        <ChatMessageItem
          key={message.id}
          message={message}
        />
      ))}
    </>
  );
});

MessageList.displayName = "MessageList";

export { MessageList };
