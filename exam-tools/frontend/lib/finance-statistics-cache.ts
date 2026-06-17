"use client";

import {
  getFinanceCentreInvigilatorSummaryForCentre,
  getFinanceCentreOfficialStatistics,
  getFinanceCentreSchoolSummary,
  loadFinanceCentreInspectorAnalysisProgressive,
  loadFinanceCentreOfficialStatisticsProgressive,
  normalizeInspectorAnalysisResponse,
  type FinanceCentreDayInvigilatorRow,
  type FinanceCentreInspectorAnalysisResponse,
  type FinanceCentreOfficialStatisticsResponse,
  type FinanceCentreSchoolSummaryResponse,
  type TimetableSubjectFilter,
} from "@/lib/api";

const STATS_TTL_MS = 8 * 60 * 1000;
const SESSION_PREFIX = "finance-stats-cache:v1:";

type CacheEntry<T> = { data: T; fetchedAt: number };

export type CachedFetchResult<T> = {
  data: T;
  fromCache: boolean;
  isRevalidating: boolean;
};

function officialStatsKey(examId: number, subjectFilter: TimetableSubjectFilter): string {
  return `official:${examId}:${subjectFilter}`;
}

function centreSummaryKey(
  examId: number,
  centerId: string,
  subjectFilter: TimetableSubjectFilter,
): string {
  return `centre-summary:${examId}:${centerId}:${subjectFilter}`;
}

function centreInvigilatorKey(
  examId: number,
  centerId: string,
  subjectFilter: TimetableSubjectFilter,
): string {
  return `centre-invigilator:${examId}:${centerId}:${subjectFilter}`;
}

