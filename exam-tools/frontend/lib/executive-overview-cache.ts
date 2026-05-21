"use client";

import {
  apiJson,
  getStaffDefaultExamination,
  getStaffNationalOverview,
  type Examination,
  type NationalExecutiveOverviewResponse,
} from "@/lib/api";

const OVERVIEW_TTL_MS = 4 * 60 * 1000;
const EXAMS_TTL_MS = 10 * 60 * 1000;
const SESSION_PREFIX = "executive-cache:v1:";

type CacheEntry<T> = { data: T; fetchedAt: number };

export type CachedFetchResult<T> = {
  data: T;
  /** Data was served from cache (including stale SWR). */
  fromCache: boolean;
  /** A background refresh is in progress. */
  isRevalidating: boolean;
};

export type CachedExaminationsPayload = {
  exams: Examination[];
  defaultExam: Examination | null;
};

const overviewMemory = new Map<string, CacheEntry<NationalExecutiveOverviewResponse>>();
const overviewInflight = new Map<string, Promise<NationalExecutiveOverviewResponse>>();
let examsEntry: CacheEntry<CachedExaminationsPayload> | null = null;
let examsInflight: Promise<CachedExaminationsPayload> | null = null;

function overviewKey(examId: number, includeCentres: boolean): string {
  return `${examId}:${includeCentres ? "full" : "slim"}`;
}

function isFresh<T>(entry: CacheEntry<T>, ttlMs: number): boolean {
  return Date.now() - entry.fetchedAt < ttlMs;
}

function readSession<T>(key: string): CacheEntry<T> | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    if (raw == null) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_PREFIX}${key}`, JSON.stringify(entry));
  } catch {
    /* quota or private mode */
  }
}

function getOverviewEntry(
  key: string,
): CacheEntry<NationalExecutiveOverviewResponse> | null {
  const mem = overviewMemory.get(key);
  if (mem != null) return mem;
  return readSession<NationalExecutiveOverviewResponse>(`overview:${key}`);
}

function setOverviewEntry(
  key: string,
  entry: CacheEntry<NationalExecutiveOverviewResponse>,
): void {
  overviewMemory.set(key, entry);
  writeSession(`overview:${key}`, entry);
}

/** Synchronous peek for instant paint before async cache helper runs. */
export function peekCachedNationalOverview(
  examId: number,
  includeCentres: boolean,
): NationalExecutiveOverviewResponse | null {
  const entry = getOverviewEntry(overviewKey(examId, includeCentres));
  return entry?.data ?? null;
}

export function peekCachedExaminations(): CachedExaminationsPayload | null {
  if (examsEntry != null) return examsEntry.data;
  const session = readSession<CachedExaminationsPayload>("exams");
  if (session != null) {
    examsEntry = session;
    return session.data;
  }
  return null;
}

async function fetchNationalOverview(
  examId: number,
  includeCentres: boolean,
): Promise<NationalExecutiveOverviewResponse> {
  const key = overviewKey(examId, includeCentres);
  const existing = overviewInflight.get(key);
  if (existing != null) return existing;

  const promise = getStaffNationalOverview(examId, { includeCentres }).finally(() => {
    overviewInflight.delete(key);
  });
  overviewInflight.set(key, promise);
  return promise;
}

export async function getCachedNationalOverview(
  examId: number,
  options?: {
    includeCentres?: boolean;
    revalidate?: boolean;
    onUpdate?: (data: NationalExecutiveOverviewResponse) => void;
  },
): Promise<CachedFetchResult<NationalExecutiveOverviewResponse>> {
  const includeCentres = options?.includeCentres ?? true;
  const key = overviewKey(examId, includeCentres);
  const entry = getOverviewEntry(key);
  const force = options?.revalidate === true;

  const applyFresh = (data: NationalExecutiveOverviewResponse) => {
    setOverviewEntry(key, { data, fetchedAt: Date.now() });
    options?.onUpdate?.(data);
  };

  if (entry != null && !force) {
    if (isFresh(entry, OVERVIEW_TTL_MS)) {
      return { data: entry.data, fromCache: true, isRevalidating: false };
    }
    void fetchNationalOverview(examId, includeCentres)
      .then(applyFresh)
      .catch(() => {
        /* keep stale data on background failure */
      });
    return { data: entry.data, fromCache: true, isRevalidating: true };
  }

  const data = await fetchNationalOverview(examId, includeCentres);
  applyFresh(data);
  return { data, fromCache: false, isRevalidating: false };
}

async function fetchExaminations(): Promise<CachedExaminationsPayload> {
  if (examsInflight != null) return examsInflight;
  examsInflight = (async () => {
    const [exams, defaultExam] = await Promise.all([
      apiJson<Examination[]>("/examinations"),
      getStaffDefaultExamination().catch(() => null),
    ]);
    return { exams, defaultExam };
  })().finally(() => {
    examsInflight = null;
  });
  return examsInflight;
}

export async function getCachedExaminations(options?: {
  revalidate?: boolean;
  onUpdate?: (data: CachedExaminationsPayload) => void;
}): Promise<CachedFetchResult<CachedExaminationsPayload>> {
  const force = options?.revalidate === true;
  if (examsEntry == null) {
    const session = readSession<CachedExaminationsPayload>("exams");
    if (session != null) examsEntry = session;
  }

  const applyFresh = (data: CachedExaminationsPayload) => {
    examsEntry = { data, fetchedAt: Date.now() };
    writeSession("exams", examsEntry);
    options?.onUpdate?.(data);
  };

  if (examsEntry != null && !force) {
    if (isFresh(examsEntry, EXAMS_TTL_MS)) {
      return { data: examsEntry.data, fromCache: true, isRevalidating: false };
    }
    void fetchExaminations()
      .then(applyFresh)
      .catch(() => {});
    return { data: examsEntry.data, fromCache: true, isRevalidating: true };
  }

  const data = await fetchExaminations();
  applyFresh(data);
  return { data, fromCache: false, isRevalidating: false };
}
