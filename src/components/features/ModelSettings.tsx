import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap } from "lucide-react";

export interface ModelSettingsValue {
  stream: boolean;
}

interface ModelSettingsProps {
  model?: string;
  settings?: ModelSettingsValue;
  onChange?: (settings: ModelSettingsValue) => void;
}

export function ModelSettings({ settings, onChange }: ModelSettingsProps) {
  const [localSettings, setLocalSettings] = useState<ModelSettingsValue>(
    settings ?? { stream: true }
  );

  const handleStreamChange = (value: boolean) => {
    const newSettings = { ...localSettings, stream: value };
    setLocalSettings(newSettings);
    onChange?.(newSettings);
  };

  return (
    <div className="space-y-6">
      <Card className="min-w-0 bg-gradient-to-br from-bg-200/50 to-bg-100/50 backdrop-blur-xl border-white/10">
        <CardHeader className="pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gradient-to-br from-green-500/20 to-teal-500/10">
              <Zap className="h-5 w-5 text-green-400" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg">응답 설정</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                AI 응답 방식을 설정합니다
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">스트리밍</Label>
              <p className="text-xs text-muted-foreground">
                응답을 실시간으로 스트리밍합니다
              </p>
            </div>
            <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleStreamChange(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  localSettings.stream
                    ? "bg-green-500/20 text-green-400 border border-green-500/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ON
              </button>
              <button
                type="button"
                onClick={() => handleStreamChange(false)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                  !localSettings.stream
                    ? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30 shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                OFF
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
