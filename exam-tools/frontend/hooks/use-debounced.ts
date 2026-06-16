"use client";

import { useEffect, useState } from "react";

/** Debounce a value; updates after `ms` of stability. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}

export const EXAMINER_LIST_SEARCH_DEBOUNCE_MS = 300;
