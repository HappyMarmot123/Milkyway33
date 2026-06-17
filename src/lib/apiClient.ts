import axios from 'axios';
import { ApiError, httpStatusToErrorCode } from './errors';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

// Axios 인스턴스 — 모든 비스트리밍 API 요청에 사용
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10_000,
});

// Response Interceptor: 서버 에러를 ApiError로 정규화
// 컴포넌트는 error.response.data 구조를 몰라도 error.userMessage 만 사용하면 된다.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const retryAfterHeader = error.response?.headers?.['retry-after'] as string | undefined;
      const retryAfterSeconds = retryAfterHeader
        ? Math.max(1, Number.parseInt(retryAfterHeader, 10))
        : undefined;

      const code = httpStatusToErrorCode(status, retryAfterHeader);
      return Promise.reject(new ApiError(status, code, retryAfterSeconds));
    }

    // 네트워크 단절 등 Axios 에러가 아닌 경우
    return Promise.reject(new ApiError(0, 'NETWORK_ERROR'));
  },
);
