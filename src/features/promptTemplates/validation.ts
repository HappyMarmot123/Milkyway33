import type { ChatMessageExample } from '@/features/chat/types';

export const PROMPT_SYSTEM_LIMIT = 1000;
export const PROMPT_EXAMPLE_LIMIT = 100;
export const PROMPT_EXAMPLE_MAX = 2;

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

export type ExampleErrors = { input?: string; output?: string };

export function checkPromptText(text: string, maxLength = PROMPT_EXAMPLE_LIMIT): string | null {
  if (text.length > maxLength) return `${maxLength}자 이내로 입력하세요.`;

  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(text)) {
      return '프롬프트 주입으로 의심되는 표현이 포함되어 있습니다.';
    }
  }

  return null;
}

export function normalizeExamples(examples: ChatMessageExample[]): ChatMessageExample[] {
  return examples
    .map((example) => ({ input: example.input.trim(), output: example.output.trim() }))
    .filter((example) => example.input || example.output)
    .slice(0, PROMPT_EXAMPLE_MAX);
}

export function getExampleErrors(example: ChatMessageExample): ExampleErrors {
  const input = checkPromptText(example.input, PROMPT_EXAMPLE_LIMIT);
  const output = checkPromptText(example.output, PROMPT_EXAMPLE_LIMIT);
  return {
    ...(input ? { input } : {}),
    ...(output ? { output } : {}),
  };
}
