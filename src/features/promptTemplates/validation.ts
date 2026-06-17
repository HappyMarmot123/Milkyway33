export const PROMPT_SYSTEM_LIMIT = 1000;

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

export function checkPromptText(text: string, maxLength = PROMPT_SYSTEM_LIMIT): string | null {
  if (text.length > maxLength) return `${maxLength}자 이내로 입력하세요.`;

  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(text)) {
      return '프롬프트 주입으로 의심되는 표현이 포함되어 있습니다.';
    }
  }

  return null;
}
