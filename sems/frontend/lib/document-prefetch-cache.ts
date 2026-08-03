/**
 * Prefetch window for score-sheet documents used by ValidationIssueWorkspace.
 * Keeps current + next N unique documents as object URLs; revokes the rest.
 */

export type PrefetchedDocument = {
  key: string;
  blobUrl: string;
  mimeType: string | null;
};

type CacheEntry =
  | {
      status: "ready";
      key: string;
      blobUrl: string;
      mimeType: string | null;
    }
  | {
      status: "loading";
      key: string;
      abort: AbortController;
      promise: Promise<PrefetchedDocument | null>;
    };

export type DocumentPrefetchCache = {
  /** Return a ready blob URL for a document key, if cached. */
  get: (key: string) => PrefetchedDocument | undefined;
  /** Ensure the given key set is retained; revoke anything outside it. */
  retain: (keys: Iterable<string>) => void;
  /**
   * Fetch and cache a document blob if missing.
   * Concurrent calls for the same key share one in-flight request.
   */
  ensure: (key: string, url: string, mimeType?: string | null) => Promise<PrefetchedDocument | null>;
  /** Subscribe to cache updates (new entries / revokes). Returns unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  /** Revoke all object URLs and abort in-flight fetches. */
  clear: () => void;
};

export function createDocumentPrefetchCache(): DocumentPrefetchCache {
  const entries = new Map<string, CacheEntry>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    }
  };

  const dropEntry = (entry: CacheEntry) => {
    if (entry.status === "loading") {
      entry.abort.abort();
    } else {
      try {
        URL.revokeObjectURL(entry.blobUrl);
      } catch {
        /* ignore */
      }
    }
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry || entry.status !== "ready") return undefined;
      return { key: entry.key, blobUrl: entry.blobUrl, mimeType: entry.mimeType };
    },

    retain(keys) {
      const keep = new Set(keys);
      let changed = false;
      for (const [key, entry] of entries) {
        if (!keep.has(key)) {
          dropEntry(entry);
          entries.delete(key);
          changed = true;
        }
      }
      if (changed) notify();
    },

    ensure(key, url, mimeType = null) {
      const existing = entries.get(key);
      if (existing?.status === "ready") {
        return Promise.resolve({
          key: existing.key,
          blobUrl: existing.blobUrl,
          mimeType: existing.mimeType,
        });
      }
      if (existing?.status === "loading") {
        return existing.promise;
      }

      const abort = new AbortController();
      const promise = (async (): Promise<PrefetchedDocument | null> => {
        try {
          const response = await fetch(url, {
            signal: abort.signal,
            credentials: "omit",
          });
          if (!response.ok) {
            entries.delete(key);
            return null;
          }
          const blob = await response.blob();
          if (abort.signal.aborted) {
            entries.delete(key);
            return null;
          }
          const blobUrl = URL.createObjectURL(blob);
          const resolvedMime = mimeType || blob.type || null;
          const ready: CacheEntry = {
            status: "ready",
            key,
            blobUrl,
            mimeType: resolvedMime,
          };
          // Only commit if we are still the in-flight entry for this key
          const current = entries.get(key);
          if (current?.status === "loading" && current.abort === abort) {
            entries.set(key, ready);
            notify();
            return { key, blobUrl, mimeType: resolvedMime };
          }
          try {
            URL.revokeObjectURL(blobUrl);
          } catch {
            /* ignore */
          }
          return null;
        } catch {
          const current = entries.get(key);
          if (current?.status === "loading" && current.abort === abort) {
            entries.delete(key);
          }
          return null;
        }
      })();

      entries.set(key, { status: "loading", key, abort, promise });
      return promise;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    clear() {
      for (const entry of entries.values()) {
        dropEntry(entry);
      }
      entries.clear();
      notify();
    },
  };
}

/** Limit parallel async work over an array of tasks. */
export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}
