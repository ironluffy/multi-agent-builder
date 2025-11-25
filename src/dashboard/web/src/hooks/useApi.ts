import { useState, useEffect, useCallback } from 'react';

interface UseApiOptions<T> {
  initialData?: T;
  autoFetch?: boolean;
  refreshInterval?: number;
}

interface UseApiResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useApi<T>(
  url: string,
  options: UseApiOptions<T> = {}
): UseApiResult<T> {
  const { initialData, autoFetch = true, refreshInterval } = options;
  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (autoFetch) {
      fetchData();
    }
  }, [autoFetch, fetchData]);

  useEffect(() => {
    if (refreshInterval && refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
}

// Specific API hooks
export function useAgents(refreshInterval = 5000) {
  return useApi<{ agents: Agent[] }>('/api/agents', { refreshInterval });
}

export function useWorkflows(refreshInterval = 5000) {
  return useApi<{ workflows: WorkflowGraph[] }>('/api/workflows', { refreshInterval });
}

export function useApprovals(refreshInterval = 3000) {
  return useApi<{ approvals: ApprovalRequest[] }>('/api/approvals', { refreshInterval });
}

export function useMetrics(refreshInterval = 2000) {
  return useApi<SystemMetrics>('/api/metrics', { refreshInterval });
}

export function useLinearMappings(refreshInterval = 10000) {
  return useApi<{ mappings: LinearMapping[] }>('/api/linear/mappings', { refreshInterval });
}

export function useDelegationRules(refreshInterval = 30000) {
  return useApi<{ rules: DelegationRule[] }>('/api/delegation/rules', { refreshInterval });
}

// Import types
import type {
  Agent,
  WorkflowGraph,
  ApprovalRequest,
  SystemMetrics,
  LinearMapping,
  DelegationRule,
} from '../types';
