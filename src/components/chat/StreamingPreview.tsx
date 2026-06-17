import { memo } from "react";
import { Loader } from "@/components/ai-elements/loader";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import { useChatRuntime, useChatStreaming } from "@/contexts/ChatContext";

const StreamingPreview = memo(() => {
  const { status } = useChatRuntime();
  const { currentResponse } = useChatStreaming();

  return (
    <>
      {status === "thinking" && <Loader variant="thinking" />}
      {status === "generating" && <Loader variant="generating" />}
      {status === "streaming" && currentResponse && (
        <Message from="assistant">
          <MessageContent>
            <MessageResponse>{currentResponse}</MessageResponse>
          </MessageContent>
        </Message>
      )}
    </>
  );
});

StreamingPreview.displayName = "StreamingPreview";

export { StreamingPreview };
