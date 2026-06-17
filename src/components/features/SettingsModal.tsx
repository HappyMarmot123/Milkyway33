import { SettingsPanel } from "@/components/features/SettingsPanel";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, X } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] w-[calc(100vw-2rem)] max-w-4xl overflow-hidden border-white/10 bg-bg-100/95 p-0 backdrop-blur-xl [&>button.absolute]:hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>
            AI 모델과 애플리케이션 환경설정을 관리합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-bg-100/95 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
              <Settings className="h-4 w-4 text-purple-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">설정</h2>
              <p className="truncate text-xs text-muted-foreground">
                AI 모델과 애플리케이션 환경설정
              </p>
            </div>
          </div>

          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="설정 닫기"
              className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        <div className="max-h-[calc(88vh-4.25rem)] overflow-x-hidden overflow-y-auto p-4 sm:p-6">
          <SettingsPanel showHeader={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
