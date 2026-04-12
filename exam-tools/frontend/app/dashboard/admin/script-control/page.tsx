"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Check, ChevronsUpDown } from "lucide-react";

import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  apiJson,
  getExaminationScriptSeriesConfig,
  getScriptControlAdminRecords,
  type Examination,
  type ExaminationScriptSeriesConfigRow,
  type School,
  type SchoolListResponse,
  type ScriptControlAdminListResponse,
  type ScriptControlAdminRow,
} from "@/lib/api";
import { REGION_OPTIONS, ZONE_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type MergedRow = {
  examination_id: number;
  school_id: string;
  school_code: string;
  school_name: string;
  region: string;
  zone: string;
  subject_id: number;
  subject_code: string;
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
        subject_name: it.subject_name,
        paper_number: it.paper_number,
        bySeries: {},
      };
      map.set(key, row);
    }
    row.bySeries[it.series_number] = it;
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.region !== b.region) return a.region.localeCompare(b.region);
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    if (a.school_code !== b.school_code) return a.school_code.localeCompare(b.school_code);
    if (a.subject_code !== b.subject_code) return a.subject_code.localeCompare(b.subject_code);
    return a.paper_number - b.paper_number;
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type ComboboxProps = {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  widthClass?: string;
  /** When false, the list has no “All” row; the user must pick an option. */
  showAllOption?: boolean;
};

function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText = "No match.",
  widthClass = "w-[280px]",
  showAllOption = true,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", widthClass)}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", widthClass)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {showAllOption ? (
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === "" ? "opacity-100" : "opacity-0")} />
                  All
                </CommandItem>
              ) : null}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 size-4", value === opt.value ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function AdminScriptControlPage() {
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

  const fetchRecords = useCallback(async () => {
    if (examId === null) return;
    const sid = subjectId.trim() ? parseInt(subjectId, 10) : NaN;
    const pn = paperNumber.trim() ? parseInt(paperNumber, 10) : NaN;
    if (!Number.isFinite(sid) || !Number.isFinite(pn)) {
      setListResponse(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getScriptControlAdminRecords({
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
        skip: 0,
        limit: 500,
      });
      setListResponse(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load records");
      setListResponse(null);
    } finally {
      setLoading(false);
    }
  }, [debouncedSchoolSearch, examId, paperNumber, region, schoolId, subjectId, zone]);

  useEffect(() => {
    if (examId === null) return;
    const sid = subjectId.trim() ? parseInt(subjectId, 10) : NaN;
    const pn = paperNumber.trim() ? parseInt(paperNumber, 10) : NaN;
    if (!Number.isFinite(sid) || !Number.isFinite(pn)) return;
    void fetchRecords();
  }, [examId, fetchRecords]);

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

  const columns = useMemo<ColumnDef<MergedRow>[]>(() => {
    const base: ColumnDef<MergedRow>[] = [
      {
        accessorKey: "region",
        header: "Region",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.region}</span>,
      },
      {
        accessorKey: "zone",
        header: "Zone",
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.zone}</span>,
      },
      {
        id: "school",
        accessorFn: (row) => row.school_code,
        header: "School",
        cell: ({ row }) => (
          <div>
            <div className="font-medium tabular-nums">{row.original.school_code}</div>
            <div className="max-w-[14rem] text-muted-foreground">{row.original.school_name}</div>
          </div>
        ),
      },
      {
        id: "subject",
        accessorFn: (row) => row.subject_code,
        header: "Subject",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.subject_code}</div>
            <div className="max-w-[12rem] text-muted-foreground">{row.original.subject_name}</div>
          </div>
        ),
      },
      {
        accessorKey: "paper_number",
        header: "Paper",
        cell: ({ row }) => <span className="tabular-nums">{row.original.paper_number}</span>,
      },
    ];
    for (let sn = 1; sn <= maxSeriesColumns; sn++) {
      base.push({
        id: `series_${sn}`,
        accessorFn: (row) => row.bySeries[sn]?.total_booklets ?? Number.MAX_SAFE_INTEGER,
        header: `Series ${sn}`,
        cell: ({ row }) => {
          const block = row.original.bySeries[sn];
          if (!block?.envelopes?.length) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <ul className="max-w-[12rem] space-y-1 text-xs">
              {block.envelopes.map((e) => (
                <li key={e.envelope_number} className="flex flex-wrap items-center gap-1">
                  <span className="tabular-nums">
                    Env {e.envelope_number}: {e.booklet_count}
                  </span>
                  {e.verified ? (
                    <Badge variant="secondary" className="text-[10px]">
                      OK
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          );
        },
      });
    }
    return base;
  }, [maxSeriesColumns]);

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

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Worked scripts control</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Script envelopes by school, subject, and paper. Choose an examination, then a subject and paper; other
          filters are optional.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
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
        <DataTable table={table} emptyMessage={loading ? "Loading…" : "No packing records for this filter."} />
      )}
    </div>
  );
}
