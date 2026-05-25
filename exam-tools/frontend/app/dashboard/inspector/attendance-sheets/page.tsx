"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { TypeToDeleteConfirmModal } from "@/components/type-to-delete-confirm-modal";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  deleteInspectorAttendanceSheet,
  downloadInspectorAttendanceSheet,
  getInspectorAttendanceScheduledDates,
  getInspectorSubmissionStatus,
  inspectorScopePeriodEnd,
  formatSubmissionDeadlineDate,
  isInspectorScopePeriodOpen,
  inspectorScopePeriodLabel,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  listInspectorAttendanceSheets,
  uploadInspectorAttendanceSheet,
  type AttendanceScheduledDateItem,
  type AttendanceSheet,
  type Examination,
  type InspectorSubmissionStatus,
  type RecordSubjectScope,
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

type DateGroup = { slot: UploadSlot; sheets: AttendanceSheet[] };
type DateStatus = {
  slot: UploadSlot;
  sheets: AttendanceSheet[];
  status: "uploaded" | "missing";
};
type UploadDraft = { notes: string; file: File | null };
type UploadSlot = { date: string; scope: RecordSubjectScope };

function slotKey(slot: UploadSlot): string {
  return `${slot.date}:${slot.scope}`;
}

function slotLabel(slot: UploadSlot): string {
  const dateLabel = formatExamDateLabel(slot.date);
  return slot.scope === "CORE" ? `${dateLabel} · Core` : `${dateLabel} · Elective`;
}