function inspectorAnalysisKey(
  examId: number,
  subjectFilter: TimetableSubjectFilter,
  candidatesPerInspector: number,
): string {
  return `inspector-analysis:v2:${examId}:${subjectFilter}:${candidatesPerInspector}`;
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

const officialStatsMemory = new Map<string, CacheEntry<FinanceCentreOfficialStatisticsResponse>>();
const officialStatsInflight = new Map<string, Promise<FinanceCentreOfficialStatisticsResponse>>();
const centreSummaryMemory = new Map<string, CacheEntry<FinanceCentreSchoolSummaryResponse>>();
const centreSummaryInflight = new Map<string, Promise<FinanceCentreSchoolSummaryResponse>>();
const centreInvigilatorMemory = new Map<string, CacheEntry<FinanceCentreDayInvigilatorRow[]>>();
const centreInvigilatorInflight = new Map<string, Promise<FinanceCentreDayInvigilatorRow[]>>();
const inspectorAnalysisMemory = new Map<string, CacheEntry<FinanceCentreInspectorAnalysisResponse>>();
const inspectorAnalysisInflight = new Map<string, Promise<FinanceCentreInspectorAnalysisResponse>>();

function getOfficialStatsEntry(key: string): CacheEntry<FinanceCentreOfficialStatisticsResponse> | null {
  const mem = officialStatsMemory.get(key);
  if (mem != null) return mem;
  return readSession<FinanceCentreOfficialStatisticsResponse>(key);
}

function setOfficialStatsEntry(
  key: string,
  entry: CacheEntry<FinanceCentreOfficialStatisticsResponse>,
): void {
  officialStatsMemory.set(key, entry);
  writeSession(key, entry);
}

function getCentreSummaryEntry(key: string): CacheEntry<FinanceCentreSchoolSummaryResponse> | null {
  const mem = centreSummaryMemory.get(key);
  if (mem != null) return mem;
  return readSession<FinanceCentreSchoolSummaryResponse>(key);
}

function setCentreSummaryEntry(
  key: string,
  entry: CacheEntry<FinanceCentreSchoolSummaryResponse>,
): void {
  centreSummaryMemory.set(key, entry);
  writeSession(key, entry);
}

function getCentreInvigilatorEntry(key: string): CacheEntry<FinanceCentreDayInvigilatorRow[]> | null {
  const mem = centreInvigilatorMemory.get(key);
  if (mem != null) return mem;
  return readSession<FinanceCentreDayInvigilatorRow[]>(key);
}

function setCentreInvigilatorEntry(
  key: string,
  entry: CacheEntry<FinanceCentreDayInvigilatorRow[]>,
): void {
  centreInvigilatorMemory.set(key, entry);
  writeSession(key, entry);
}

export function peekCachedOfficialStatistics(
  examId: number,
  subjectFilter: TimetableSubjectFilter,
): FinanceCentreOfficialStatisticsResponse | null {
  const entry = getOfficialStatsEntry(officialStatsKey(examId, subjectFilter));
  return entry?.data ?? null;
}

export function peekCachedCentreSchoolSummary(
  examId: number,
  centerId: string,
  subjectFilter: TimetableSubjectFilter,
): FinanceCentreSchoolSummaryResponse | null {
  const entry = getCentreSummaryEntry(centreSummaryKey(examId, centerId, subjectFilter));
  return entry?.data ?? null;
}

export function peekCachedCentreInvigilatorDays(
  examId: number,
  centerId: string,
  subjectFilter: TimetableSubjectFilter,
): FinanceCentreDayInvigilatorRow[] | null {
  const entry = getCentreInvigilatorEntry(centreInvigilatorKey(examId, centerId, subjectFilter));
  return entry?.data ?? null;
}

function getInspectorAnalysisEntry(key: string): CacheEntry<FinanceCentreInspectorAnalysisResponse> | null {
  const mem = inspectorAnalysisMemory.get(key);
  if (mem != null) return mem;
  return readSession<FinanceCentreInspectorAnalysisResponse>(key);
}

function setInspectorAnalysisEntry(
  key: string,
  entry: CacheEntry<FinanceCentreInspectorAnalysisResponse>,
): void {
  inspectorAnalysisMemory.set(key, entry);
  writeSession(key, entry);
}

export function peekCachedInspectorAnalysis(
  examId: number,
  subjectFilter: TimetableSubjectFilter,
  candidatesPerInspector: number,
): FinanceCentreInspectorAnalysisResponse | null {
  const entry = getInspectorAnalysisEntry(
    inspectorAnalysisKey(examId, subjectFilter, candidatesPerInspector),
  );
  return entry?.data != null ? normalizeInspectorAnalysisResponse(entry.data) : null;
}

async function fetchInspectorAnalysis(
  examId: number,
  subjectFilter: TimetableSubjectFilter,
  candidatesPerInspector: number,
  callbacks: {
    onShellLoaded?: Parameters<typeof loadFinanceCentreInspectorAnalysisProgressive>[1]["onShellLoaded"];
    onCentreLoaded?: Parameters<typeof loadFinanceCentreInspectorAnalysisProgressive>[1]["onCentreLoaded"];
  },
): Promise<FinanceCentreInspectorAnalysisResponse> {
  const key = inspectorAnalysisKey(examId, subjectFilter, candidatesPerInspector);
  const existing = inspectorAnalysisInflight.get(key);
  if (existing != null) return existing;

  const promise = loadFinanceCentreInspectorAnalysisProgressive(
    { examId, subject_filter: subjectFilter, candidates_per_inspector: candidatesPerInspector },
    callbacks,
  ).finally(() => {
    inspectorAnalysisInflight.delete(key);
  });
  inspectorAnalysisInflight.set(key, promise);
  return promise;
}

export async function loadInspectorAnalysisWithProgress(
  params: {
    examId: number;
    subject_filter: TimetableSubjectFilter;
    candidates_per_inspector: number;
    revalidate?: boolean;
    onUpdate?: (data: FinanceCentreInspectorAnalysisResponse) => void;
  },
  callbacks: {
    onShellLoaded?: Parameters<typeof loadFinanceCentreInspectorAnalysisProgressive>[1]["onShellLoaded"];
    onCentreLoaded?: Parameters<typeof loadFinanceCentreInspectorAnalysisProgressive>[1]["onCentreLoaded"];
  },
): Promise<CachedFetchResult<FinanceCentreInspectorAnalysisResponse>> {
  const key = inspectorAnalysisKey(params.examId, params.subject_filter, params.candidates_per_inspector);
  const entry = getInspectorAnalysisEntry(key);
  const force = params.revalidate === true;

  const store = (data: FinanceCentreInspectorAnalysisResponse) => {
    const normalized = normalizeInspectorAnalysisResponse(data);
    setInspectorAnalysisEntry(key, { data: normalized, fetchedAt: Date.now() });
    params.onUpdate?.(normalized);
  };

  if (entry != null && !force) {
    const cached = normalizeInspectorAnalysisResponse(entry.data);
    if (isFresh(entry, STATS_TTL_MS)) {
      return { data: cached, fromCache: true, isRevalidating: false };
    }
    void fetchInspectorAnalysis(
      params.examId,
      params.subject_filter,
      params.candidates_per_inspector,
      callbacks,
    )
      .then(store)
      .catch(() => {});
    return { data: cached, fromCache: true, isRevalidating: true };
  }

  const summary = await fetchInspectorAnalysis(
    params.examId,
    params.subject_filter,
    params.candidates_per_inspector,
    callbacks,
  );
  store(summary);
  return { data: summary, fromCache: false, isRevalidating: false };
}

export function invalidateOfficialStatisticsCache(
  examId?: number,
  subjectFilter?: TimetableSubjectFilter,
): void {
  const prefix =
    examId != null && subjectFilter != null
      ? officialStatsKey(examId, subjectFilter)
      : "official:";
  for (const key of [...officialStatsMemory.keys()]) {
    if (key.startsWith(prefix)) officialStatsMemory.delete(key);
  }
  if (typeof sessionStorage === "undefined") return;
  for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
    const storageKey = sessionStorage.key(i);
    if (storageKey?.startsWith(`${SESSION_PREFIX}${prefix}`)) {
      sessionStorage.removeItem(storageKey);
    }
  }
}

