import { useEffect, useRef, useState } from "react";

// A search asked for a moment after typing stops, and only once this many
// letters are typed.
const DELAY_MS = 250;
const MIN_LENGTH = 2;

// What `search` finds for `query`, while `enabled`; the latest search wins
// (an earlier one answering late is ignored). Empty below two letters, and
// on a failed search.
export function useDebouncedSearch<T>(
  search: ((query: string) => Promise<T[]>) | undefined,
  query: string,
  enabled = true,
): { found: T[]; searching: boolean } {
  const [found, setFound] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(search);
  searchRef.current = search;
  const run = useRef(0);
  const q = query.trim();
  const wanted = !!search && enabled && q.length >= MIN_LENGTH;

  useEffect(() => {
    const thisRun = ++run.current;
    if (!wanted) {
      setFound([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      Promise.resolve(searchRef.current?.(q) ?? [])
        .then((results) => {
          if (thisRun === run.current) setFound(Array.isArray(results) ? results : []);
        })
        .catch(() => {
          if (thisRun === run.current) setFound([]);
        })
        .finally(() => {
          if (thisRun === run.current) setSearching(false);
        });
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [wanted, q]);

  return { found: wanted ? found : [], searching: wanted && searching };
}
