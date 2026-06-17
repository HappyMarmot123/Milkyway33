
import { useState } from "react";
import type { ComponentType } from "react";
import { 
  ThumbsUp, 
  Copy, 
  MoreVertical, 
  Check,
  Volume2,
  FileText
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ResponseActionContainerProps {
  content: string;
  onFeedback?: (type: 'up' | null) => void;
  feedbackState?: 'up' | null;
  className?: string;
}

function ActionButton({ 
  icon: Icon, 
  label, 
  onClick, 
  isActive = false 
}: { 
  icon: ComponentType<{ className?: string; strokeWidth?: number }>; 
  label: string; 
  onClick: () => void; 
  isActive?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={`p-1 !bg-transparent ${
              isActive 
                ? "text-blue-400" 
                : "text-zinc-500 hover:text-zinc-200"
            }`}
            onClick={onClick}
          >
            <Icon className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side="bottom" 
          className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-200 border-zinc-700/50"
          sideOffset={5}
        >
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResponseActionContainer({ 
  content, 
  onFeedback,
  feedbackState = null,
  className = ""
}: ResponseActionContainerProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFeedback = (type: 'up') => {
    const next = feedbackState === type ? null : type;
    onFeedback?.(next);
  };

  return (
    <div className={`flex items-center gap-3 mt-3 ml-1 ${className}`}>
      <ActionButton 
        icon={ThumbsUp} 
        label="Good response" 
        onClick={() => handleFeedback('up')}
        isActive={feedbackState === 'up'}
      />
      <ActionButton 
        icon={isCopied ? Check : Copy} 
        label={isCopied ? "Copied" : "Copy"} 
        onClick={handleCopy} 
      />
      
      <DropdownMenu>
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1.5 !bg-transparent rounded-full transition-all duration-200 focus:outline-none text-zinc-500 hover:text-zinc-200 hover:scale-105 data-[state=open]:text-zinc-200"
                >
                  <MoreVertical className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent 
              side="bottom" 
              className="text-[10px] px-2 py-1 bg-zinc-800 text-zinc-200 border-zinc-700/50"
              sideOffset={5}
            >
              <p>More</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        <DropdownMenuContent align="start" className="w-56 bg-[#1e1e1e] border-zinc-800 text-zinc-300">
          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer gap-2">
            <Volume2 className="h-4 w-4" />
            <span>Listen Voice</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="focus:bg-zinc-800 focus:text-zinc-100 cursor-pointer gap-2">
            <FileText className="h-4 w-4" />
            <span>Export to Docs</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
