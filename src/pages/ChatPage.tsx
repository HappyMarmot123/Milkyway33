import { memo, useCallback, useState } from "react";
import ChatBot from "@/components/ChatBot";
import { TokenUsage } from "@/components/features/TokenUsage";
import { Button } from "@/components/ui/button";
import { ChevronUp, Sparkles, Zap, Clock } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { ChatMetadata } from "@/features/chat/types";

// Floating metadata panel component
const MetadataPanel = memo(({ 
  metadata, 
  isExpanded, 
  onToggle 
}: { 
  metadata: ChatMetadata | null;
  isExpanded: boolean;
  onToggle: () => void;
}) => {
  if (!metadata) return null;
  const modelUsed = metadata.model_used ?? "Unknown";

  const tokenUsage = metadata.usage_metadata ? {
    inputTokens: metadata.usage_metadata.prompt_token_count || 0,
    outputTokens: metadata.usage_metadata.candidates_token_count || 0,
    cachedTokens: metadata.usage_metadata.cached_content_token_count || 0,
    toolUsePromptTokens: metadata.usage_metadata.tool_use_prompt_token_count || 0,
    thoughtsTokens: metadata.usage_metadata.thoughts_token_count || 0,
    totalTokens: metadata.usage_metadata.total_token_count || 0,
    requestCount: 1,
  } : null;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-10">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        {/* Collapsed state - minimal floating bar */}
        <div className="bg-gradient-to-r from-bg-100/95 via-bg-100/90 to-bg-100/95 backdrop-blur-xl border-t border-orange-500/10 shadow-[0_-1px_10px_-2px_rgba(255,107,53,0.05)]">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full h-10 justify-center gap-3 hover:bg-white/5 transition-all duration-300 group"
            >
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {/* Model badge */}
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-orange-400" />
                  <span className="font-medium">{modelUsed}</span>
                </div>
                
                {/* Token count */}
                {metadata.usage_metadata?.total_token_count && (
                  <div className="flex items-center gap-1.5 text-muted-foreground/70">
                    <Zap className="h-3 w-3 text-yellow-400/70" />
                    <span>{metadata.usage_metadata.total_token_count.toLocaleString()} 토큰</span>
                  </div>
                )}

                {/* Status */}
                {metadata.finish_reason && (
                  <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground/70">
                    <Clock className="h-3 w-3 text-green-400/70" />
                    <span>{metadata.finish_reason}</span>
                  </div>
                )}
              </div>
              
              <ChevronUp className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-300 ${
                isExpanded ? "rotate-180" : ""
              }`} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Expanded state - detailed info */}
        <CollapsibleContent>
          <div className="bg-gradient-to-b from-bg-100/95 to-bg-200/95 backdrop-blur-xl border-t border-white/5 p-4 sm:p-6">
            <div className="max-w-2xl mx-auto">
              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <StatCard 
                  icon={<Sparkles className="h-4 w-4 text-orange-400" />}
                  label="모델"
                  value={modelUsed}
                />
                <StatCard 
                  icon={<Zap className="h-4 w-4 text-amber-400" />}
                  label="입력 토큰"
                  value={tokenUsage?.inputTokens.toLocaleString() || "0"}
                />
                <StatCard 
                  icon={<Zap className="h-4 w-4 text-orange-300" />}
                  label="출력 토큰"
                  value={tokenUsage?.outputTokens.toLocaleString() || "0"}
                />
                <StatCard 
                  icon={<Clock className="h-4 w-4 text-green-400" />}
                  label="상태"
                  value={metadata.finish_reason || "완료"}
                />
              </div>

              {/* Token usage bar */}
              {tokenUsage && (
                <TokenUsage
                  usage={tokenUsage}
                  maxTokens={1000000}
                  modelId="gemini-2.5-flash-lite"
                />
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

MetadataPanel.displayName = "MetadataPanel";

// Stat card component for the expanded panel
const StatCard = memo(({ 
  icon, 
  label, 
  value 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string 
}) => (
  <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors duration-200">
    <div className="flex items-center gap-2 text-muted-foreground/70">
      {icon}
      <span className="text-[10px] sm:text-xs uppercase tracking-wider">{label}</span>
    </div>
    <span className="text-sm sm:text-base font-semibold text-foreground/90 truncate">{value}</span>
  </div>
));

StatCard.displayName = "StatCard";

export function ChatPage() {
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [lastMetadata, setLastMetadata] = useState<ChatMetadata | null>(null);

  const handleMetadataUpdate = useCallback((metadata: ChatMetadata) => {
    setLastMetadata(metadata);
  }, []);

  const handleToggleInfo = useCallback(() => {
    setIsInfoExpanded((value) => !value);
  }, []);

  return (
    <main aria-label="chat-page" className="relative flex flex-col h-full">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-bg-0 via-bg-100/50 to-bg-100" />
      </div>
      
      {/* Chat interface */}
      <section 
        aria-label="chat-interface" 
        className={`relative flex-1 overflow-hidden transition-all duration-300 border-x border-white/5 shadow-[inset_0_0_20px_-10px_rgba(255,107,53,0.05)] ${
          lastMetadata ? "pb-10" : ""
        }`}
      >
        <ChatBot onMetadataUpdate={handleMetadataUpdate} />
      </section>

      {/* Floating metadata panel */}
      <MetadataPanel 
        metadata={lastMetadata}
        isExpanded={isInfoExpanded}
        onToggle={handleToggleInfo}
      />
    </main>
  );
}
