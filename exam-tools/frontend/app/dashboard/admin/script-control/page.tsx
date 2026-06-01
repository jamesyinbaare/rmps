"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { ScriptControlSchoolFilters } from "@/components/script-control/script-control-school-filters";
import { buildScriptControlQuery, parseScriptControlRecordType } from "@/components/script-control/script-control-shell";
import {
  ScriptControlStatusTabs,
  statusFilterEmptyMessage,
  type ScriptControlStatusFilter,
} from "@/components/script-control/script-control-status-tabs";
import {
  ScriptControlViewTable,
  type ScriptControlViewRow,
} from "@/components/script-control/script-control-view-table";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import {
  downloadIrregularScriptControlExport,
  downloadScriptControlExport,
  getExaminationScriptSeriesConfig,
  getIrregularScriptControlSchoolStatus,
  getScriptControlSchoolStatus,
  type ExaminationScriptSeriesConfigRow,
  type School,
  type SchoolListResponse,
  type ScriptControlSchoolStatusListResponse,
  type ScriptControlSchoolStatusRow,
} from "@/lib/api";
import { apiJson } from "@/lib/api";
import {
  filterSeriesConfigBySubjectType,
  parseScriptControlSubjectTypeFilter,
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
} from "@/lib/script-control-subjects";

const SESSION_KEY = "script-control-view-prefs";

function readSessionPrefs(examId: number | null): { subject?: string; paper?: string } {
  if (examId === null || typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(`${SESSION_KEY}:${examId}`);
    if (!raw) return {};
    return JSON.parse(raw) as { subject?: string; paper?: string };
  } catch {
    return {};
  }
}

