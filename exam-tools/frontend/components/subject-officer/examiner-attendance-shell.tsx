"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Loader2 } from "lucide-react";

import { humanizeRegion } from "@/components/examiners/utils";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { ExaminerAttendanceSheetsPanel } from "@/components/subject-officer/examiner-attendance-sheets-panel";
import {
  ScanVerificationResultOverlay,
  ScanVerifyingOverlay,
  type ScanVerificationResultTone,
} from "@/components/subject-officer/scan-verification-result-overlay";
import { SubjectOfficerWorkspaceStrip } from "@/components/subject-officer/subject-officer-workspace-strip";
import { Button } from "@/components/ui/button";
import {
  listExaminerAttendanceAll,
  markExaminerAttendance,
  markExaminerAttendanceScan,
  type ExaminerAttendanceMarkResult,
  type ExaminerAttendanceRow,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const compactLabelClass = "text-xs font-medium text-muted-foreground";
const SUCCESS_AUTO_DISMISS_MS = 2500;

type Props = {
  examId?: number;
  subjectId?: number;
  workspaceLabel?: string | null;
  adminMode?: boolean;
  assignments?: SubjectOfficerMeExamAssignment[];
};

function attendanceSubtitle(result: ExaminerAttendanceMarkResult): string | null {
  const parts: string[] = [];
  if (result.examination_name) parts.push(result.examination_name);
  if (result.reference_code) parts.push(result.reference_code);
  if (result.region) parts.push(humanizeRegion(result.region));
  if (result.examiner_type_label) parts.push(result.examiner_type_label);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function attendanceResultPresentation(result: ExaminerAttendanceMarkResult): {
  tone: ScanVerificationResultTone;
  title: string;
  autoDismissMs?: number;
} {
  if (!result.valid) {
    return {
      tone: "error",
      title: result.message || "Could not mark attendance",
    };
  }
  if (result.already_marked) {
    return {
      tone: "warning",
      title: result.name ? `${result.name} — already present today` : "Already present today",
    };
  }
  return {
    tone: "success",
    title: result.name ? `${result.name} — marked present` : "Marked present",
    autoDismissMs: result.recorded ? SUCCESS_AUTO_DISMISS_MS : undefined,
  };
}

function AttendanceResultBody({ result }: { result: ExaminerAttendanceMarkResult }) {
  const subtitle = attendanceSubtitle(result);
  const ok = result.valid && (result.recorded || result.already_marked);

  if (ok && subtitle) {
    return (
      <p className="rounded-xl border border-border/70 bg-muted/25 px-3.5 py-3 text-center text-foreground sm:text-left">
        {subtitle}
      </p>
    );
  }
  if (!ok && result.message) {
    return (
      <p className="rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-center text-destructive sm:text-left">
        {result.message}
      </p>
    );
  }
  return null;
}

export function ExaminerAttendanceShell({
  examId: workspaceExamId,
  subjectId: workspaceSubjectId,
  workspaceLabel,
  adminMode = false,
  assignments = [],
}: Props) {
  const readerId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const verifyingRef = useRef(false);

  const [adminExamId, setAdminExamId] = useState<number | null>(null);
  const manualExamId = adminMode ? adminExamId : workspaceExamId ?? null;

  useEffect(() => {
    if (!adminMode || assignments.length === 0) return;
    setAdminExamId((current) => current ?? assignments[0]?.examination_id ?? null);
  }, [adminMode, assignments]);

  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<ExaminerAttendanceMarkResult | null>(null);
  const [items, setItems] = useState<ExaminerAttendanceRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await listExaminerAttendanceAll({
        admin: adminMode,
      });
      setItems(data.items);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load attendance.");
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [adminMode]);

  const dismissResult = useCallback(() => {
    setResult(null);
    lastScannedRef.current = null;
  }, []);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      await scanner.clear();
    } catch {
      // ignore
    }
    scannerRef.current = null;
  }, []);

  const handleMarkResponse = useCallback(
    async (response: ExaminerAttendanceMarkResult) => {
      setResult(response);
      if (response.recorded) await loadList();
      if (!response.valid) {
        window.setTimeout(() => {
          lastScannedRef.current = null;
        }, 2500);
      }
    },
    [loadList],
  );

  const runScanMark = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code || verifyingRef.current) return;

      verifyingRef.current = true;
      setVerifying(true);
      setResult(null);
      try {
        const response = await markExaminerAttendanceScan(code, { admin: adminMode });
        await handleMarkResponse(response);
      } catch (err) {
        setResult({
          valid: false,
          message: err instanceof Error ? err.message : "Marking failed.",
        });
        window.setTimeout(() => {
          lastScannedRef.current = null;
        }, 2500);
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [adminMode, handleMarkResponse],
  );

  const runManualMark = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!manualExamId || !code || verifyingRef.current) return;

      verifyingRef.current = true;
      setVerifying(true);
      setResult(null);
      try {
        const response = await markExaminerAttendance(manualExamId, code, { admin: adminMode });
        await handleMarkResponse(response);
      } catch (err) {
        setResult({
          valid: false,
          message: err instanceof Error ? err.message : "Marking failed.",
        });
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [adminMode, handleMarkResponse, manualExamId],
  );

  const handleScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code || lastScannedRef.current === code) return;
      lastScannedRef.current = code;
      await runScanMark(code);
    },
    [runScanMark],
  );

  useEffect(() => {
    if (!cameraEnabled) {
      void stopScanner();
      return;
    }
    let cancelled = false;
    const scanner = new Html5Qrcode(readerId);
    scannerRef.current = scanner;
    setCameraError(null);
    void scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => void handleScan(decoded),
        () => {},
      )
      .catch(() => {
        if (!cancelled) setCameraError("Unable to start camera. Use manual entry instead.");
      });
    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [cameraEnabled, handleScan, readerId, stopScanner]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resultPresentation = result ? attendanceResultPresentation(result) : null;

  return (
    <SubjectOfficerPanelShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Attendance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan an examiner&apos;s QR code or enter their reference code to mark them present for today.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm">
              <div className="flex flex-wrap items-end gap-3 border-b border-border/70 bg-muted/15 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 w-full sm:w-auto sm:min-w-38">
                  <span className={compactLabelClass}>Camera</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-0.5 h-9 w-full gap-2 px-3"
                    onClick={() => setCameraEnabled((v) => !v)}
                  >
                    {cameraEnabled ? <CameraOff className="size-4" /> : <Camera className="size-4" />}
                    {cameraEnabled ? "Stop" : "Start"}
                  </Button>
                </div>
              </div>

              {cameraEnabled ? (
                <>
                  <div id={readerId} className="min-h-[280px] w-full bg-black/5" />
                  {cameraError ? (
                    <p className="border-t border-border/70 px-4 py-3 text-sm text-destructive sm:px-5">
                      {cameraError}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="border-b border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
                  Camera is off. Use manual verification below or start the camera again.
                </div>
              )}

              {verifying ? <ScanVerifyingOverlay /> : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm">
              <div className="border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-semibold text-foreground">Manual verification</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Select an examination, then enter a reference code.</p>
              </div>
              <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
                {adminMode ? (
                  <div className="max-w-md">
                    <label className={compactLabelClass} htmlFor="admin-attendance-exam">
                      Examination
                    </label>
                    <select
                      id="admin-attendance-exam"
                      className="mt-0.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      value={manualExamId ?? ""}
                      onChange={(e) => setAdminExamId(Number(e.target.value))}
                    >
                      {assignments.map((a) => (
                        <option key={a.examination_id} value={a.examination_id}>
                          {a.examination_name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <SubjectOfficerWorkspaceStrip workspaceLabel={workspaceLabel} workspace={null} />
                )}
              </div>
              <form
                className="px-4 py-4 sm:px-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void runManualMark(manualCode);
                }}
              >
                <label className={formLabelClass} htmlFor="attendance-manual-code">
                  Reference code
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="attendance-manual-code"
                    className={cn(formInputClass, "mt-0 h-11 font-mono uppercase sm:flex-1")}
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    placeholder="e.g. MATH301-NAE1"
                    disabled={!manualExamId}
                  />
                  <Button type="submit" disabled={verifying || !manualCode.trim() || !manualExamId} className="h-11 w-full sm:w-32">
                    {verifying ? <Loader2 className="size-4 animate-spin" /> : "Mark"}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Marked today ({items.length})</h3>
            {listLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}
            {listError ? <p className="mt-3 text-sm text-destructive">{listError}</p> : null}
            {!listLoading && items.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No attendance recorded for today yet.</p>
            ) : (
              <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto">
                {items.map((item) => (
                  <li key={item.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <div className="font-medium">{item.examiner_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.examination_name ? `${item.examination_name} · ` : ""}
                      {item.reference_code} · {item.examiner_type_label}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {!adminMode && workspaceExamId != null && workspaceSubjectId != null ? (
          <ExaminerAttendanceSheetsPanel examId={workspaceExamId} subjectId={workspaceSubjectId} />
        ) : null}
      </div>

      {result && resultPresentation ? (
        <ScanVerificationResultOverlay
          open
          tone={resultPresentation.tone}
          title={resultPresentation.title}
          autoDismissMs={resultPresentation.autoDismissMs}
          onDismiss={dismissResult}
        >
          <AttendanceResultBody result={result} />
        </ScanVerificationResultOverlay>
      ) : null}
    </SubjectOfficerPanelShell>
  );
}
