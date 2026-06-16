import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  maxTokens?: number;
  modelId?: string;
}

export function TokenUsage({ usage, maxTokens, modelId }: TokenUsageProps) {
  if (!usage) {
    return null;
  }

  const usedTokens = usage.totalTokens ?? usage.inputTokens + usage.outputTokens + (usage.thoughtsTokens || 0);
  const percentage = maxTokens ? (usedTokens / maxTokens) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>토큰 사용량</CardTitle>
        <CardDescription>
          현재 세션의 토큰 사용 현황입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>전체 사용량</span>
            <span className="font-mono">
              {usedTokens.toLocaleString()} / {maxTokens?.toLocaleString() || "∞"}
            </span>
          </div>
          <Progress value={Math.min(percentage, 100)} />
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Input</div>
            <div className="font-mono">{usage.inputTokens?.toLocaleString() || 0}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Output</div>
            <div className="font-mono">{usage.outputTokens?.toLocaleString() || 0}</div>
          </div>
          {(usage.thoughtsTokens || 0) > 0 && (
            <div>
              <div className="text-muted-foreground">Thinking</div>
              <div className="font-mono">{usage.thoughtsTokens?.toLocaleString() || 0}</div>
            </div>
          )}
          {(usage.cachedTokens || 0) > 0 && (
            <div>
              <div className="text-muted-foreground">Cached</div>
              <div className="font-mono">{usage.cachedTokens?.toLocaleString() || 0}</div>
            </div>
          )}
          {(usage.requestCount || 0) > 0 && (
            <div>
              <div className="text-muted-foreground">Requests</div>
              <div className="font-mono">{usage.requestCount?.toLocaleString() || 0}</div>
            </div>
          )}
        </div>

        {modelId && (
          <Context usedTokens={usedTokens} maxTokens={maxTokens || 100000} modelId={modelId}>
            <ContextTrigger />
            <ContextContent>
              <ContextContentHeader />
            </ContextContent>
          </Context>
        )}
      </CardContent>
    </Card>
  );
}