function writeSessionPrefs(examId: number, subject: string, paper: string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_KEY}:${examId}`, JSON.stringify({ subject, paper }));
  } catch {
    /* ignore */
  }
}

function statusRowToViewRow(r: ScriptControlSchoolStatusRow): ScriptControlViewRow {
  const bySeries: ScriptControlViewRow["bySeries"] = {};
  for (const it of r.series_items) bySeries[it.series_number] = it;
  return {
    school_id: r.school_id,
    school_code: r.school_code,
    school_name: r.school_name,
    region: r.region,
    zone: r.zone,
    registered_candidates: r.registered_candidates,
    expected_series: r.expected_series,
    recorded_series: r.recorded_series,
    verified_series: r.verified_series,
    total_booklets: r.total_booklets,
    overall_status: r.overall_status,
    bySeries,
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AdminScriptControlViewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const examId = useMemo(() => {
    const raw = searchParams.get("exam");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const recordType = parseScriptControlRecordType(searchParams.get("type"));
  const subjectId = searchParams.get("subject") ?? "";
  const paperNumber = searchParams.get("paper") ?? "";
  const region = searchParams.get("region") ?? "";
  const zone = searchParams.get("zone") ?? "";
  const statusFilter = (searchParams.get("status") ?? "all") as ScriptControlStatusFilter;
  const subjectTypeFilter = parseScriptControlSubjectTypeFilter(searchParams.get("subject_type"));
  const showSeriesColumns = searchParams.get("detail") === "series";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = [50, 100, 200].includes(parseInt(searchParams.get("limit") ?? "100", 10))
    ? parseInt(searchParams.get("limit") ?? "100", 10)
    : 100;

  const [seriesConfig, setSeriesConfig] = useState<ExaminationScriptSeriesConfigRow[]>([]);
  const [listResponse, setListResponse] = useState<ScriptControlSchoolStatusListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [schoolSearch, setSchoolSearch] = useState(searchParams.get("school_q") ?? "");
  const debouncedSchoolQ = useDebounced(schoolSearch, 350);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [schoolOptions, setSchoolOptions] = useState<School[]>([]);
  const [schoolSearchLoading, setSchoolSearchLoading] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const q = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") q.delete(k);
        else q.set(k, v);
      }
      router.replace(`/dashboard/admin/script-control?${q.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (examId === null || sessionRestored) return;
    if (subjectId && paperNumber) {
      setSessionRestored(true);
      return;
    }
    const prefs = readSessionPrefs(examId);
    if (prefs.subject || prefs.paper) {
      patchParams({
        subject: prefs.subject,
        paper: prefs.paper,
        page: "1",
      });
    }
    setSessionRestored(true);
  }, [examId, paperNumber, patchParams, sessionRestored, subjectId]);

  useEffect(() => {
    if (examId === null || !subjectId.trim() || !paperNumber.trim()) return;
    writeSessionPrefs(examId, subjectId, paperNumber);
  }, [examId, paperNumber, subjectId]);

  useEffect(() => {
    if (examId === null) {
      setSeriesConfig([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getExaminationScriptSeriesConfig(examId);
        if (!cancelled) setSeriesConfig(cfg.items);
      } catch {
        if (!cancelled) setSeriesConfig([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const listParams = useMemo(() => {
    if (examId === null) return null;
    const sid = subjectId.trim() ? parseInt(subjectId, 10) : NaN;
    const pn = paperNumber.trim() ? parseInt(paperNumber, 10) : NaN;
    if (!Number.isFinite(sid) || !Number.isFinite(pn)) return null;
    return {
      examination_id: examId,
      subject_id: sid,
      paper_number: pn,
      region: region.trim() || undefined,
      zone: zone.trim() || undefined,
      school_q: debouncedSchoolQ.trim().length >= 2 ? debouncedSchoolQ.trim() : undefined,
      status: statusFilter,
      skip: (page - 1) * pageSize,
      limit: pageSize,
    };
  }, [debouncedSchoolQ, examId, page, pageSize, paperNumber, region, statusFilter, subjectId, zone]);

  const fetchRecords = useCallback(async () => {
    if (!listParams) {
      setListResponse(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res =
        recordType === "regular"
          ? await getScriptControlSchoolStatus(listParams)
          : await getIrregularScriptControlSchoolStatus(listParams);
      setListResponse(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load records");
      setListResponse(null);
    } finally {
      setLoading(false);
    }
  }, [listParams, recordType]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    if (!schoolPickerOpen || debouncedSchoolQ.trim().length < 2) {
      setSchoolOptions([]);
      return;
    }
    let cancelled = false;
    setSchoolSearchLoading(true);
    const q = new URLSearchParams({ skip: "0", limit: "30", q: debouncedSchoolQ.trim() });
    if (region.trim()) q.set("region", region.trim());
    if (zone.trim()) q.set("zone", zone.trim());
    (async () => {
      try {
        const data = await apiJson<SchoolListResponse>(`/schools?${q}`);
        if (!cancelled) setSchoolOptions(data.items);
      } catch {
        if (!cancelled) setSchoolOptions([]);
      } finally {
        if (!cancelled) setSchoolSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSchoolQ, region, schoolPickerOpen, zone]);

  const viewRows = useMemo(() => (listResponse?.items ?? []).map(statusRowToViewRow), [listResponse]);

  const maxSeries = useMemo(() => {
    const fromConfig = seriesConfig.find((c) => c.subject_id === parseInt(subjectId, 10))?.series_count;
    if (fromConfig) return fromConfig;
    const fromItems = listResponse?.items.flatMap((i) => i.series_items.map((s) => s.series_number)) ?? [];
    return Math.max(1, ...fromItems, 1);
  }, [listResponse, seriesConfig, subjectId]);

  const pn = parseInt(paperNumber, 10);
  const totalHeader = Number.isFinite(pn) && pn === 1 ? "Total scannables" : "Total booklets";

  const editHrefForSchool = useCallback(
    (schoolId: string, extra?: Record<string, string | undefined>) =>
      `/dashboard/admin/script-control/edit${buildScriptControlQuery({
        exam: examId,
        type: recordType,
        extra: {
          school: schoolId,
          subject: subjectId || undefined,
          paper: paperNumber || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          ...extra,
        },
      })}`,
    [examId, paperNumber, recordType, statusFilter, subjectId],
  );

  const filteredSeriesConfig = useMemo(
    () => filterSeriesConfigBySubjectType(seriesConfig, subjectTypeFilter),
    [seriesConfig, subjectTypeFilter],
  );

  const subjectOptions = useMemo(
    () =>
      filteredSeriesConfig.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [filteredSeriesConfig],
  );

  useEffect(() => {
    if (!subjectId.trim() || subjectTypeFilter === "all") return;
    const match = seriesConfig.find((s) => String(s.subject_id) === subjectId);
    if (match && match.subject_type !== subjectTypeFilter) {
      patchParams({ subject: undefined, page: "1" });
    }
  }, [patchParams, seriesConfig, subjectId, subjectTypeFilter]);

  const total = listResponse?.total ?? 0;
  const sc = listResponse?.status_counts;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject type
            </label>
            <SearchableCombobox
              options={SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              value={subjectTypeFilter}
              onChange={(v) =>
                patchParams({
                  subject_type: v === "all" ? undefined : v,
                  subject: undefined,
                  page: "1",
                })
              }
              placeholder="All types"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectId}
              onChange={(v) => patchParams({ subject: v, page: "1" })}
              placeholder="Select subject…"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paper <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={[
                { value: "1", label: "Paper 1" },
                { value: "2", label: "Paper 2" },
              ]}
              value={paperNumber}
              onChange={(v) => patchParams({ paper: v, page: "1" })}
              placeholder="Select paper…"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
        </div>

        <ScriptControlSchoolFilters
          mode="view"
          region={region}
          zone={zone}
          onRegionChange={(v) => patchParams({ region: v, page: "1" })}
          onZoneChange={(v) => patchParams({ zone: v, page: "1" })}
          schoolSearch={schoolSearch}
          schoolPickerOpen={schoolPickerOpen}
          onSchoolPickerOpenChange={setSchoolPickerOpen}
          onSchoolSearchChange={(v) => {
            setSchoolSearch(v);
            patchParams({ school_q: v.length >= 2 ? v : undefined, page: "1" });
          }}
          onClearSchoolSearch={() => {
            setSchoolSearch("");
            patchParams({ school_q: undefined, page: "1" });
            setSchoolPickerOpen(false);
          }}
          onSelectSchool={(code, label) => {
            setSchoolSearch(label);
            patchParams({ school_q: code, page: "1" });
            setSchoolPickerOpen(false);
          }}
          schoolOptions={schoolOptions}
          schoolSearchLoading={schoolSearchLoading}
        />

        {listParams ? (
          <ScriptControlStatusTabs
            active={statusFilter}
            counts={sc}
            onChange={(status) =>
              patchParams({ status: status === "all" ? undefined : status, page: "1" })
            }
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => patchParams({ detail: showSeriesColumns ? undefined : "series" })}
            disabled={!listParams}
          >
            {showSeriesColumns ? "Compact view" : "Show series columns"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={exporting || !listParams}
            onClick={() => {
              if (!listParams) return;
              void (async () => {
                setExporting(true);
                try {
                  const payload = {
                    mode: "summary" as const,
                    examination_id: listParams.examination_id,
                    subject_id: listParams.subject_id,
                    paper_number: listParams.paper_number,
                    region: listParams.region,
                    zone: listParams.zone,
                    school_q: listParams.school_q,
                  };
                  const filename = `worked_scripts_export.xlsx`;
                  if (recordType === "regular") await downloadScriptControlExport(payload, filename);
                  else await downloadIrregularScriptControlExport(payload, filename);
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Export failed");
                } finally {
                  setExporting(false);
                }
              })();
            }}
          >
            {exporting ? "Exporting…" : "Export summary"}
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {examId === null ? (
        <p className="text-sm text-muted-foreground">Select an examination above.</p>
      ) : !listParams ? (
        <p className="text-sm text-muted-foreground">Select a subject and paper to load the grid.</p>
      ) : (
        <div className="space-y-3">
          {sc ? (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sc.total}</span> schools with registrations
            </p>
          ) : null}
          <ScriptControlViewTable
            rows={viewRows}
            maxSeries={maxSeries}
            paperNumber={pn}
            totalHeader={totalHeader}
            showSeriesColumns={showSeriesColumns}
            loading={loading}
            emptyMessage={statusFilterEmptyMessage(statusFilter)}
            editHrefForSchool={(id) => editHrefForSchool(id)}
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => patchParams({ page: String(p) })}
            onPageSizeChange={(size) => patchParams({ limit: String(size), page: "1" })}
          />
        </div>
      )}
    </div>
  );
}
