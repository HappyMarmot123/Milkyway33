import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge, RefreshCcwIcon, Settings2, Sparkles, TimerReset } from "lucide-react";
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
  getChatCooldownSnapshot,
  useChatCooldown,
} from "@/features/chat/cooldownStore";
import { useChatDailyUsage } from "@/features/chat/dailyUsageStore";
import {
  useChatActions,
  useChatConfig,
  useChatHasMessages,
  useChatRuntime,
} from "@/contexts/ChatContext";
import type { ChatState } from "@/features/chat/types";

type ChatStatus = ChatState["status"];
type SubmitStatus = "submitted" | "streaming" | undefined;
type ChatCooldown = ReturnType<typeof useChatCooldown>;

interface ChatComposerProps {
  sidebarState: "expanded" | "collapsed";
  onOpenConfig: () => void;
}

interface CooldownTextareaProps {
  cooldown: ChatCooldown;
  input: string;
  status: ChatStatus;
  onInputChange: (value: string) => void;
  onFocusChange: (isFocused: boolean) => void;
  onSubmit: (message: { text?: string }) => void;
}

const CooldownTextarea = memo(({
  cooldown,
  input,
  status,
  onInputChange,
  onFocusChange,
  onSubmit,
}: CooldownTextareaProps) => {
  const cooldownLabel = `${cooldown.remainingSeconds}초`;

  return (
    <PromptInputTextarea
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onInputChange(e.target.value)}
      value={input}
      placeholder={cooldown.isActive ? `${cooldownLabel} 후 다시 요청할 수 있습니다` : "메시지를 입력하세요..."}
      disabled={cooldown.isActive || status !== "idle"}
      onFocus={() => onFocusChange(true)}
      onBlur={() => onFocusChange(false)}
      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onSubmit({ text: input });
        }
      }}
    />
  );
});

CooldownTextarea.displayName = "CooldownTextarea";

interface CooldownSubmitAreaProps {
  cooldown: ChatCooldown;
  input: string;
  status: ChatStatus;
  submitStatus: SubmitStatus;
}

