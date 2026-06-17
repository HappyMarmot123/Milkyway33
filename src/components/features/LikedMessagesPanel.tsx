import { useEffect, useState } from "react";
import { Bookmark, ExternalLink, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { chatRepository } from "@/services/chatRepository";
import type { ChatMessage } from "@/features/chat/types";
import { useChatActions } from "@/contexts/ChatContext";
import { useNavigate } from "react-router-dom";

interface LikedMessagesPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LikedMessagesPanel({ open, onOpenChange }: LikedMessagesPanelProps) {
  const [likedMessages, setLikedMessages] = useState<ChatMessage[]>([]);
  const { switchConversation, setMessageLiked } = useChatActions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    chatRepository.getLikedMessages().then(setLikedMessages);
  }, [open]);

  const handleNavigate = (conversationId: string) => {
    switchConversation(conversationId);
    navigate("/chat");
    onOpenChange(false);
  };

  const handleRemove = async (messageId: string) => {
    await setMessageLiked(messageId, null);
    setLikedMessages(prev => prev.filter(message => message.id !== messageId));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[380px] bg-bg-100 border-white/10 flex flex-col p-0"
      >
        <SheetHeader className="px-5 py-4 border-b border-white/10">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Bookmark className="h-4 w-4 text-orange-400" />
            저장된 응답
          </SheetTitle>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground/70">
            은하수가 답변한 결과물이 좋다면 좋아요를 눌러 기억하세요.
            기억된 답변은 대화의 맥락을 형성해 원하는 결과물에 더 가까워지도록 돕습니다.
          </p>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {likedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3">
                <Bookmark className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground/50">
                좋아요를 누른 응답이 없습니다
              </p>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              {likedMessages.map(message => (
                <div
                  key={message.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col gap-2"
                >
                  <p className="text-xs text-foreground/80 line-clamp-4 leading-relaxed">
                    {message.content}
                  </p>
                  <div className="flex items-center justify-between pt-1 border-t border-white/10">
                    <span className="text-[10px] text-muted-foreground/50">
                      {new Date(message.timestamp).toLocaleDateString('ko-KR')}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={() => handleNavigate(message.conversationId)}
                        title="대화로 이동"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-red-400"
                        onClick={() => handleRemove(message.id)}
                        title="저장 취소"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
