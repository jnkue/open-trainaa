import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync<T = unknown>(fn: () => Promise<T>, deps?: any[]) {
  const mounted = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [value, setValue] = useState<T | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Ensure fn is part of the callback's closure
  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (mounted.current) setValue(result as T);
      return result;
    } catch (err) {
      if (mounted.current) setError(err);
      throw err;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [fn]);

  // Trigger on mount and when provided deps change
  useEffect(() => {
    execute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ? [...deps, execute] : [execute]);

  return { loading, error, value, execute };
}