function flattenScheduledDates(items: AttendanceScheduledDateItem[]): UploadSlot[] {
  const out: UploadSlot[] = [];
  for (const item of items) {
    for (const scope of item.subject_scopes) {
      out.push({ date: item.examination_date, scope });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.scope.localeCompare(b.scope));
}

function uniqueDates(slots: UploadSlot[]): string[] {
  return [...new Set(slots.map((s) => s.date))].sort((a, b) => b.localeCompare(a));
}

function isSubmissionAllowed(examinationDate: string, todayIso: string): boolean {
  return examinationDate <= todayIso;
}

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

function groupSheetsBySlot(items: AttendanceSheet[]): Map<string, AttendanceSheet[]> {
  const map = new Map<string, AttendanceSheet[]>();
  for (const sheet of items) {
    const key = `${sheet.examination_date}:${sheet.subject_scope}`;
    const list = map.get(key) ?? [];
    list.push(sheet);
    map.set(key, list);
  }
  for (const [key, sheets] of map) {
    map.set(key, sortSheetsInGroup(sheets));
  }
  return map;
}

function buildDateStatuses(
  actionableSlots: UploadSlot[],
  sheetsBySlot: Map<string, AttendanceSheet[]>,
): DateStatus[] {
  return actionableSlots.map((slot) => {
    const sheets = sheetsBySlot.get(slotKey(slot)) ?? [];
    return {
      slot,
      sheets,
      status: sheets.length > 0 ? ("uploaded" as const) : ("missing" as const),
    };
  });
}

function buildDateGroups(actionableSlots: UploadSlot[], sheetsBySlot: Map<string, AttendanceSheet[]>): DateGroup[] {
  return actionableSlots.map((slot) => ({
    slot,
    sheets: sheetsBySlot.get(slotKey(slot)) ?? [],
  }));
}

function shouldGroupDefaultOpen(
  slot: UploadSlot,
  sheets: AttendanceSheet[],
  todayIso: string,
  focusedKey: string | null,
): boolean {
  const key = slotKey(slot);
  if (focusedKey === key) return true;
  if (slot.date === todayIso) return true;
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
  deleteEnabled: boolean;
  onDownload: (row: AttendanceSheet) => void;
  onDelete: (row: AttendanceSheet) => void;
};

function AttendanceSheetFileRow({
  row,
  downloadingId,
  deletingId,
  deleteEnabled,
  onDownload,
  onDelete,
}: AttendanceSheetFileRowProps) {
  const busy = downloadingId === row.id || deletingId === row.id;
  return (
    <article className="rounded-xl border border-border/70 bg-muted/20 px-3 py-3">
      <p className="truncate text-sm font-semibold text-foreground" title={row.original_filename}>
        {row.original_filename}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {row.subject_scope === "CORE" ? "Core" : "Elective"} · Uploaded {formatUploadedAt(row.created_at)}
      </p>
      {row.notes ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Note:</span> {row.notes}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button type="button" className={btnSecondary} disabled={busy} onClick={() => onDownload(row)}>
          {downloadingId === row.id ? "…" : "Download"}
        </button>
        <button type="button" className={btnDanger} disabled={busy || !deleteEnabled} onClick={() => onDelete(row)}>
          {deletingId === row.id ? "…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

type AttendanceDateOverviewProps = {
  statuses: DateStatus[];
  todayIso: string;
  onSelectSlot: (slot: UploadSlot) => void;
};

function AttendanceDateOverview({ statuses, todayIso, onSelectSlot }: AttendanceDateOverviewProps) {
  return (
    <ul className="mt-3 divide-y divide-border rounded-xl border border-border/80">
      {statuses.map(({ slot, sheets, status }) => {
        const isToday = slot.date === todayIso;
        const countLabel =
          status === "uploaded"
            ? `${sheets.length} ${sheets.length === 1 ? "file" : "files"}`
            : "Missing";
        const statusDotClass =
          status === "uploaded" ? "bg-success" : "border-2 border-muted-foreground/50 bg-transparent";
        const countClass = status === "uploaded" ? "text-muted-foreground" : "text-destructive";
        return (
          <li key={slotKey(slot)}>
            <button
              type="button"
              onClick={() => onSelectSlot(slot)}
              className="flex min-h-12 w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <span className={`flex h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{slotLabel(slot)}</span>
                {isToday ? (
                  <span className="mt-0.5 inline-block rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Today
                  </span>
                ) : null}
              </span>
              <span className={`shrink-0 text-xs font-medium tabular-nums ${countClass}`}>{countLabel}</span>
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
  focusedKey: string | null;
  groupRef: (el: HTMLDetailsElement | null) => void;
  draft: UploadDraft;
  uploadBusy: boolean;
  submissionsOpen: boolean;
  submissionDeadlineEnd: string | null;
  downloadingId: string | null;
  deletingId: string | null;
  onDraftChange: (key: string, patch: Partial<UploadDraft>) => void;
  onUpload: (slot: UploadSlot, e: FormEvent) => void;
  onDownload: (row: AttendanceSheet) => void;
  onDelete: (row: AttendanceSheet) => void;
};

function AttendanceDateGroup({
  group,
  todayIso,
  focusedKey,
  groupRef,
  draft,
  uploadBusy,
  submissionsOpen,
  submissionDeadlineEnd,
  downloadingId,
  deletingId,
  onDraftChange,
  onUpload,
  onDownload,
  onDelete,
}: AttendanceDateGroupProps) {
  const { slot, sheets } = group;
  const key = slotKey(slot);
  const detailsElRef = useRef<HTMLDetailsElement | null>(null);
  const defaultOpen = shouldGroupDefaultOpen(slot, sheets, todayIso, focusedKey);
  const fileCount = sheets.length;

  useEffect(() => {
    if (detailsElRef.current && defaultOpen) {
      detailsElRef.current.open = true;
    }
  }, [defaultOpen, key]);

  useEffect(() => {
    if (focusedKey === key && detailsElRef.current) {
      detailsElRef.current.open = true;
    }
  }, [focusedKey, key]);
  const countLabel = fileCount === 0 ? "No files" : `${fileCount} ${fileCount === 1 ? "file" : "files"}`;
  const canSubmit = Boolean(draft.file && !uploadBusy && submissionsOpen);
  const cameraInputId = `attendance-camera-${key}`;
  const fileInputId = `attendance-file-${key}`;
  const notesInputId = `attendance-notes-${key}`;

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
          {slotLabel(slot)}
          {slot.date === todayIso ? (
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
                deleteEnabled={submissionsOpen}
                onDownload={onDownload}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}

        {!submissionsOpen ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {slot.scope === "CORE" ? "Core" : "Elective"} submissions are closed for this examination.
          </p>
        ) : (
        <>
        {submissionDeadlineEnd ? (
          <p className="mt-3 text-xs font-medium text-amber-800 dark:text-amber-200">
            Submit by {formatSubmissionDeadlineDate(submissionDeadlineEnd)}.
          </p>
        ) : null}
        <form
          onSubmit={(e) => onUpload(slot, e)}
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
              onChange={(e) => onDraftChange(key, { notes: e.target.value })}
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
                onDraftChange(key, { file: f });
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
                onDraftChange(key, { file: f });
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
            {uploadBusy ? "Uploading…" : "Upload"}
          </button>
        </form>
        </>
        )}
      </div>
    </details>
  );
}

export default function InspectorAttendanceSheetsPage() {
  const router = useRouter();
  const [serverToday, setServerToday] = useState<string | null>(null);
  const todayIso = serverToday ?? localTodayIso();
  const [exam, setExam] = useState<Examination | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [centreLabel, setCentreLabel] = useState<string>("");
  const [scheduledItems, setScheduledItems] = useState<AttendanceScheduledDateItem[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<InspectorSubmissionStatus | null>(null);
  const [items, setItems] = useState<AttendanceSheet[]>([]);
  const [draftByDate, setDraftByDate] = useState<Record<string, UploadDraft>>({});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadBusyKey, setUploadBusyKey] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteSheet, setPendingDeleteSheet] = useState<AttendanceSheet | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const groupRefs = useRef<Record<string, HTMLDetailsElement | null>>({});
  const chooseFileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const uploadSlots = useMemo(() => flattenScheduledDates(scheduledItems), [scheduledItems]);
  const scheduledDates = useMemo(() => uniqueDates(uploadSlots), [uploadSlots]);
  const sheetsBySlot = useMemo(() => groupSheetsBySlot(items), [items]);
  const actionableSlots = useMemo(
    () => uploadSlots.filter((s) => isSubmissionAllowed(s.date, todayIso)),
    [uploadSlots, todayIso],
  );
  const nextUpcomingDate = useMemo(() => {
    const upcoming = scheduledDates.filter((d) => d > todayIso).sort((a, b) => a.localeCompare(b));
    return upcoming[0];
  }, [scheduledDates, todayIso]);
  const dateStatuses = useMemo(
    () => buildDateStatuses(actionableSlots, sheetsBySlot),
    [actionableSlots, sheetsBySlot],
  );
  const dateGroups = useMemo(() => buildDateGroups(actionableSlots, sheetsBySlot), [actionableSlots, sheetsBySlot]);

  const totalFiles = items.length;
  const todaySlots = actionableSlots.filter((s) => s.date === todayIso);
  const todayMissing =
    todaySlots.length > 0 &&
    todaySlots.some((s) => (sheetsBySlot.get(slotKey(s))?.length ?? 0) === 0);
  const noDueDaysYet = !loading && uploadSlots.length > 0 && actionableSlots.length === 0;

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
    const [datesRes, listRes, statusRes] = await Promise.all([
      getInspectorAttendanceScheduledDates(examId, pid),
      listInspectorAttendanceSheets(examId, { postingId: pid }),
      getInspectorSubmissionStatus(examId),
    ]);
    setScheduledItems(Array.isArray(datesRes.dates) ? datesRes.dates : []);
    setServerToday(datesRes.today ?? null);
    setItems(Array.isArray(listRes.items) ? listRes.items : []);
    setSubmissionStatus(statusRes);
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

  const focusSlotGroup = useCallback((slot: UploadSlot) => {
    const key = slotKey(slot);
    setFocusedKey(key);
    setActionError(null);
    requestAnimationFrame(() => {
      const el = groupRefs.current[key];
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }, []);

  async function onUpload(slot: UploadSlot, e: FormEvent) {
    e.preventDefault();
    if (!exam) return;
    if (!isSubmissionAllowed(slot.date, todayIso)) return;
    const key = slotKey(slot);
    const draft = getDraft(key);
    if (!draft.file) return;

    setUploadBusyKey(key);
    setActionError(null);
    setActionSuccess(null);
    try {
      await uploadInspectorAttendanceSheet(exam.id, slot.date, draft.file, {
        notes: draft.notes || null,
        postingId,
        subjectScope: slot.scope,
      });
      clearDraft(key);
      setFocusedKey(key);
      setActionSuccess(`Attendance sheet uploaded for ${slotLabel(slot)}.`);
      await refreshLists(exam.id, postingId);
      requestAnimationFrame(() => {
        const el = groupRefs.current[key];
        if (el) {
          el.open = true;
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusyKey(null);
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

  function requestDelete(sheet: AttendanceSheet) {
    if (!submissionStatus || !isInspectorScopePeriodOpen(submissionStatus, sheet.subject_scope)) return;
    setPendingDeleteSheet(sheet);
  }

  async function confirmDeleteSheet() {
    if (!exam || pendingDeleteSheet === null) return;
    if (!submissionStatus || !isInspectorScopePeriodOpen(submissionStatus, pendingDeleteSheet.subject_scope)) return;
    const sheet = pendingDeleteSheet;
    setDeleteBusy(true);
    setDeletingId(sheet.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteInspectorAttendanceSheet(exam.id, sheet.id, postingId);
      setPendingDeleteSheet(null);
      await refreshLists(exam.id, postingId);
      setActionSuccess("Attendance sheet deleted.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
      setDeletingId(null);
    }
  }

  function onStickyUploadToday() {
    const firstToday = todaySlots[0];
    if (!firstToday) return;
    focusSlotGroup(firstToday);
    requestAnimationFrame(() => {
      chooseFileRefs.current[slotKey(firstToday)]?.click();
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
              Upload a signed PDFs or photos of the attendance sheets for each examination day.
            </p>
            {!loading && nextUpcomingDate ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Next examination day: {formatExamDateLabel(nextUpcomingDate)}
              </p>
            ) : null}
          </header>

          {noDueDaysYet ? (
            <section className={panelClass}>
              <p className="text-sm text-muted-foreground">No examination day is due for upload yet.</p>
              {nextUpcomingDate ? (
                <p className="mt-2 text-sm font-medium text-foreground">
                  Next day: {formatExamDateLabel(nextUpcomingDate)}
                </p>
              ) : null}
            </section>
          ) : null}

          {!loading && submissionStatus && !submissionStatus.core_period_open && !submissionStatus.elective_period_open ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
              Core and elective submissions are closed.
            </p>
          ) : null}
          {!loading && submissionStatus && submissionStatus.core_period_open && !submissionStatus.elective_period_open ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
              Elective submissions are closed
              {inspectorScopePeriodLabel(submissionStatus, "ELECTIVE")
                ? ` (open ${inspectorScopePeriodLabel(submissionStatus, "ELECTIVE")}).`
                : "."}
            </p>
          ) : null}
          {!loading && submissionStatus && !submissionStatus.core_period_open && submissionStatus.elective_period_open ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
              Core submissions are closed
              {inspectorScopePeriodLabel(submissionStatus, "CORE")
                ? ` (open ${inspectorScopePeriodLabel(submissionStatus, "CORE")}).`
                : "."}
            </p>
          ) : null}

          {!loading && actionableSlots.length > 0 ? (
            <section className={panelClass}>
              <h2 className="text-base font-semibold text-card-foreground sm:text-lg">Examination days</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tap a slot to jump to uploads. Green dot means at least one file uploaded.
              </p>
              <AttendanceDateOverview
                statuses={dateStatuses}
                todayIso={todayIso}
                onSelectSlot={focusSlotGroup}
              />
            </section>
          ) : null}

          {!loading && uploadSlots.length === 0 ? (
            <section className={panelClass}>
              <p className="text-sm text-muted-foreground">
                No scheduled examination dates are available for this centre yet. Check the timetable or contact
                your administrator.
              </p>
            </section>
          ) : null}

          {(actionableSlots.length > 0 || loading) ? (
          <section className="space-y-4">
            <div className="px-1">
              <h2 className="text-base font-semibold text-card-foreground sm:text-lg">Attendance by day</h2>
              {!loading && totalFiles > 0 ? (
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{totalFiles} file(s) total</p>
              ) : null}
            </div>

            {loading ? (
              <p className={`${panelClass} text-center text-sm text-muted-foreground`}>Loading…</p>
            ) : actionableSlots.length === 0 ? null : (
              <div className="space-y-3">
                {dateGroups.map((group) => {
                  const key = slotKey(group.slot);
                  return (
                  <AttendanceDateGroup
                    key={key}
                    group={group}
                    todayIso={todayIso}
                    focusedKey={focusedKey}
                    groupRef={(el) => {
                      groupRefs.current[key] = el;
                    }}
                    draft={getDraft(key)}
                    uploadBusy={uploadBusyKey === key}
                    submissionsOpen={isInspectorScopePeriodOpen(submissionStatus, group.slot.scope)}
                    submissionDeadlineEnd={
                      submissionStatus ? inspectorScopePeriodEnd(submissionStatus, group.slot.scope) : null
                    }
                    downloadingId={downloadingId}
                    deletingId={deletingId}
                    onDraftChange={setDraft}
                    onUpload={(slot, e) => void onUpload(slot, e)}
                    onDownload={(row) => void onDownload(row)}
                    onDelete={requestDelete}
                  />
                  );
                })}
                {todaySlots[0] ? (
                <input
                  ref={(el) => {
                    chooseFileRefs.current[slotKey(todaySlots[0])] = el;
                  }}
                  type="file"
                  accept=".pdf,image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    const slot = todaySlots[0];
                    if (f && slot) {
                      setDraft(slotKey(slot), { file: f });
                      focusSlotGroup(slot);
                    }
                    e.target.value = "";
                  }}
                />
                ) : null}
              </div>
            )}
          </section>
          ) : null}
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

        {pendingDeleteSheet ? (
          <TypeToDeleteConfirmModal
            title="Delete attendance sheet?"
            titleId="delete-attendance-sheet-title"
            description={
              <>
                Delete <span className="font-medium text-foreground">{pendingDeleteSheet.original_filename}</span>?
                This cannot be undone.
              </>
            }
            onCancel={() => !deleteBusy && setPendingDeleteSheet(null)}
            onConfirm={() => void confirmDeleteSheet()}
            busy={deleteBusy}
          />
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
