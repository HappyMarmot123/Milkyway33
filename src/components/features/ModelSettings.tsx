import { useState } from "react";
import type { ChangeEvent } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export interface ModelSettingsValue {
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  stream: boolean;
}

interface ModelSettingsProps {
  model?: string;
  settings?: ModelSettingsValue;
  onChange?: (settings: ModelSettingsValue) => void;
}

export function ModelSettings({ model, settings, onChange }: ModelSettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings || {
    temperature: 0.7,
    maxTokens: 2000,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stream: true,
  });

  const handleChange = <K extends keyof ModelSettingsValue>(
    key: K,
    value: ModelSettingsValue[K]
  ) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onChange?.(newSettings);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>모델 파라미터</CardTitle>
          <CardDescription>
            {model || "GPT-4"} 모델의 설정을 조정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="temperature">Temperature</Label>
              <span className="text-sm text-muted-foreground">
                {localSettings.temperature}
              </span>
            </div>
            <Slider
              id="temperature"
              min={0}
              max={2}
              step={0.1}
              value={[localSettings.temperature]}
              onValueChange={([value]: number[]) => handleChange("temperature", value)}
            />
            <p className="text-xs text-muted-foreground">
              낮을수록 더 결정적이고 일관된 응답을 생성합니다.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              min={1}
              max={8000}
              value={localSettings.maxTokens}
              onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange("maxTokens", parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              생성할 최대 토큰 수입니다.
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="topP">Top P</Label>
              <span className="text-sm text-muted-foreground">
                {localSettings.topP}
              </span>
            </div>
            <Slider
              id="topP"
              min={0}
              max={1}
              step={0.01}
              value={[localSettings.topP]}
              onValueChange={([value]: number[]) => handleChange("topP", value)}
            />
            <p className="text-xs text-muted-foreground">
              핵샘플링 파라미터입니다.
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="stream">스트리밍</Label>
              <p className="text-xs text-muted-foreground">
                응답을 실시간으로 스트리밍합니다.
              </p>
            </div>
            <Switch
              id="stream"
              checked={localSettings.stream}
              onCheckedChange={(checked: boolean) => handleChange("stream", checked)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