async function fetchOfficialStatistics(
  examId: number,
  subjectFilter: TimetableSubjectFilter,
): Promise<FinanceCentreOfficialStatisticsResponse> {
  const key = officialStatsKey(examId, subjectFilter);
  const existing = officialStatsInflight.get(key);
  if (existing != null) return existing;

  const promise = getFinanceCentreOfficialStatistics({ examId, subject_filter: subjectFilter }).finally(
    () => {
      officialStatsInflight.delete(key);
    },
  );
  officialStatsInflight.set(key, promise);
  return promise;
}

export async function loadOfficialStatisticsWithProgress(
  params: {
    examId: number;
    subject_filter: TimetableSubjectFilter;
    revalidate?: boolean;
    onUpdate?: (data: FinanceCentreOfficialStatisticsResponse) => void;
  },
  callbacks: {
    onShellLoaded?: Parameters<typeof loadFinanceCentreOfficialStatisticsProgressive>[1]["onShellLoaded"];
    onCalculating?: () => void;
  },
): Promise<CachedFetchResult<FinanceCentreOfficialStatisticsResponse>> {
  const key = officialStatsKey(params.examId, params.subject_filter);
  const entry = getOfficialStatsEntry(key);
  const force = params.revalidate === true;

  const store = (data: FinanceCentreOfficialStatisticsResponse) => {
    setOfficialStatsEntry(key, { data, fetchedAt: Date.now() });
    params.onUpdate?.(data);
  };

  if (entry != null && !force) {
    if (isFresh(entry, STATS_TTL_MS)) {
      return { data: entry.data, fromCache: true, isRevalidating: false };
    }
    void fetchOfficialStatistics(params.examId, params.subject_filter)
      .then(store)
      .catch(() => {});
    return { data: entry.data, fromCache: true, isRevalidating: true };
  }

  const summary = await loadFinanceCentreOfficialStatisticsProgressive(
    { examId: params.examId, subject_filter: params.subject_filter },
    callbacks,
  );
  store(summary);
  return { data: summary, fromCache: false, isRevalidating: false };
}

export async function getCachedCentreSchoolSummary(params: {
  examId: number;
  centerId: string;
  subject_filter: TimetableSubjectFilter;
  revalidate?: boolean;
  onUpdate?: (data: FinanceCentreSchoolSummaryResponse) => void;
}): Promise<CachedFetchResult<FinanceCentreSchoolSummaryResponse>> {
  const key = centreSummaryKey(params.examId, params.centerId, params.subject_filter);
  const entry = getCentreSummaryEntry(key);
  const force = params.revalidate === true;

  const applyFresh = (data: FinanceCentreSchoolSummaryResponse) => {
    setCentreSummaryEntry(key, { data, fetchedAt: Date.now() });
    params.onUpdate?.(data);
  };

  const fetchOne = async (): Promise<FinanceCentreSchoolSummaryResponse> => {
    const existing = centreSummaryInflight.get(key);
    if (existing != null) return existing;
    const promise = getFinanceCentreSchoolSummary({
      examId: params.examId,
      centerId: params.centerId,
      subject_filter: params.subject_filter,
    }).finally(() => {
      centreSummaryInflight.delete(key);
    });
    centreSummaryInflight.set(key, promise);
    return promise;
  };

  if (entry != null && !force) {
    if (isFresh(entry, STATS_TTL_MS)) {
      return { data: entry.data, fromCache: true, isRevalidating: false };
    }
    void fetchOne()
      .then(applyFresh)
      .catch(() => {});
    return { data: entry.data, fromCache: true, isRevalidating: true };
  }

  const data = await fetchOne();
  applyFresh(data);
  return { data, fromCache: false, isRevalidating: false };
}

export async function getCachedCentreInvigilatorDays(params: {
  examId: number;
  centerId: string;
  subject_filter: TimetableSubjectFilter;
  revalidate?: boolean;
}): Promise<CachedFetchResult<FinanceCentreDayInvigilatorRow[]>> {
  const key = centreInvigilatorKey(params.examId, params.centerId, params.subject_filter);
  const entry = getCentreInvigilatorEntry(key);
  const force = params.revalidate === true;

  const applyFresh = (data: FinanceCentreDayInvigilatorRow[]) => {
    setCentreInvigilatorEntry(key, { data, fetchedAt: Date.now() });
  };

  const fetchOne = async (): Promise<FinanceCentreDayInvigilatorRow[]> => {
    const existing = centreInvigilatorInflight.get(key);
    if (existing != null) return existing;
    const promise = getFinanceCentreInvigilatorSummaryForCentre({
      examId: params.examId,
      center_host_id: params.centerId,
      subject_filter: params.subject_filter,
    })
      .then((item) => item.days)
      .finally(() => {
        centreInvigilatorInflight.delete(key);
      });
    centreInvigilatorInflight.set(key, promise);
    return promise;
  };

  if (entry != null && !force) {
    if (isFresh(entry, STATS_TTL_MS)) {
      return { data: entry.data, fromCache: true, isRevalidating: false };
    }
    void fetchOne()
      .then(applyFresh)
      .catch(() => {});
    return { data: entry.data, fromCache: true, isRevalidating: true };
  }

  const data = await fetchOne();
  applyFresh(data);
  return { data, fromCache: false, isRevalidating: false };
}
