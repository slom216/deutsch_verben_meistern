import { useEffect, useMemo, useState } from 'react';
import type { Verb } from '@/types/verb';
import { corpusFacets, loadLevels } from '@/data/verbRepository';
import { applyFilters } from '@/lib/filters';
import { useSettings } from '@/store/settingsStore';

/**
 * Loads the datasets for the learner's enabled CEFR levels and exposes both
 * the full pool and the pool narrowed by their grammatical filters.
 */
export function useVerbs() {
  const levels = useSettings((state) => state.levels);
  const filters = useSettings((state) => state.filters);

  const [verbs, setVerbs] = useState<Verb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const levelKey = [...levels].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadLevels(levelKey.split(',') as Verb['level'][])
      .then((loaded) => {
        if (!cancelled) setVerbs(loaded);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load the verb data.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [levelKey]);

  const filtered = useMemo(() => applyFilters(verbs, filters), [verbs, filters]);
  const facets = useMemo(() => corpusFacets(verbs), [verbs]);
  const byId = useMemo(() => new Map(verbs.map((verb) => [verb.id, verb])), [verbs]);

  return { verbs, filtered, facets, byId, loading, error };
}
