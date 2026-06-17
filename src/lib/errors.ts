// 백엔드 에러 코드 → 사용자 메시지 매핑
// 서버 message를 직접 노출하지 않고 프론트엔드에서 문구를 관리한다.

export type ApiErrorCode =
  | 'RATE_LIMITED'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

const ERROR_MESSAGES: Record<ApiErrorCode, string> = {
  RATE_LIMITED: '요청 간격 제한 중입니다. 잠시 후 다시 시도해주세요.',
  DAILY_LIMIT_EXCEEDED: '오늘의 채팅 횟수를 모두 사용했습니다. 내일 다시 이용해주세요.',
  INVALID_REQUEST: '잘못된 요청입니다. 내용을 확인해주세요.',
  UNAUTHORIZED: '인증이 필요합니다.',
  FORBIDDEN: '접근 권한이 없습니다.',
  NOT_FOUND: '요청한 리소스를 찾을 수 없습니다.',
  SERVER_ERROR: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  NETWORK_ERROR: '네트워크 연결을 확인해주세요.',
  UNKNOWN: '알 수 없는 오류가 발생했습니다.',
};

export function getErrorMessage(code?: string): string {
  if (code && code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[code as ApiErrorCode];
  }
  return ERROR_MESSAGES.UNKNOWN;
}

// HTTP 상태 코드 → 에러 코드 변환
export function httpStatusToErrorCode(status: number, retryAfter?: string | null): ApiErrorCode {
  if (status === 429) {
    return retryAfter === '86400' ? 'DAILY_LIMIT_EXCEEDED' : 'RATE_LIMITED';
  }
  if (status === 400) return 'INVALID_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UNKNOWN';
}

// 정규화된 API 에러 클래스
export class ApiError extends Error {
  code: ApiErrorCode;
  userMessage: string;
  status: number;
  retryAfter?: number;

  constructor(status: number, code: ApiErrorCode, retryAfter?: number) {
    const userMessage = getErrorMessage(code);
    super(userMessage);
    this.name = 'ApiError';
    this.code = code;
    this.userMessage = userMessage;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
