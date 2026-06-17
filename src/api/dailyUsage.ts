import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { setChatDailyUsage } from '@/features/chat/dailyUsageStore';

export interface DailyUsageResponse {
  limit: number;
  remaining: number;
}

// TanStack Query key
export const dailyUsageQueryKey = ['chat', 'daily-usage'] as const;

// Axios 기반 fetcher — ApiError로 정규화된 에러가 자동으로 올라온다.
async function getDailyUsage(): Promise<DailyUsageResponse> {
  const { data } = await apiClient.get<DailyUsageResponse>('/chat/daily-usage');

  const limit = Math.max(1, Number(data.limit) || 10);
  const remaining = Math.max(0, Math.min(Number(data.remaining) || 0, limit));
  const normalized = { limit, remaining };

  // 전역 스토어 동기화
  setChatDailyUsage(normalized);
  return normalized;
}

// useQuery 훅 — 컴포넌트에서 바로 사용
export function useDailyUsageQuery() {
  return useQuery({
    queryKey: dailyUsageQueryKey,
    queryFn: getDailyUsage,
    staleTime: 30_000,       // 30초 캐시
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
