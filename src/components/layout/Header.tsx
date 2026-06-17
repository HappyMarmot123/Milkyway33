import { memo } from "react";
import { useLocation } from "react-router-dom";
import { useChatRuntime } from "@/contexts/ChatContext";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Sparkles, Settings, MessageCircle } from "lucide-react";

const PAGE_CONFIG: Record<string, { title: string; icon: React.ReactNode }> = {
  "/chat": { title: "대화", icon: <MessageCircle className="h-5 w-5" /> },
  "/settings": { title: "설정", icon: <Settings className="h-5 w-5" /> },
};

const STATUS_CONFIG: Record<string, { label: string; gradient: string; pulse: boolean }> = {
  thinking: {
    label: "생각하는 중...",
    gradient: "from-purple-500 via-pink-500 to-indigo-500",
    pulse: true,
  },
  generating: {
    label: "생성 중...",
    gradient: "from-blue-500 via-cyan-400 to-teal-500",
    pulse: true,
  },
  streaming: {
    label: "응답 중...",
    gradient: "from-green-400 via-emerald-500 to-teal-500",
    pulse: true,
  },
  idle: {
    label: "준비됨",
    gradient: "from-gray-400 to-gray-500",
    pulse: false,
  },
};

// Animated status indicator with Gemini-style gradient
const StatusIndicator = memo(({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  
  return (
    <div className="flex items-center gap-2">
      {/* Animated gradient dot */}
      <div className="relative flex items-center justify-center">
        <div 
          className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${config.gradient} ${
            config.pulse ? "animate-pulse" : ""
          }`}
        />
        {config.pulse && (
          <div 
            className={`absolute h-4 w-4 rounded-full bg-gradient-to-r ${config.gradient} opacity-30 animate-ping`}
          />
        )}
      </div>
      <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
        {config.label}
      </span>
    </div>
  );
});

StatusIndicator.displayName = "StatusIndicator";

export function Header() {
  const location = useLocation();
  const { status } = useChatRuntime();
  const { isMobile, open, openMobile } = useSidebar();
  const pageConfig = PAGE_CONFIG[location.pathname] || { title: "LLM Chat", icon: <Sparkles className="h-5 w-5" /> };
  const isSidebarOpen = isMobile ? openMobile : open;

  return (
    <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-4 px-4 sm:px-6 bg-gradient-to-r from-bg-100/80 via-bg-100/60 to-bg-100/80 backdrop-blur-xl border-b border-white/5">
      {/* Subtle animated gradient line at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      {/* Left: Page title with icon */}
      <div className="flex items-center gap-3">
        {!isSidebarOpen && (
          <SidebarTrigger className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-foreground/80 shadow-sm transition-all duration-200 hover:bg-white/10 hover:text-foreground" />
        )}
        <h1 className="font-semibold text-foreground/90 leading-tight">
          {pageConfig.title}
        </h1>
      </div>

      {/* Right: Status indicator */}
      <div className="flex items-center gap-3">
        {location.pathname === "/chat" && (
          <StatusIndicator status={status} />
        )}
      </div>
    </header>
  );
}
