"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronsUpDown, Minus, Plus } from "lucide-react";

import { DataTable, type DataTableColumnMeta } from "@/components/data-table";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  apiJson,
  downloadIrregularScriptControlExport,
  downloadScriptControlExport,
  getExaminationScriptSeriesConfig,
  getIrregularScriptControlAdminRecords,
  getScriptControlAdminRecords,
  type Examination,
  type ExaminationScriptSeriesConfigRow,
  type School,
  type SchoolListResponse,
  type ScriptControlAdminListResponse,
  type ScriptControlAdminRow,
} from "@/lib/api";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";

type MergedRow = {
  examination_id: number;
  school_id: string;
  school_code: string;
  school_name: string;
  region: string;
  zone: string;
  subject_id: number;
  subject_code: string;
  subject_original_code: string | null;
  subject_name: string;
  paper_number: number;
  bySeries: Record<number, ScriptControlAdminRow>;
};

function mergeRows(items: ScriptControlAdminRow[]): MergedRow[] {
  const map = new Map<string, MergedRow>();
  for (const it of items) {
    const key = `${it.school_id}:${it.subject_id}:${it.paper_number}`;
    let row = map.get(key);
    if (!row) {
      row = {
        examination_id: it.examination_id,
        school_id: it.school_id,
        school_code: it.school_code,
        school_name: it.school_name,
        region: it.region,
        zone: it.zone,
        subject_id: it.subject_id,
        subject_code: it.subject_code,
        subject_original_code: it.subject_original_code ?? null,
        subject_name: it.subject_name,
        paper_number: it.paper_number,
        bySeries: {},
      };
      map.set(key, row);
    }
    row.bySeries[it.series_number] = it;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.school_code !== b.school_code) return a.school_code.localeCompare(b.school_code);
    if ((a.subject_original_code ?? a.subject_code) !== (b.subject_original_code ?? b.subject_code)) {
      return (a.subject_original_code ?? a.subject_code).localeCompare(b.subject_original_code ?? b.subject_code);
    }
    return a.paper_number - b.paper_number;
  });
}

/** Aligns with SeriesEnvelopeCell / API total_booklets vs envelope sums. */
function seriesBlockBookletTotal(block: ScriptControlAdminRow | undefined): number {
  if (!block) return 0;
  const envs = block.envelopes ?? [];
  if (envs.length === 0) return 0;
  return block.total_booklets ?? envs.reduce((acc, e) => acc + e.booklet_count, 0);
}

function mergedRowTotalBooklets(row: MergedRow, maxSeries: number): number {
  let sum = 0;
  for (let s = 1; s <= maxSeries; s++) {
    sum += seriesBlockBookletTotal(row.bySeries[s]);
  }
  return sum;
}

function registeredCandidatesLookupKey(row: MergedRow): string {
  return `${row.examination_id}:${row.school_id}:${row.subject_id}`;
}

function mergedRowKey(row: MergedRow): string {
  return `${row.school_id}:${row.subject_id}:${row.paper_number}`;
}

