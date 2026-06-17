import { Progress } from "@/components/ui/progress";
import { Context, ContextTrigger, ContextContent, ContextContentHeader } from "@/components/ai-elements/context";

interface TokenUsageValue {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  toolUsePromptTokens?: number;
  thoughtsTokens?: number;
  totalTokens?: number;
  requestCount?: number;
}

interface TokenUsageProps {
  usage: TokenUsageValue | null;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  modelId?: string;
}

export function TokenUsage({ usage, maxInputTokens, maxOutputTokens, modelId }: TokenUsageProps) {
  if (!usage) {
    return null;
  }

  const usedTokens = usage.totalTokens ?? usage.inputTokens + usage.outputTokens + (usage.thoughtsTokens || 0);
  const inputPercentage = maxInputTokens ? (usage.inputTokens / maxInputTokens) * 100 : 0;
  const outputPercentage = maxOutputTokens ? (usage.outputTokens / maxOutputTokens) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Input</span>
            <span className="shrink-0 font-mono text-xs">
              {usage.inputTokens.toLocaleString()} / {maxInputTokens?.toLocaleString() || "∞"}
            </span>
          </div>
          <Progress value={Math.min(inputPercentage, 100)} />
        </div>
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>Output</span>
            <span className="shrink-0 font-mono text-xs">
              {usage.outputTokens.toLocaleString()} / {maxOutputTokens?.toLocaleString() || "∞"}
            </span>
          </div>
          <Progress value={Math.min(outputPercentage, 100)} />
        </div>
      </div>

      {modelId && (
        <Context usedTokens={usedTokens} maxTokens={maxInputTokens || 100000} modelId={modelId}>
          <ContextTrigger />
          <ContextContent>
            <ContextContentHeader />
          </ContextContent>
        </Context>
      )}
    </div>
  );
}
