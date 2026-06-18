"use client";

import { CheckCircle, ChevronDown, Download, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  deleteExaminerMarkingAttendanceSheet,
  downloadExaminerAttendanceSheetBlankPdf,
  downloadExaminerMarkingAttendanceSheet,
  listExaminerMarkingAttendanceSheets,
  listSubjectMarkingGroups,
  uploadExaminerMarkingAttendanceSheet,
  type ExaminerMarkingAttendanceSheet,
  type SubjectMarkingGroupRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const panelClass = "rounded-2xl border border-border/70 bg-card/90 shadow-sm";
const btnSecondary =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnDanger =
  "inline-flex min-h-9 items-center justify-center rounded-lg border border-destructive/50 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function sheetKey(sheet: ExaminerMarkingAttendanceSheet): string {
  return `${sheet.cohort_id}:${sheet.attendance_date}`;
}

type Props = {
  examId: number;
  subjectId: number;
};

export function ExaminerAttendanceSheetsPanel({ examId, subjectId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [cohorts, setCohorts] = useState<SubjectMarkingGroupRow[]>([]);
  const [cohortsLoading, setCohortsLoading] = useState(true);
  const [sheets, setSheets] = useState<ExaminerMarkingAttendanceSheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [attendanceDate, setAttendanceDate] = useState(todayIsoDate);
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const loadCohorts = useCallback(async () => {
    setCohortsLoading(true);
    try {
      const rows = await listSubjectMarkingGroups(examId, subjectId);
      setCohorts(rows);
      setSelectedGroupId((current) => current || rows[0]?.id || "");
    } catch (e) {
      setCohorts([]);
      setError(e instanceof Error ? e.message : "Failed to load cohorts.");
    } finally {
      setCohortsLoading(false);
    }
  }, [examId, subjectId]);

  const loadSheets = useCallback(async () => {
    setSheetsLoading(true);
    setError(null);
    try {
      const data = await listExaminerMarkingAttendanceSheets(examId, subjectId);
      setSheets(data.items);
    } catch (e) {
      setSheets([]);
      setError(e instanceof Error ? e.message : "Failed to load uploaded sheets.");
    } finally {
      setSheetsLoading(false);
    }
  }, [examId, subjectId]);

  useEffect(() => {
    if (panelOpen) setHasOpened(true);
  }, [panelOpen]);

  useEffect(() => {
    if (!hasOpened) return;
    void loadCohorts();
  }, [hasOpened, loadCohorts]);

  useEffect(() => {
    if (!hasOpened) return;
    void loadSheets();
  }, [hasOpened, loadSheets]);

  useEffect(() => {
    if (!uploadSuccess) return;
    const timer = window.setTimeout(() => setUploadSuccess(false), 2500);
    return () => window.clearTimeout(timer);
  }, [uploadSuccess]);

  const selectedCohort = useMemo(
    () => cohorts.find((c) => c.id === selectedGroupId) ?? null,
    [cohorts, selectedGroupId],
  );

  const groupedSheets = useMemo(() => {
    const map = new Map<string, ExaminerMarkingAttendanceSheet[]>();
    for (const sheet of sheets) {
      const key = sheetKey(sheet);
      const list = map.get(key) ?? [];
      list.push(sheet);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [sheets]);

  async function handleDownloadBlank() {
    if (!selectedGroupId) return;
    setDownloadBusy(true);
    setError(null);
    try {
      await downloadExaminerAttendanceSheetBlankPdf({
        examination_id: examId,
        subject_id: subjectId,
        group_id: selectedGroupId,
        attendance_date: attendanceDate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download blank sheet.");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!selectedGroupId || !uploadFile) return;
    setBusy(true);
    setError(null);
    try {
      await uploadExaminerMarkingAttendanceSheet(
        examId,
        subjectId,
        selectedGroupId,
        attendanceDate,
        uploadFile,
        uploadNotes,
      );
      setUploadFile(null);
      setUploadNotes("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadSuccess(true);
      await loadSheets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(sheet: ExaminerMarkingAttendanceSheet) {
    if (!window.confirm(`Delete "${sheet.original_filename}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteExaminerMarkingAttendanceSheet(examId, subjectId, sheet.id);
      await loadSheets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(panelClass, "overflow-hidden")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-border/70 bg-muted/15 px-4 py-3 text-left sm:px-5"
        onClick={() => setPanelOpen((value) => !value)}
        aria-expanded={panelOpen}
        aria-controls="paper-attendance-sheets-panel"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Paper attendance sheets</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Download a pre-filled sheet by cohort, collect signatures, then upload the signed copy.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            panelOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {panelOpen ? (
      <div id="paper-attendance-sheets-panel" className="space-y-5 px-4 py-4 sm:px-5">
        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={formLabelClass} htmlFor="attendance-sheet-cohort">
              Cohort
            </label>
            <select
              id="attendance-sheet-cohort"
              className={cn(formInputClass, "mt-1 h-10 w-full")}
              value={selectedGroupId}
              disabled={cohortsLoading || cohorts.length === 0}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {cohorts.length === 0 ? (
                <option value="">No cohorts</option>
              ) : (
                cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.examiner_ids.length} examiner{c.examiner_ids.length === 1 ? "" : "s"})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className={formLabelClass} htmlFor="attendance-sheet-date">
              Attendance date
            </label>
            <input
              id="attendance-sheet-date"
              type="date"
              className={cn(formInputClass, "mt-1 h-10 w-full")}
              value={attendanceDate}
              max={todayIsoDate()}
              onChange={(e) => setAttendanceDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="h-10 gap-2"
            disabled={downloadBusy || !selectedGroupId || cohortsLoading}
            onClick={() => void handleDownloadBlank()}
          >
            {downloadBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download blank sheet
          </Button>
          {selectedCohort ? (
            <p className="self-center text-xs text-muted-foreground">
              {selectedCohort.examiner_ids.length} name{selectedCohort.examiner_ids.length === 1 ? "" : "s"} with signature column
            </p>
          ) : null}
        </div>

        <form className="rounded-xl border border-border/70 bg-muted/10 p-4" onSubmit={(e) => void handleUpload(e)}>
          <h4 className="text-sm font-semibold text-foreground">Upload signed copy</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            PDF or photo for {selectedCohort?.name ?? "selected cohort"} · {formatDateLabel(attendanceDate)}
          </p>

          <div className="mt-3 space-y-3">
            <div>
              <label className={formLabelClass} htmlFor="attendance-sheet-notes">
                Notes (optional)
              </label>
              <input
                id="attendance-sheet-notes"
                className={cn(formInputClass, "mt-1 h-10 w-full")}
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                placeholder="e.g. Morning session"
                disabled={busy}
              />
            </div>

            <div>
              <label className={formLabelClass}>Signed sheet file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                capture="environment"
                className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-input-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium"
                disabled={busy || !selectedGroupId}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <Button type="submit" className="h-10 gap-2" disabled={busy || !selectedGroupId || !uploadFile}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Upload signed sheet
            </Button>
          </div>
        </form>

        <div>
          <h4 className="text-sm font-semibold text-foreground">Uploaded sheets</h4>
          {sheetsLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
          ) : groupedSheets.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No signed copies uploaded yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {groupedSheets.map(([key, groupSheets]) => {
                const first = groupSheets[0]!;
                return (
                  <li key={key} className="rounded-lg border border-border/70 bg-background/80 p-3">
                    <div className="text-sm font-medium text-foreground">
                      {first.cohort_name} · {formatDateLabel(first.attendance_date)}
                    </div>
                    <ul className="mt-2 space-y-2">
                      {groupSheets.map((sheet) => (
                        <li
                          key={sheet.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{sheet.original_filename}</div>
                            {sheet.notes ? (
                              <div className="text-xs text-muted-foreground">{sheet.notes}</div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              className={btnSecondary}
                              disabled={busy}
                              onClick={() => void downloadExaminerMarkingAttendanceSheet(examId, subjectId, sheet)}
                            >
                              <Download className="size-4" />
                            </button>
                            <button
                              type="button"
                              className={btnDanger}
                              disabled={busy}
                              onClick={() => void handleDelete(sheet)}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      ) : null}

      {uploadSuccess ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setUploadSuccess(false)}
          />
          <div
            role="status"
            aria-live="polite"
            className="relative z-10 w-full max-w-sm rounded-2xl border border-success/30 bg-card p-6 text-center shadow-lg"
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle className="h-7 w-7" aria-hidden />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Uploaded successfully</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Your signed attendance sheet has been saved.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