const CooldownSubmitArea = memo(({ cooldown, input, status, submitStatus }: CooldownSubmitAreaProps) => {
  const cooldownLabel = `${cooldown.remainingSeconds}초`;
  const dailyUsage = useChatDailyUsage();
  const isDailyUsageLoading = dailyUsage.remaining === null;
  const isDailyLimitReached = dailyUsage.remaining !== null && dailyUsage.remaining <= 0;
  const canSubmit = Boolean(input.trim()) && !cooldown.isActive && !isDailyLimitReached && status === "idle";
  const usedCount = dailyUsage.remaining === null ? null : dailyUsage.limit - dailyUsage.remaining;

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
        isDailyLimitReached
          ? "border-red-500/20 bg-red-500/10 text-red-200"
          : isDailyUsageLoading
            ? "border-white/10 bg-white/5 text-muted-foreground"
            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
      }`}>
        <Gauge
          size={12}
          className={isDailyLimitReached ? "text-red-300" : isDailyUsageLoading ? "text-muted-foreground" : "text-emerald-300"}
        />
        <span>{usedCount === null ? `오늘 .../${dailyUsage.limit}` : `오늘 ${usedCount}/${dailyUsage.limit}`}</span>
      </div>

      {cooldown.isActive && (
        <div className="flex items-center gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium text-orange-200">
          <TimerReset size={12} className="text-orange-300" />
          <span>{cooldownLabel}</span>
        </div>
      )}

      <PromptInputSubmit
        disabled={!canSubmit}
        status={submitStatus}
        className={`
          rounded-xl h-9 w-9 transition-all duration-300
          ${canSubmit ? "text-white" : "bg-white/10 text-muted-foreground/50"}
        `}
      />
    </div>
  );
});

CooldownSubmitArea.displayName = "CooldownSubmitArea";

const CooldownDisclaimer = memo(() => {
  return (
    <p className="text-[10px] sm:text-[11px] text-muted-foreground text-center mt-3">
      Milkyway-33 / Made by @HappyMarmot123
    </p>
  );
});

CooldownDisclaimer.displayName = "CooldownDisclaimer";

interface ComposerInputControlsProps {
  cooldown: ChatCooldown;
  onFocusChange: (isFocused: boolean) => void;
  onOpenConfig: () => void;
}

const ComposerInputControls = memo(({
  cooldown,
  onFocusChange,
  onOpenConfig,
}: ComposerInputControlsProps) => {
  const [input, setInput] = useState("");
  const inputRef = useRef(input);
  const { status } = useChatRuntime();
  const { sendMessage } = useChatActions();

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const handleSubmit = useCallback((message: { text?: string }) => {
    const text = message.text || inputRef.current;
    const cooldown = getChatCooldownSnapshot();
    if (!text.trim() || status !== "idle" || cooldown.isActive) return;

    sendMessage(text);
    setInput("");
  }, [sendMessage, status]);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const submitStatus = useMemo<SubmitStatus>(() => {
    switch (status) {
      case "thinking":
        return "submitted";
      case "generating":
      case "streaming":
        return "streaming";
      default:
        return undefined;
    }
  }, [status]);

  return (
    <PromptInput
      onSubmit={handleSubmit}
      className="bg-transparent rounded-[28px]"
    >
      <PromptInputBody>
        <CooldownTextarea
          cooldown={cooldown}
          input={input}
          status={status}
          onInputChange={handleInputChange}
          onFocusChange={onFocusChange}
          onSubmit={handleSubmit}
        />
      </PromptInputBody>

      <PromptInputFooter className="px-4 pb-4 pt-2">
        <ComposerTools onOpenConfig={onOpenConfig} />

        <CooldownSubmitArea
          cooldown={cooldown}
          input={input}
          status={status}
          submitStatus={submitStatus}
        />
      </PromptInputFooter>
    </PromptInput>
  );
});

ComposerInputControls.displayName = "ComposerInputControls";

interface ComposerToolsProps {
  onOpenConfig: () => void;
}

const ComposerTools = memo(({ onOpenConfig }: ComposerToolsProps) => {
  const { hasMessages } = useChatHasMessages();
  const { clearMessages } = useChatActions();
  const { promptConfig } = useChatConfig();

  const hasPromptConfig =
    Boolean(promptConfig.systemInstruction) || (promptConfig.examples?.length || 0) > 0;

  return (
    <PromptInputTools className="gap-1">
      <PromptInputButton
        variant="ghost"
        size="sm"
        onClick={clearMessages}
        disabled={!hasMessages}
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
        onClick={onOpenConfig}
        label="Prompt Settings"
        tooltip="시스템 설정"
        className={`text-muted-foreground/70 hover:text-foreground hover:bg-white/5 rounded-lg px-3 h-8 transition-all duration-200 ${
          hasPromptConfig ? "text-purple-400/80" : ""
        }`}
      >
        <Settings2 size={14} />
        <span className="text-xs">설정</span>
      </PromptInputButton>

      <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-lg bg-white/5 text-muted-foreground/60">
        <Sparkles size={12} className="text-purple-400/70" />
        <span className="text-[11px] font-medium">Gemini 2.5</span>
      </div>
    </PromptInputTools>
  );
});

ComposerTools.displayName = "ComposerTools";

const ChatComposer = memo(({ sidebarState, onOpenConfig }: ChatComposerProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const cooldown = useChatCooldown();

  const wrapperStyle = useMemo(
    () => ({ left: sidebarState === "expanded" ? "19rem" : "0" }),
    [sidebarState],
  );

  return (
    <div
      className="fixed bottom-0 right-0 z-40 transition-all duration-200 ease-linear"
      style={wrapperStyle}
    >
      <div className="absolute bottom-full left-0 right-0 h-8 bg-gradient-to-t from-bg-100 via-bg-100/60 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto p-4 bg-bg-100">
        <div className="relative">
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
            <ComposerInputControls
              cooldown={cooldown}
              onFocusChange={setIsFocused}
              onOpenConfig={onOpenConfig}
            />
          </div>
        </div>

        <CooldownDisclaimer />
      </div>
    </div>
  );
});

ChatComposer.displayName = "ChatComposer";

export { ChatComposer };
