
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import FuzzyText from "@/components/ui/FuzzyText";
import { RefreshCcwIcon } from "lucide-react";

interface ErrorModalProps {
  error: string | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function ErrorModal({ error, onClose, onRetry }: ErrorModalProps) {
  const isOpen = Boolean(error);
  const { code: errorCode, message: userMessage } = error
    ? parseError(error)
    : { code: "ERROR", message: "" };

  const handleClose = () => {
    onClose();
  };

  const handleAction = () => {
    handleClose();
    if (onRetry) onRetry();
  };

  return (
    // Prevent closing via onOpenChange if it's not our manual close
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      {/* [&>button]:hidden removes the default X close button */}
      <DialogContent 
        className="sm:max-w-md bg-black/95 border-white/10 text-white p-0 overflow-hidden [&>button]:hidden shadow-2xl shadow-red-900/20"
        onInteractOutside={(e: any) => e.preventDefault()} 
        onEscapeKeyDown={(e: any) => e.preventDefault()}
      >
        <div className="flex flex-col items-center justify-center p-12 space-y-8 min-h-[400px]">
            
            {/* Error Code Area */}
            <div className="flex items-center justify-center h-40 w-full animate-in fade-in zoom-in duration-500">
              <FuzzyText
                fontSize="6rem"
                fontWeight={900}
                color="#ef4444" 
                enableHover={true}
                baseIntensity={0.3}
                hoverIntensity={0.8}
                fuzzRange={16}
              >
                {errorCode}
              </FuzzyText>
            </div>

            {/* Error Message */}
            <div className="space-y-2 text-center max-w-[80%]">
                <p className="text-gray-400 text-lg leading-relaxed font-light tracking-wide whitespace-pre-line">
                {userMessage}
                </p>
            </div>
            
            {/* Action Button */}
            <div className="pt-4">
                <Button 
                    onClick={handleAction} 
                    className="bg-[#ef4444] text-white hover:bg-[#ef4444]/80 hover:scale-105 active:scale-95 transition-all duration-300 rounded-full px-10 py-6 text-lg font-medium shadow-lg shadow-red-500/25 border-none"
                >
                    <RefreshCcwIcon className="mr-2 h-5 w-5" />
                    Try Again
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseError(errorMessage: string): { code: string; message: string } {
  // Parsing common error patterns from Gemini / Backend
  
  if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      code: "429",
      message: "High traffic is causing delays."
    };
  }
  
  if (errorMessage.includes("404") || errorMessage.includes("NOT_FOUND")) {
    return {
      code: "404",
      message: "Requested model could not be found."
    };
  }

  if (errorMessage.includes("400") || errorMessage.includes("INVALID_ARGUMENT")) {
    return {
      code: "400",
      message: "Oops!Invalid request."
    };
  }

  if (errorMessage.includes("500") || errorMessage.includes("INTERNAL")) {
    return {
      code: "500",
      message: "An internal server error occurred."
    };
  }

  if (errorMessage.includes("Network Error") || errorMessage.includes("fetch")) {
    return {
      code: "NET",
      message: "Please check your network connection."
    };
  }

  return {
    code: "Error",
    message: errorMessage || "An unexpected error occurred."
  };
}
