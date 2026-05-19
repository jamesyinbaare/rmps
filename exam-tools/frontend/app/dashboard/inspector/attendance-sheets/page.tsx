"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  deleteInspectorAttendanceSheet,
  downloadInspectorAttendanceSheet,
  getInspectorAttendanceScheduledDates,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  listInspectorAttendanceSheets,
  uploadInspectorAttendanceSheet,
  type AttendanceSheet,
  type Examination,
} from "@/lib/api";
import { inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";

const btnPrimary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnFilePicker =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg border border-input-border bg-muted/40 px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

const panelClass = "rounded-2xl border border-border bg-card p-4 sm:p-6";

type DateGroup = { date: string; sheets: AttendanceSheet[] };
type DateStatus = { date: string; sheets: AttendanceSheet[]; status: "uploaded" | "missing" };
type UploadDraft = { notes: string; file: File | null };

function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatExamDateLabel(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatUploadedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sortSheetsInGroup(items: AttendanceSheet[]): AttendanceSheet[] {
  return [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function groupSheetsByDate(items: AttendanceSheet[]): Map<string, AttendanceSheet[]> {
  const map = new Map<string, AttendanceSheet[]>();
  for (const sheet of items) {
    const list = map.get(sheet.examination_date) ?? [];
    list.push(sheet);
    map.set(sheet.examination_date, list);
  }
  for (const [date, sheets] of map) {
    map.set(date, sortSheetsInGroup(sheets));
  }
  return map;
}

function buildDateStatuses(scheduledDates: string[], sheetsByDate: Map<string, AttendanceSheet[]>): DateStatus[] {
  return scheduledDates.map((date) => {
    const sheets = sheetsByDate.get(date) ?? [];
    return {
      date,
      sheets,
      status: sheets.length > 0 ? ("uploaded" as const) : ("missing" as const),
    };
  });
}

function buildDateGroups(scheduledDates: string[], sheetsByDate: Map<string, AttendanceSheet[]>): DateGroup[] {
  return scheduledDates.map((date) => ({
    date,
    sheets: sheetsByDate.get(date) ?? [],
  }));
}

function shouldGroupDefaultOpen(
  date: string,
  sheets: AttendanceSheet[],
  todayIso: string,
  focusedDate: string | null,
): boolean {
  if (focusedDate === date) return true;
  if (date === todayIso) return true;
  if (sheets.length === 0) return true;
  return false;
}

function emptyDraft(): UploadDraft {
  return { notes: "", file: null };
}

type AttendanceSheetFileRowProps = {
  row: AttendanceSheet;
  downloadingId: string | null;
  deletingId: string | null;
  onDownload: (row: AttendanceSheet) => void;
  onDelete: (row: AttendanceSheet) => void;
};

function AttendanceSheetFileRow({
  row,
  downloadingId,
  deletingId,
  onDownload,
  onDelete,
}: AttendanceSheetFileRowProps) {
  const busy = downloadingId === row.id || deletingId === row.id;
  return (
    <article className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
      <p className="truncate text-sm font-semibold text-foreground" title={row.original_filename}>
        {row.original_filename}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">Uploaded {formatUploadedAt(row.created_at)}</p>
      {row.notes ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Note:</span> {row.notes}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className={btnSecondary} disabled={busy} onClick={() => onDownload(row)}>
          {downloadingId === row.id ? "…" : "Download"}
        </button>
        <button type="button" className={btnDanger} disabled={busy} onClick={() => onDelete(row)}>
          {deletingId === row.id ? "…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

type AttendanceDateOverviewProps = {
  statuses: DateStatus[];
  todayIso: string;
  onSelectDate: (date: string) => void;
};

function AttendanceDateOverview({ statuses, todayIso, onSelectDate }: AttendanceDateOverviewProps) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-xl border border-border/80">
      {statuses.map(({ date, sheets, status }) => {
        const isToday = date === todayIso;
        const countLabel =
          status === "uploaded"
            ? `${sheets.length} ${sheets.length === 1 ? "file" : "files"}`
            : "Missing";
        return (
          <li key={date}>
            <button
              type="button"
              onClick={() => onSelectDate(date)}
              className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span
                className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${status === "uploaded" ? "bg-success" : "border-2 border-muted-foreground/50 bg-transparent"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{formatExamDateLabel(date)}</span>
                {isToday ? (
                  <span className="mt-0.5 inline-block rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Today
                  </span>
                ) : null}
              </span>
              <span
                className={`shrink-0 text-xs font-medium tabular-nums ${status === "uploaded" ? "text-muted-foreground" : "text-destructive"}`}
              >
                {countLabel}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type AttendanceDateGroupProps = {
  group: DateGroup;
  todayIso: string;
  focusedDate: string | null;
  groupRef: (el: HTMLDetailsElement | null) => void;
  draft: UploadDraft;
  uploadBusy: boolean;
  downloadingId: string | null;
  deletingId: string | null;
  onDraftChange: (date: string, patch: Partial<UploadDraft>) => void;
  onUpload: (date: string, e: FormEvent) => void;
  onDownload: (row: AttendanceSheet) => void;
  onDelete: (row: AttendanceSheet) => void;
};

function AttendanceDateGroup({
  group,
  todayIso,
  focusedDate,
  groupRef,
  draft,
  uploadBusy,
  downloadingId,
  deletingId,
  onDraftChange,
  onUpload,
  onDownload,
  onDelete,
}: AttendanceDateGroupProps) {
  const { date, sheets } = group;
  const detailsElRef = useRef<HTMLDetailsElement | null>(null);
  const defaultOpen = shouldGroupDefaultOpen(date, sheets, todayIso, focusedDate);
  const fileCount = sheets.length;

  useEffect(() => {
    if (detailsElRef.current && defaultOpen) {
      detailsElRef.current.open = true;
    }
  }, [defaultOpen, date]);

  useEffect(() => {
    if (focusedDate === date && detailsElRef.current) {
      detailsElRef.current.open = true;
    }
  }, [focusedDate, date]);
  const countLabel = fileCount === 0 ? "No files" : `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
  const canSubmit = Boolean(draft.file && !uploadBusy);
  const cameraInputId = `attendance-camera-${date}`;
  const fileInputId = `attendance-file-${date}`;
  const notesInputId = `attendance-notes-${date}`;

  return (
    <details
      ref={(el) => {
        detailsElRef.current = el;
        groupRef(el);
      }}
      className="group rounded-2xl border border-border bg-card shadow-sm"
    >
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3.5 text-sm font-semibold text-foreground marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          {formatExamDateLabel(date)}
          {date === todayIso ? (
            <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              Today
            </span>
          ) : null}
          <span className="ml-2 font-normal text-muted-foreground">· {countLabel}</span>
        </span>
        <span className="text-xs font-normal text-muted-foreground">Tap to expand</span>
      </summary>

      <div className="space-y-3 border-t border-border px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
        {sheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendance sheet uploaded for this day yet.</p>
        ) : (
          <div className="space-y-2">
            {sheets.map((row) => (
              <AttendanceSheetFileRow
                key={row.id}
                row={row}
                downloadingId={downloadingId}
                deletingId={deletingId}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => onUpload(date, e)}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload for this day</p>
          <div>
            <label htmlFor={notesInputId} className={formLabelClass}>
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id={notesInputId}
              type="text"
              value={draft.notes}
              onChange={(e) => onDraftChange(date, { notes: e.target.value })}
              autoComplete="off"
              disabled={uploadBusy}
              className={`${formInputClass} min-h-11 text-base sm:text-sm`}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor={cameraInputId} className={btnFilePicker}>
              Take photo
            </label>
            <input
              id={cameraInputId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={uploadBusy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                onDraftChange(date, { file: f });
                e.target.value = "";
              }}
            />
            <label htmlFor={fileInputId} className={btnFilePicker}>
              Choose file
            </label>
            <input
              id={fileInputId}
              type="file"
              accept=".pdf,image/*"
              className="sr-only"
              disabled={uploadBusy}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                onDraftChange(date, { file: f });
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">PDF or image (PNG, JPG, WebP).</p>
          {draft.file ? (
            <p className="truncate text-xs font-medium text-foreground" title={draft.file.name}>
              Selected: {draft.file.name}
            </p>
          ) : null}
          <button type="submit" disabled={!canSubmit} className={btnPrimary}>
            {uploadBusy ? "Uploading…" : "Upload for this day"}
          </button>
        </form>
      </div>
    </details>
  );
}

export default function InspectorAttendanceSheetsPage() {
  const router = useRouter();
  const todayIso = useMemo(() => localTodayIso(), []);
  const [exam, setExam] = useState<Examination | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [centreLabel, setCentreLabel] = useState<string>("");
  const [scheduledDates, setScheduledDates] = useState<string[]>([]);
  const [items, setItems] = useState<AttendanceSheet[]>([]);
  const [draftByDate, setDraftByDate] = useState<Record<string, UploadDraft>>({});
  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadBusyDate, setUploadBusyDate] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const chooseFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sheetsByDate = useMemo(() => groupSheetsByDate(items), [items]);
  const dateStatuses = useMemo(
    () => buildDateStatuses(scheduledDates, sheetsByDate),
    [scheduledDates, sheetsByDate],
  );
  const dateGroups = useMemo(() => buildDateGroups(scheduledDates, sheetsByDate), [scheduledDates, sheetsByDate]);

  const totalFiles = items.length;
  const todayMissing =
    scheduledDates.includes(todayIso) && (sheetsByDate.get(todayIso)?.length ?? 0) === 0;

  const getDraft = useCallback(
    (date: string): UploadDraft => draftByDate[date] ?? emptyDraft(),
    [draftByDate],
  );

  const setDraft = useCallback((date: string, patch: Partial<UploadDraft>) => {
    setDraftByDate((prev) => ({
      ...prev,
      [date]: { ...(prev[date] ?? emptyDraft()), ...patch },
    }));
  }, []);

  const clearDraft = useCallback((date: string) => {
    setDraftByDate((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const refreshLists = useCallback(async (examId: number, pid: string | null) => {
    const [datesRes, listRes] = await Promise.all([
      getInspectorAttendanceScheduledDates(examId, pid),
      listInspectorAttendanceSheets(examId, { postingId: pid }),
    ]);
    const dates = Array.isArray(datesRes.dates) ? [...datesRes.dates] : [];
    dates.sort((a, b) => b.localeCompare(a));
    setScheduledDates(dates);
    setItems(Array.isArray(listRes.items) ? listRes.items : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const defaultExam = await getStaffDefaultExamination();
        const postingsRes = await getMyInspectorPostings(defaultExam.id);
        const postingItems = Array.isArray(postingsRes.items) ? postingsRes.items : [];
        if (inspectorMustPickWorkspaceGlobally(postingItems.length)) {
          router.replace("/dashboard/inspector/select-workspace");
          return;
        }
        const pid = pickInspectorPostingId(postingItems, postingId);
        setPostingId(pid);
        setExam(defaultExam);

        const posting = postingItems.find((p) => p.id === pid);
        if (posting) {
          setCentreLabel(`${posting.center_name} (${posting.center_code})`);
        }

        if (!cancelled) {
          await refreshLists(defaultExam.id, pid);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, refreshLists]);

  const focusDateGroup = useCallback((date: string) => {
    setFocusedDate(date);
    setActionError(null);
    requestAnimationFrame(() => {
      const el = groupRefs.current[date];
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  async function onUpload(date: string, e: FormEvent) {
    e.preventDefault();
    if (!exam) return;
    const draft = getDraft(date);
    if (!draft.file) return;

    setUploadBusyDate(date);
    setActionError(null);
    setActionSuccess(null);
    try {
      await uploadInspectorAttendanceSheet(exam.id, date, draft.file, {
        notes: draft.notes || null,
        postingId,
      });
      clearDraft(date);
      setFocusedDate(date);
      setActionSuccess(`Attendance sheet uploaded for ${formatExamDateLabel(date)}.`);
      await refreshLists(exam.id, postingId);
      requestAnimationFrame(() => {
        const el = groupRefs.current[date];
        if (el) {
          el.open = true;
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusyDate(null);
    }
  }

  async function onDownload(sheet: AttendanceSheet) {
    if (!exam) return;
    setDownloadingId(sheet.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await downloadInspectorAttendanceSheet(exam.id, sheet, postingId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  async function onDelete(sheet: AttendanceSheet) {
    if (!exam) return;
    const msg = `Delete "${sheet.original_filename}" (${formatExamDateLabel(sheet.examination_date)})?`;
    if (!window.confirm(msg)) return;
    setDeletingId(sheet.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteInspectorAttendanceSheet(exam.id, sheet.id, postingId);
      await refreshLists(exam.id, postingId);
      setActionSuccess("Attendance sheet deleted.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  function onStickyUploadToday() {
    focusDateGroup(todayIso);
    requestAnimationFrame(() => {
      chooseFileRefs.current[todayIso]?.click();
    });
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Attendance sheets" staffRole="inspector">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 pb-24 sm:max-w-2xl sm:gap-6 lg:max-w-3xl">
          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {actionError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}
          {actionSuccess ? (
            <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-success">
              {actionSuccess}
            </p>
          ) : null}

          <header className={panelClass}>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Examination centre
            </p>
            {loading ? (
              <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="mt-1.5 text-base font-semibold leading-snug text-foreground">{centreLabel || "—"}</p>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Upload a PDF or photo of the attendance sheet for each scheduled examination day.
            </p>
          </header>

          {!loading && scheduledDates.length > 0 ? (
            <section className={panelClass}>
              <h2 className="text-base font-semibold text-card-foreground sm:text-lg">Examination days</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap a day to jump to uploads. Green dot means at least one file uploaded.
              </p>
              <AttendanceDateOverview
                statuses={dateStatuses}
                todayIso={todayIso}
                onSelectDate={focusDateGroup}
              />
            </section>
          ) : null}

          {!loading && scheduledDates.length === 0 ? (
            <section className={panelClass}>
              <p className="text-sm text-muted-foreground">
                No scheduled examination dates are available for this centre yet. Check the timetable or contact
                your administrator.
              </p>
            </section>
          ) : null}

          <section className="space-y-4">
            <div className="px-1">
              <h2 className="text-base font-semibold text-card-foreground sm:text-lg">Attendance by day</h2>
              {!loading && totalFiles > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{totalFiles} file(s) total</p>
              ) : null}
            </div>

            {loading ? (
              <p className={`${panelClass} text-center text-sm text-muted-foreground`}>Loading…</p>
            ) : scheduledDates.length === 0 ? null : (
              <div className="space-y-3">
                {dateGroups.map((group) => (
                  <AttendanceDateGroup
                    key={group.date}
                    group={group}
                    todayIso={todayIso}
                    focusedDate={focusedDate}
                    groupRef={(el) => {
                      groupRefs.current[group.date] = el;
                    }}
                    draft={getDraft(group.date)}
                    uploadBusy={uploadBusyDate === group.date}
                    downloadingId={downloadingId}
                    deletingId={deletingId}
                    onDraftChange={setDraft}
                    onUpload={(date, e) => void onUpload(date, e)}
                    onDownload={(row) => void onDownload(row)}
                    onDelete={(row) => void onDelete(row)}
                  />
                ))}
                {/* Hidden input for sticky CTA to trigger file picker on today */}
                <input
                  ref={(el) => {
                    chooseFileRefs.current[todayIso] = el;
                  }}
                  type="file"
                  accept=".pdf,image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f) setDraft(todayIso, { file: f });
                    e.target.value = "";
                    focusDateGroup(todayIso);
                  }}
                />
              </div>
            )}
          </section>
        </div>

        {!loading && todayMissing ? (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm lg:left-64">
            <div className="mx-auto max-w-lg sm:max-w-2xl lg:max-w-3xl">
              <button type="button" className={btnPrimary} onClick={onStickyUploadToday}>
                Upload today&apos;s attendance
              </button>
            </div>
          </div>
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