function mergedRowHasEnvelopes(row: MergedRow, maxSeries: number): boolean {
  for (let s = 1; s <= maxSeries; s++) {
    if (row.bySeries[s]?.envelopes?.length) return true;
  }
  return false;
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Full-column fills: school / subject–paper / alternating series / totals / registered. */
const SCRIPT_TABLE_META = {
  expand: {
    headerClassName: "border-border w-10 border-r bg-background px-1 py-3",
    cellClassName: "border-border w-10 border-r bg-background px-1 py-2 align-middle",
    footerClassName: "border-border w-10 border-r bg-background px-1 py-3",
  },
  school: {
    headerClassName:
      "border-border bg-muted/80 text-left font-semibold dark:bg-muted/50 border-r px-3 py-3",
    cellClassName: "border-border bg-muted/60 dark:bg-muted/40 border-r px-3 py-2",
    footerClassName:
      "border-border bg-muted/80 text-muted-foreground dark:bg-muted/50 border-r px-3 py-3 text-xs",
  },
  subjectPaper: {
    headerClassName:
      "border-border bg-muted/50 text-left text-xs font-semibold dark:bg-muted/35 border-r px-3 py-3",
    cellClassName: "border-border bg-muted/40 dark:bg-muted/30 border-r px-3 py-2",
    footerClassName: "border-border bg-muted/50 dark:bg-muted/35 border-r px-3 py-3",
  },
  /** Alternating stripes for S1 / S2 / S3… — low-chroma neutrals (easier on long sessions than saturated hues). */
  seriesA: {
    headerClassName:
      "border-border border-r bg-muted/70 px-2 py-3 text-right text-xs font-semibold dark:bg-muted/45",
    cellClassName:
      "border-border border-r bg-muted/60 min-w-0 max-w-[7.5rem] align-top px-2 py-2 text-right dark:bg-muted/38",
    footerClassName:
      "border-border border-r bg-muted/70 px-2 py-3 text-right text-sm font-medium tabular-nums dark:bg-muted/45",
  },
  seriesB: {
    headerClassName:
      "border-border border-r bg-muted/50 px-2 py-3 text-right text-xs font-semibold dark:bg-muted/32",
    cellClassName:
      "border-border border-r bg-muted/40 min-w-0 max-w-[7.5rem] align-top px-2 py-2 text-right dark:bg-muted/28",
    footerClassName:
      "border-border border-r bg-muted/50 px-2 py-3 text-right text-sm font-medium tabular-nums dark:bg-muted/32",
  },
  total: {
    headerClassName:
      "border-border border-r bg-slate-100/95 px-3 py-3 text-right font-semibold dark:bg-slate-900/55",
    cellClassName: "border-border border-r bg-slate-50/90 px-3 py-2 text-right dark:bg-slate-950/40",
    footerClassName:
      "border-border border-r bg-slate-100/95 px-3 py-3 text-right font-semibold tabular-nums dark:bg-slate-900/55",
  },
  registered: {
    headerClassName:
      "bg-emerald-50/85 px-3 py-3 text-right font-semibold dark:bg-emerald-950/35",
    cellClassName: "bg-emerald-50/55 px-3 py-2 text-right dark:bg-emerald-950/28",
    footerClassName: "bg-emerald-50/85 px-3 py-3 dark:bg-emerald-950/35",
  },
} satisfies Record<string, DataTableColumnMeta>;

function seriesColumnMeta(sn: number): DataTableColumnMeta {
  return sn % 2 === 1 ? SCRIPT_TABLE_META.seriesA : SCRIPT_TABLE_META.seriesB;
}

function SeriesEnvelopeCell({
  row,
  seriesNumber,
  expanded,
}: {
  row: MergedRow;
  seriesNumber: number;
  expanded: boolean;
}) {
  const block = row.bySeries[seriesNumber];
  if (!block?.envelopes?.length) {
    return <span className="text-muted-foreground">—</span>;
  }
  const envs = block.envelopes;
  const total = seriesBlockBookletTotal(block);

  if (!expanded) {
    return (
      <span className="inline-block min-w-0 max-w-full tabular-nums text-sm font-medium text-foreground">{total}</span>
    );
  }
  return (
    <div className="w-full min-w-0 max-w-[7.5rem] text-left text-xs">
      <ul className="max-h-52 space-y-2 overflow-y-auto overflow-x-hidden border-l border-border/80 pl-2">
        {envs.map((e) => (
          <li key={e.envelope_number} className="flex flex-col items-start gap-1 text-[11px] leading-snug">
            <span className="w-full break-words tabular-nums text-muted-foreground">
              Env {e.envelope_number}: {e.booklet_count}
            </span>
            {e.verified ? (
              <Badge variant="secondary" className="w-fit shrink-0 text-[10px]">
                OK
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminScriptControlPage() {
  const [recordType, setRecordType] = useState<"regular" | "irregular">("regular");
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [seriesConfig, setSeriesConfig] = useState<ExaminationScriptSeriesConfigRow[]>([]);
  const [listResponse, setListResponse] = useState<ScriptControlAdminListResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [subjectId, setSubjectId] = useState("");
  const [paperNumber, setPaperNumber] = useState("");
  const [region, setRegion] = useState("");
  const [zone, setZone] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const debouncedSchoolSearch = useDebounced(schoolSearch, 350);
  const [schoolOptions, setSchoolOptions] = useState<School[]>([]);
  const [schoolSearchLoading, setSchoolSearchLoading] = useState(false);
  const [schoolPickerOpen, setSchoolPickerOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [expandedEnvelopeRows, setExpandedEnvelopeRows] = useState<Set<string>>(() => new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setExpandedEnvelopeRows(new Set());
  }, [listResponse]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiJson<Examination[]>("/examinations");
        if (!cancelled) setExams(data);
      } catch {
        if (!cancelled) setExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSeriesConfig = useCallback(async (id: number) => {
    const cfg = await getExaminationScriptSeriesConfig(id);
    setSeriesConfig(cfg.items);
  }, []);

  useEffect(() => {
    if (examId === null) {
      setSeriesConfig([]);
      setListResponse(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadSeriesConfig(examId);
      } catch {
        if (!cancelled) setSeriesConfig([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId, loadSeriesConfig]);

  const scriptControlListParams = useMemo(() => {
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
      school_id: schoolId.trim() || undefined,
      school_q:
        schoolId.trim() || debouncedSchoolSearch.trim().length < 2
          ? undefined
          : debouncedSchoolSearch.trim(),
    };
  }, [debouncedSchoolSearch, examId, paperNumber, region, schoolId, subjectId, zone]);

  const fetchRecords = useCallback(async () => {
    if (!scriptControlListParams) {
      setListResponse(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const params = { ...scriptControlListParams, skip: 0, limit: 500 };
      const res =
        recordType === "regular"
          ? await getScriptControlAdminRecords(params)
          : await getIrregularScriptControlAdminRecords(params);
      setListResponse(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load records");
      setListResponse(null);
    } finally {
      setLoading(false);
    }
  }, [recordType, scriptControlListParams]);

  const handleExport = useCallback(
    async (mode: "summary" | "detail") => {
      if (!scriptControlListParams || examId === null) return;
      const sid = scriptControlListParams.subject_id;
      const pn = scriptControlListParams.paper_number;
      const subRow = seriesConfig.find((c) => c.subject_id === sid);
      const subCode =
        subRow?.subject_code ?? listResponse?.items?.[0]?.subject_original_code ?? listResponse?.items?.[0]?.subject_code ?? `subject_${sid}`;
      const ex = exams.find((e) => e.id === examId);
      const examPart =
        ex != null
          ? `${ex.year}_${ex.exam_type}`.replace(/[^A-Za-z0-9._-]+/g, "_")
          : `exam_${examId}`;
      const safeSub = subCode.replace(/[^A-Za-z0-9._-]+/g, "_");
      const prefix = recordType === "regular" ? "worked_scripts" : "irregular_worked_scripts";
      const filename = `${prefix}_${examPart}_${safeSub}_P${pn}_${mode}.xlsx`;
      setExporting(true);
      setLoadError(null);
      try {
        const payload = {
          mode,
          examination_id: scriptControlListParams.examination_id,
          subject_id: sid,
          paper_number: pn,
          school_id: scriptControlListParams.school_id,
          region: scriptControlListParams.region,
          zone: scriptControlListParams.zone,
          school_q: scriptControlListParams.school_q,
        };
        if (recordType === "regular") await downloadScriptControlExport(payload, filename);
        else await downloadIrregularScriptControlExport(payload, filename);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Export failed");
      } finally {
        setExporting(false);
      }
    },
    [examId, exams, listResponse?.items, recordType, scriptControlListParams, seriesConfig],
  );

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    if (!schoolPickerOpen || debouncedSchoolSearch.trim().length < 2) {
      setSchoolOptions([]);
      return;
    }
    let cancelled = false;
    setSchoolSearchLoading(true);
    (async () => {
      try {
        const data = await apiJson<SchoolListResponse>(
          `/schools?skip=0&limit=30&q=${encodeURIComponent(debouncedSchoolSearch.trim())}`,
        );
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
  }, [debouncedSchoolSearch, schoolPickerOpen]);

  const mergedRows = useMemo(() => {
    if (!listResponse?.items.length) return [];
    return mergeRows(listResponse.items);
  }, [listResponse]);

  const maxSeriesColumns = useMemo(() => {
    if (seriesConfig.length === 0) {
      const fromItems = listResponse?.items.map((i) => i.series_number) ?? [];
      return Math.max(1, ...fromItems, 1);
    }
    return Math.max(1, ...seriesConfig.map((c) => c.series_count));
  }, [listResponse, seriesConfig]);

  const subjectOptions = useMemo(
    () =>
      seriesConfig.map((s) => ({
        value: String(s.subject_id),
        label: `${s.subject_code} — ${s.subject_name}`,
      })),
    [seriesConfig],
  );

  /** Examinations use paper 1 and paper 2 only. */
  const paperOptions = useMemo(
    () => [
      { value: "1", label: "Paper 1" },
      { value: "2", label: "Paper 2" },
    ],
    [],
  );

  const regionOptions = useMemo(
    () => REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label })),
    [],
  );
  const zoneOptions = useMemo(
    () => ZONE_OPTIONS.map((z) => ({ value: z.value, label: z.label })),
    [],
  );

  const totalBookletsFooter = useMemo(() => {
    let sum = 0;
    for (const row of mergedRows) {
      sum += mergedRowTotalBooklets(row, maxSeriesColumns);
    }
    return sum;
  }, [mergedRows, maxSeriesColumns]);

  const seriesGrandTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (let s = 1; s <= maxSeriesColumns; s++) {
      totals[s] = 0;
    }
    for (const row of mergedRows) {
      for (let s = 1; s <= maxSeriesColumns; s++) {
        totals[s] += seriesBlockBookletTotal(row.bySeries[s]);
      }
    }
    return totals;
  }, [mergedRows, maxSeriesColumns]);

  const columns = useMemo<ColumnDef<MergedRow>[]>(() => {
    const regByKey = listResponse?.registered_candidates_by_school_subject;
    const base: ColumnDef<MergedRow>[] = [
      {
        id: "expandEnvelopes",
        enableSorting: false,
        header: () => <span className="sr-only">Envelope details</span>,
        meta: SCRIPT_TABLE_META.expand,
        cell: ({ row }) => {
          const r = row.original;
          if (!mergedRowHasEnvelopes(r, maxSeriesColumns)) {
            return <span className="inline-block w-8 shrink-0" aria-hidden />;
          }
          const key = mergedRowKey(r);
          const isOpen = expandedEnvelopeRows.has(key);
          return (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-primary/85 hover:bg-primary/10 hover:text-primary"
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? "Collapse envelope details for this school"
                  : "Expand envelope details for this school"
              }
              onClick={() => {
                setExpandedEnvelopeRows((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
            >
              {isOpen ? <Minus className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            </Button>
          );
        },
        footer: () => null,
      },
      {
        id: "school_code",
        accessorFn: (row) => row.school_code,
        header: "School code",
        meta: SCRIPT_TABLE_META.school,
        cell: ({ row }) => {
          const r = row.original;
          const name = r.school_name.trim();
          return (
            <span
              className="font-mono text-sm font-medium tracking-tight text-foreground"
              title={name ? name : undefined}
              aria-label={name ? `${r.school_code}, ${name}` : r.school_code}
            >
              {r.school_code}
            </span>
          );
        },
        footer: () => <span className="font-medium">Totals</span>,
      },
      {
        id: "subject",
        accessorFn: (row) => row.subject_code,
        header: "Subject",
        meta: SCRIPT_TABLE_META.subjectPaper,
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-medium text-foreground">{row.original.subject_original_code ?? row.original.subject_code}</span>
        ),
        footer: () => null,
      },
      {
        accessorKey: "paper_number",
        header: "Paper",
        meta: SCRIPT_TABLE_META.subjectPaper,
        cell: ({ row }) => <span className="tabular-nums font-medium">{row.original.paper_number}</span>,
        footer: () => null,
      },
    ];

    for (let sn = 1; sn <= maxSeriesColumns; sn++) {
      base.push({
        id: `series_${sn}`,
        accessorFn: (row) => seriesBlockBookletTotal(row.bySeries[sn]),
        header: () => (
          <abbr
            title={`Series ${sn} — booklets packed in this script batch`}
            className="cursor-help whitespace-nowrap font-semibold no-underline tabular-nums tracking-tight"
          >
            S{sn}
          </abbr>
        ),
        meta: seriesColumnMeta(sn),
        cell: ({ row }) => (
          <SeriesEnvelopeCell
            row={row.original}
            seriesNumber={sn}
            expanded={expandedEnvelopeRows.has(mergedRowKey(row.original))}
          />
        ),
        footer: () => (
          <span className="tabular-nums text-foreground">{seriesGrandTotals[sn] ?? 0}</span>
        ),
      });
    }

    base.push(
      {
        id: "series_total_booklets",
        accessorFn: (row) => mergedRowTotalBooklets(row, maxSeriesColumns),
        header: "Total booklets",
        meta: SCRIPT_TABLE_META.total,
        cell: ({ row }) => (
          <span className="tabular-nums text-base font-semibold text-foreground">
            {mergedRowTotalBooklets(row.original, maxSeriesColumns)}
          </span>
        ),
        footer: () => <span>{totalBookletsFooter}</span>,
      },
      {
        id: "registered_candidates",
        enableSorting: false,
        header: "Registered",
        meta: SCRIPT_TABLE_META.registered,
        cell: ({ row }) => {
          const r = row.original;
          const n = regByKey?.[registeredCandidatesLookupKey(r)];
          return n != null ? (
            <span className="tabular-nums text-base font-semibold text-foreground">{n}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
        footer: () => null,
      },
    );

    return base;
  }, [
    listResponse?.registered_candidates_by_school_subject,
    maxSeriesColumns,
    seriesGrandTotals,
    expandedEnvelopeRows,
    totalBookletsFooter,
  ]);

  const table = useReactTable({
    data: mergedRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedSchoolLabel = useMemo(() => {
    if (!schoolId) return "";
    const fromData = listResponse?.items.find((i) => i.school_id === schoolId);
    if (fromData) return `${fromData.school_code} — ${fromData.school_name}`;
    const fromOpts = schoolOptions.find((s) => s.id === schoolId);
    return fromOpts ? `${fromOpts.code} — ${fromOpts.name}` : schoolId;
  }, [listResponse, schoolId, schoolOptions]);

  /** Shown above the grid when filters are complete so the table is self-explanatory. */
  const activeViewSummary = useMemo(() => {
    if (examId === null) return null;
    const ex = exams.find((e) => e.id === examId);
    if (!ex) return null;
    const sid = subjectId.trim();
    const pn = paperNumber.trim();
    if (!sid || !pn) return null;
    const subj = subjectOptions.find((o) => o.value === sid);
    const examLabel = `${ex.exam_type}${ex.exam_series ? ` (${ex.exam_series})` : ""} — ${ex.year}`;
    const paperLabel = pn === "1" ? "Paper 1" : pn === "2" ? "Paper 2" : `Paper ${pn}`;
    return {
      examLabel,
      subjectLabel: subj?.label ?? `Subject ${sid}`,
      paperLabel,
    };
  }, [examId, exams, subjectId, subjectOptions, paperNumber]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          {recordType === "regular" ? "Worked scripts control" : "Irregular worked scripts control"}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">

          <span className="font-medium text-foreground">+</span> to open envelope detail. Region, zone, and school
          filters are optional.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={recordType === "regular" ? "default" : "outline"}
            onClick={() => setRecordType("regular")}
          >
            Regular records
          </Button>
          <Button
            type="button"
            variant={recordType === "irregular" ? "default" : "outline"}
            onClick={() => setRecordType("irregular")}
          >
            Irregular records
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Examination
            </label>
            <select
              className="flex h-9 w-full rounded-md border border-input-border bg-background px-3 text-sm"
              value={examId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setExamId(v ? parseInt(v, 10) : null);
                setSubjectId("");
                setPaperNumber("");
                setRegion("");
                setZone("");
                setSchoolId("");
                setSchoolSearch("");
                setListResponse(null);
                setLoadError(null);
              }}
            >
              <option value="">Select examination…</option>
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.exam_type} {ex.exam_series ? `(${ex.exam_series})` : ""} — {ex.year}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 lg:col-span-1">
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectId}
              onChange={setSubjectId}
              placeholder="Select subject…"
              searchPlaceholder="Search code or name…"
              emptyText="No subject on timetable."
              widthClass="w-full min-w-0 sm:w-[320px]"
              showAllOption={false}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Paper <span className="text-destructive">*</span>
            </label>
            <SearchableCombobox
              options={paperOptions}
              value={paperNumber}
              onChange={setPaperNumber}
              placeholder="Select paper…"
              searchPlaceholder="Search paper…"
              widthClass="w-full min-w-0 sm:w-[200px]"
              showAllOption={false}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Region
            </label>
            <SearchableCombobox
              options={regionOptions}
              value={region}
              onChange={setRegion}
              placeholder="All regions"
              searchPlaceholder="Search region…"
              widthClass="w-full min-w-0 sm:w-[260px]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Zone
            </label>
            <SearchableCombobox
              options={zoneOptions}
              value={zone}
              onChange={setZone}
              placeholder="All zones"
              searchPlaceholder="Search zone…"
              widthClass="w-full min-w-0 sm:w-[220px]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              School
            </label>
            <Popover
              open={schoolPickerOpen}
              onOpenChange={(o) => {
                setSchoolPickerOpen(o);
                if (!o) setSchoolSearch("");
              }}
            >
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal sm:w-[320px]">
                  <span className="truncate">{schoolId ? selectedSchoolLabel || schoolId : "Search school…"}</span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[min(100vw-2rem,380px)] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type code or name (min 2 chars)…"
                    value={schoolSearch}
                    onValueChange={setSchoolSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {schoolSearchLoading
                        ? "Loading…"
                        : schoolSearch.trim().length < 2
                          ? "Type at least 2 characters."
                          : "No schools found."}
                    </CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__clear__"
                        onSelect={() => {
                          setSchoolId("");
                          setSchoolSearch("");
                          setSchoolPickerOpen(false);
                        }}
                      >
                        Clear school filter
                      </CommandItem>
                      {schoolOptions.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.code} ${s.name}`}
                          onSelect={() => {
                            setSchoolId(s.id);
                            setSchoolSearch("");
                            setSchoolPickerOpen(false);
                          }}
                        >
                          <span className="font-mono text-xs">{s.code}</span>
                          <span className="ml-2 truncate text-muted-foreground">{s.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void fetchRecords()}
            disabled={
              examId === null ||
              loading ||
              !Number.isFinite(parseInt(subjectId.trim(), 10)) ||
              !Number.isFinite(parseInt(paperNumber.trim(), 10))
            }
          >
            Refresh
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExport("summary")}
            disabled={
              examId === null ||
              loading ||
              exporting ||
              !scriptControlListParams
            }
          >
            Export summary (Excel)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleExport("detail")}
            disabled={
              examId === null ||
              loading ||
              exporting ||
              !scriptControlListParams
            }
          >
            Export detail (Excel)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setRegion("");
              setZone("");
              setSchoolId("");
              setSchoolSearch("");
              void fetchRecords();
            }}
            disabled={
              examId === null ||
              loading ||
              !Number.isFinite(parseInt(subjectId.trim(), 10)) ||
              !Number.isFinite(parseInt(paperNumber.trim(), 10))
            }
          >
            Clear optional filters
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      {examId === null ? (
        <p className="text-sm text-muted-foreground">Select an examination to load script packing records.</p>
      ) : !Number.isFinite(parseInt(subjectId.trim(), 10)) || !Number.isFinite(parseInt(paperNumber.trim(), 10)) ? (
        <p className="text-sm text-muted-foreground">Select a subject and paper to load script packing records.</p>
      ) : loading && !listResponse ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {listResponse && activeViewSummary ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">View</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-foreground">
                {activeViewSummary.examLabel}
              </span>
              <span className="text-muted-foreground">·</span>
              <span
                className="max-w-[min(100%,28rem)] truncate font-medium text-foreground"
                title={activeViewSummary.subjectLabel}
              >
                {activeViewSummary.subjectLabel}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium text-foreground">{activeViewSummary.paperLabel}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {mergedRows.length} school{mergedRows.length === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
          {mergedRows.length > 0 ? (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border/60 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground"
              role="note"
              aria-label="Column colour key"
            >
              <span className="font-semibold text-foreground">Colours</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm bg-muted/80 ring-1 ring-border/60" />
                School / subject
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex h-3.5 w-8 shrink-0 overflow-hidden rounded-sm ring-1 ring-border/50">
                  <span className="h-full flex-1 bg-muted/70 dark:bg-muted/45" />
                  <span className="h-full flex-1 bg-muted/45 dark:bg-muted/30" />
                </span>
                S1–S{maxSeriesColumns}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm bg-slate-100 ring-1 ring-border/40 dark:bg-slate-900/55" />
                Total booklets
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm bg-emerald-50/90 ring-1 ring-border/40 dark:bg-emerald-950/40" />
                Registered
              </span>
            </div>
          ) : null}
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <DataTable
              table={table}
              emptyMessage={loading ? "Loading…" : "No packing records for this filter."}
              showFooter={mergedRows.length > 0}
            />
          </div>
        </div>
      )}
    </div>
  );
}
