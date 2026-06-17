import { useCallback, useEffect, useState } from "react";
import { ModelSettings } from "@/components/features/ModelSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenUsage } from "@/components/features/TokenUsage";
import { chatRepository } from "@/services/chatRepository";
import { Button } from "@/components/ui/button";
import { RefreshCcw, Sparkles, Zap, Settings, ChevronRight, Cpu } from "lucide-react";
import type { TokenUsageEntity } from "@/lib/db";

const ModelOption = ({
  name,
  description,
  isSelected,
  onSelect,
}: {
  name: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
}) => (
  <button
    onClick={onSelect}
    className={`
      w-full p-4 rounded-xl text-left transition-all duration-300
      border ${isSelected
        ? "border-purple-500/50 bg-gradient-to-br from-purple-500/10 to-pink-500/5 shadow-lg shadow-purple-500/10"
        : "border-white/10 bg-white/5 hover:bg-white/[0.07] hover:border-white/20"
      }
    `}
  >
    <div className="flex items-center gap-3">
      <div className={`
        flex items-center justify-center h-10 w-10 rounded-lg transition-colors duration-300
        ${isSelected
          ? "bg-gradient-to-br from-purple-500 to-pink-500"
          : "bg-white/10"
        }
      `}>
        <Cpu className={`h-5 w-5 ${isSelected ? "text-white" : "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isSelected ? "text-foreground" : "text-foreground/80"}`}>
            {name}
          </span>
          {isSelected && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium">
              선택됨
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight className={`h-4 w-4 transition-transform duration-300 ${
        isSelected ? "text-purple-400 translate-x-0" : "text-muted-foreground/40 -translate-x-1"
      }`} />
    </div>
  </button>
);

const MODELS = [
  { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: "빠르고 효율적인 기본 모델" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "균형 잡힌 성능과 속도" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "최고 성능의 프리미엄 모델" },
];

interface SettingsPanelProps {
  showHeader?: boolean;
}

export function SettingsPanel({ showHeader = true }: SettingsPanelProps) {
  const [model, setModel] = useState("gemini-2.5-flash-lite");
  const [settings, setSettings] = useState({
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stream: true,
  });

  const [tokenUsage, setTokenUsage] = useState({ inputTokens: 0, outputTokens: 0 });
  const [modelUsage, setModelUsage] = useState<TokenUsageEntity[]>([]);
  const [isResetting, setIsResetting] = useState(false);

  const loadTokenUsage = useCallback(async () => {
    const [usage, usageByModel] = await Promise.all([
      chatRepository.getTotalTokenUsage(),
      chatRepository.getTokenUsageByModel(),
    ]);
    setTokenUsage(usage);
    setModelUsage(usageByModel);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTokenUsage();
    });
  }, [loadTokenUsage]);

  const handleResetTokenUsage = async () => {
    setIsResetting(true);
    await chatRepository.resetTokenUsage();
    setTokenUsage({ inputTokens: 0, outputTokens: 0 });
    setModelUsage([]);
    setTimeout(() => setIsResetting(false), 500);
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {showHeader && (
        <header aria-label="page-header" className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-500/20">
              <Settings className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                설정
              </h1>
              <p className="text-sm text-muted-foreground">
                AI 모델과 애플리케이션 환경설정을 관리하세요
              </p>
            </div>
          </div>
        </header>
      )}

      <section aria-label="token-usage-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="min-w-0 overflow-hidden bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/10">
                  <Zap className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg">토큰 사용량</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    전체 대화에서 사용된 토큰 통계
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetTokenUsage}
                disabled={isResetting}
                className="gap-2 bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
              >
                <RefreshCcw className={`h-4 w-4 ${isResetting ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">초기화</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <TokenUsage
              usage={tokenUsage}
              maxTokens={1000000}
              modelId={model}
            />
            {modelUsage.length > 0 && (
              <div className="mt-4 overflow-x-auto overflow-y-hidden rounded-lg border border-white/10">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-white/5 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">모델</th>
                      <th className="px-3 py-2 text-right font-medium">요청</th>
                      <th className="px-3 py-2 text-right font-medium">토큰</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelUsage.map((usage) => (
                      <tr key={usage.id} className="border-t border-white/10">
                        <td className="max-w-0 break-all px-3 py-2 font-mono text-xs">{usage.modelId}</td>
                        <td className="px-3 py-2 text-right font-mono">{usage.requestCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-mono">{usage.totalTokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-label="model-settings-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10">
                <Sparkles className="h-5 w-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">AI 모델</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  사용할 Gemini 모델을 선택하세요
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {MODELS.map((m) => (
                <ModelOption
                  key={m.id}
                  name={m.name}
                  description={m.description}
                  isSelected={model === m.id}
                  onSelect={() => setModel(m.id)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section aria-label="advanced-settings-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        <ModelSettings
          model={model}
          settings={settings}
          onChange={setSettings}
        />
      </section>
    </div>
  );
}
