import { useMemo, useState } from "react";
import { X, Save } from "lucide-react";
import { ChatPromptConfig, ChatMessageExample } from "@/features/chat/types";

interface PromptConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ChatPromptConfig;
  onSave: (config: ChatPromptConfig) => void;
}

export const PromptConfigModal = ({
  isOpen,
  onClose,
  config,
  onSave,
}: PromptConfigModalProps) => {
  if (!isOpen) return null;

  return (
    <PromptConfigForm
      key={JSON.stringify(config)}
      config={config}
      onClose={onClose}
      onSave={onSave}
    />
  );
};

const DENY_PATTERNS = [
  /ignore previous instructions/i,
  /system prompt/i,
  /ignore the above/i,
  /DAN mode/i,
  /jailbreak/i,
  /never refuse/i,
  /do not apologize/i,
  /do not say no/i,
  /developer mode/i,
  /unrestricted/i,
  /god mode/i,
  /sudo/i,
  /decode/i,
  /base64/i,
  /hex string/i,
  /\|\|/,
  /&&/,
  /\$\(/,
];

type PromptErrors = {
  system?: string;
  example?: { input?: string; output?: string };
};

function checkInjection(text: string): string | null {
  if (text.length > 300) return "Message exceeds 300 characters.";
  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(text)) {
      return "Potential prompt injection detected (forbidden keyword or pattern).";
    }
  }
  return null;
}

function getPromptErrors(sys: string, ex: ChatMessageExample): PromptErrors {
  const newErrors: PromptErrors = {};

  const sysError = checkInjection(sys);
  if (sysError) {
    newErrors.system = sysError;
  }

  const inputError = checkInjection(ex.input);
  const outputError = checkInjection(ex.output);

  if (inputError || outputError) {
    newErrors.example = {};
    if (inputError) newErrors.example.input = inputError;
    if (outputError) newErrors.example.output = outputError;
  }

  return newErrors;
}

function PromptConfigForm({
  config,
  onClose,
  onSave,
}: Pick<PromptConfigModalProps, "config" | "onClose" | "onSave">) {
  const [systemInstruction, setSystemInstruction] = useState(config.systemInstruction || "");
  // Always maintain at least one example structure for the UI
  const [example, setExample] = useState<ChatMessageExample>(
    config.examples?.[0] ?? { input: "", output: "" }
  );
  const errors = useMemo(
    () => getPromptErrors(systemInstruction, example),
    [systemInstruction, example]
  );

  const handleSave = () => {
    if (Object.keys(errors).length === 0) {
      const examples = [];
      // Only save if meaningful content exists
      if (example.input.trim() || example.output.trim()) {
        examples.push(example);
      }
      
      onSave({
        systemInstruction,
        examples,
      });
      onClose();
    }
  };

  const updateExample = (field: keyof ChatMessageExample, value: string) => {
    setExample(prev => ({ ...prev, [field]: value }));
  };

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-background border rounded-lg shadow-lg flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Prompt Settings</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* System Instruction */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                System Instruction
              </label>
              {errors.system ? (
                 <span className="text-xs text-red-500 font-medium animate-pulse">
                   {errors.system}
                 </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {systemInstruction.length}/300
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Define the persona, role, or specific rules the model should follow.
            </p>
            <div className="relative">
              <textarea
                value={systemInstruction}
                onChange={(e) => setSystemInstruction(e.target.value)}
                maxLength={300}
                placeholder="e.g. You are a helpful coding assistant."
                className={`flex min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y ${
                  errors.system ? "border-red-500 focus-visible:ring-red-500" : "border-input"
                }`}
              />
            </div>
          </div>

          <div className="border-t" />

          {/* Few-shot Example (Single) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium leading-none">
                  Few-shot Example
                </label>
                <p className="text-xs text-muted-foreground">
                  Provide an example to guide the model's behavior.
                </p>
              </div>
            </div>

            <div className="group relative grid gap-4 p-4 border rounded-md bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="grid gap-2">
                 <div className="flex justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    User Input
                  </label>
                  {errors.example?.input ? (
                    <span className="text-[10px] text-red-500 font-medium">
                      {errors.example.input}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {example.input.length}/300
                    </span>
                  )}
                </div>
                <textarea
                  value={example.input}
                  onChange={(e) => updateExample("input", e.target.value)}
                  maxLength={300}
                  placeholder="User's question or input"
                  className={`flex min-h-[60px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y ${
                    errors.example?.input ? "border-red-500 focus-visible:ring-red-500" : "border-input"
                  }`}
                />
              </div>
              
              <div className="grid gap-2">
                <div className="flex justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Model Response
                  </label>
                   {errors.example?.output ? (
                    <span className="text-[10px] text-red-500 font-medium">
                      {errors.example.output}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {example.output.length}/300
                    </span>
                  )}
                </div>
                <textarea
                  value={example.output}
                  onChange={(e) => updateExample("output", e.target.value)}
                  maxLength={300}
                  placeholder="Expected model response"
                  className={`flex min-h-[60px] w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y ${
                     errors.example?.output ? "border-red-500 focus-visible:ring-red-500" : "border-input"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={hasErrors}
            className="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary  hover:bg-primary/90 h-9 px-4 py-2"
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
