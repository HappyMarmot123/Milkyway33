import { useCallback, useEffect, useState } from "react";
import { ModelSettings } from "@/components/features/ModelSettings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TokenUsage } from "@/components/features/TokenUsage";
import { PromptTemplateSection } from "@/components/features/PromptTemplateSection";
import { fetchChatModelInfo, fetchSharedTokenUsage, type ChatModelInfo, type SharedTokenUsage } from "@/api/chat";
import { AlertTriangle, Sparkles, Zap, Cpu, Users } from "lucide-react";
import { useChatActions } from "@/contexts/ChatContext";
import { Button } from "@/components/ui/button";

const DEFAULT_INPUT_TOKEN_LIMIT = 1_000_000;
const DEFAULT_OUTPUT_TOKEN_LIMIT = 65_000;

interface SettingsPanelProps {
  showHeader?: boolean;
}

export function SettingsPanel({ showHeader = true }: SettingsPanelProps) {
  const [settings, setSettings] = useState({ stream: true });
  const [tokenUsage, setTokenUsage] = useState<SharedTokenUsage | null>(null);
  const [modelInfo, setModelInfo] = useState<ChatModelInfo | null>(null);
  const { setError } = useChatActions();

  const loadTokenUsage = useCallback(async () => {
    const usage = await fetchSharedTokenUsage();
    setTokenUsage(usage);
  }, []);

  useEffect(() => {
    void loadTokenUsage();
    const timer = setInterval(() => void loadTokenUsage(), 30_000);
    return () => clearInterval(timer);
  }, [loadTokenUsage]);

  useEffect(() => {
    void fetchChatModelInfo()
      .then(setModelInfo)
      .catch(() => setModelInfo(null));
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      {showHeader && (
        <header aria-label="page-header" className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                설정2
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
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-yellow-500/20 to-orange-500/10">
                <Zap className="h-5 w-5 text-yellow-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base sm:text-lg">토큰 사용량</CardTitle>
                  <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20 font-medium shrink-0">
                    <Users className="h-2.5 w-2.5" />
                    실시간 공유
                  </span>
                </div>
                <CardDescription className="text-xs sm:text-sm">
                  전체 사용자의 누적 토큰 통계
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TokenUsage
              usage={tokenUsage}
              maxInputTokens={modelInfo?.inputTokenLimit || DEFAULT_INPUT_TOKEN_LIMIT}
              maxOutputTokens={modelInfo?.outputTokenLimit || DEFAULT_OUTPUT_TOKEN_LIMIT}
            />
          </CardContent>
        </Card>
      </section>

      <PromptTemplateSection />

      <section aria-label="model-info-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
        <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10">
                <Sparkles className="h-5 w-5 text-purple-400" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">AI 모델</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  현재 사용 중인 모델
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/5 p-4">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0">
                <Cpu className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Gemini 2.5 Flash</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-medium shrink-0">
                    사용 중
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">빠르고 효율적인 기본 모델</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

	  <section aria-label="advanced-settings-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
        <ModelSettings
          settings={settings}
          onChange={setSettings}
        />
      </section>

	  <section aria-label="debug-error-section" className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
        <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
          <CardHeader className="pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-red-500/20 to-orange-500/10">
                <AlertTriangle className="h-5 w-5 text-red-300" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">오류 테스트</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  오류 모달과 복구 흐름을 확인합니다
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setError("429 RESOURCE_EXHAUSTED: Quota exceeded test")}
                className="border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
              >
                429 테스트
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setError("500 INTERNAL_SERVER_ERROR test")}
                className="border-orange-500/30 bg-orange-500/10 text-orange-200 hover:bg-orange-500/20 hover:text-orange-100"
              >
                500 테스트
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
