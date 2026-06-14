"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { LunchVerifiedCouponsPanel } from "@/components/subject-officer/lunch-verified-coupons-panel";

import { humanizeRegion } from "@/components/examiners/utils";
import { LunchVerificationRepeatModal } from "@/components/subject-officer/lunch-verification-repeat-modal";
import { SubjectOfficerExamSelector } from "@/components/subject-officer/subject-officer-exam-bar";
import { SubjectOfficerPanelShell } from "@/components/subject-officer/subject-officer-panel-shell";
import { Button } from "@/components/ui/button";
import {
  listAdminVerifiedLunchCouponsAll,
  listVerifiedLunchCouponsAll,
  verifyAdminExaminerLunchCoupon,
  verifyAdminExaminerLunchCouponScan,
  verifyExaminerLunchCoupon,
  verifyExaminerLunchCouponScan,
  type LunchCouponVerifiedRow,
  type LunchCouponVerifyResult,
  type SubjectOfficerMeExamAssignment,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

const compactLabelClass = "text-xs font-medium text-muted-foreground";

type Props = {
  assignments: SubjectOfficerMeExamAssignment[];
  assignmentsLoading?: boolean;
  adminMode?: boolean;
};

function VerificationResultCard({ result }: { result: LunchCouponVerifyResult }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 sm:px-5",
        result.valid ? "border-emerald-500/40 bg-emerald-500/10" : "border-destructive/40 bg-destructive/10",
      )}
    >
      <div className="flex items-start gap-3">
        {result.valid ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold", result.valid ? "text-emerald-800" : "text-destructive")}>
            {result.valid ? "Valid lunch coupon" : result.already_verified ? "Already verified today" : "Invalid lunch coupon"}
          </p>
          {result.valid ? (
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              {result.examination_name ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Examination</dt>
                  <dd className="font-medium text-foreground">{result.examination_name}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium text-foreground">{result.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Reference code</dt>
                <dd className="font-mono font-medium text-foreground">{result.reference_code}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Role</dt>
                <dd className="font-medium text-foreground">{result.examiner_type_label}</dd>
              </div>
              {result.region ? (
                <div>
                  <dt className="text-muted-foreground">Region</dt>
                  <dd className="font-medium text-foreground">{humanizeRegion(result.region)}</dd>
                </div>
              ) : null}
              {result.subject_codes && result.subject_codes.length > 0 ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Subject</dt>
                  <dd className="font-medium text-foreground">{result.subject_codes.join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="mt-2 text-sm text-destructive">{result.message ?? "Verification failed."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function LunchVerificationShell({
  assignments,
  assignmentsLoading = false,
  adminMode = false,
}: Props) {
  const readerId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<string | null>(null);
  const verifyingRef = useRef(false);

  const defaultManualExamId = useMemo(
    () => (assignments.length > 0 ? assignments[0].examination_id : null),
    [assignments],
  );

  const [manualExamId, setManualExamId] = useState<number | null>(defaultManualExamId);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<LunchCouponVerifyResult | null>(null);
  const [repeatPrompt, setRepeatPrompt] = useState<LunchCouponVerifyResult | null>(null);
  const [verifiedItems, setVerifiedItems] = useState<LunchCouponVerifiedRow[]>([]);
  const [verifiedLoading, setVerifiedLoading] = useState(false);
  const [verifiedError, setVerifiedError] = useState<string | null>(null);

  useEffect(() => {
    setManualExamId(defaultManualExamId);
  }, [defaultManualExamId]);

  const loadVerified = useCallback(async () => {
    setVerifiedLoading(true);
    setVerifiedError(null);
    try {
      const data = adminMode
        ? await listAdminVerifiedLunchCouponsAll()
        : await listVerifiedLunchCouponsAll();
      setVerifiedItems(data.items);
    } catch (err) {
      setVerifiedError(err instanceof Error ? err.message : "Failed to load verified examiners.");
      setVerifiedItems([]);
    } finally {
      setVerifiedLoading(false);
    }
  }, [adminMode]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
      await scanner.clear();
    } catch {
      // Ignore cleanup errors when the camera is already stopped.
    }
    scannerRef.current = null;
  }, []);

  const handleVerifyResponse = useCallback(
    async (response: LunchCouponVerifyResult) => {
      if (response.already_verified) {
        setRepeatPrompt(response);
        setResult(null);
        lastScannedRef.current = null;
        return;
      }

      setRepeatPrompt(null);
      setResult(response);
      if (response.recorded) {
        await loadVerified();
      }
      if (!response.valid) {
        window.setTimeout(() => {
          lastScannedRef.current = null;
        }, 2500);
      }
    },
    [loadVerified],
  );

  const runScanVerify = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code || verifyingRef.current) {
        return;
      }

      verifyingRef.current = true;
      setVerifying(true);
      setResult(null);

      try {
        const response = adminMode
          ? await verifyAdminExaminerLunchCouponScan(code)
          : await verifyExaminerLunchCouponScan(code);
        await handleVerifyResponse(response);
      } catch (err) {
        setRepeatPrompt(null);
        setResult({
          valid: false,
          message: err instanceof Error ? err.message : "Verification failed.",
        });
        window.setTimeout(() => {
          lastScannedRef.current = null;
        }, 2500);
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [handleVerifyResponse, adminMode],
  );

  const runManualVerify = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!manualExamId || !code || verifyingRef.current) {
        return;
      }

      verifyingRef.current = true;
      setVerifying(true);
      setResult(null);

      try {
        const response = adminMode
          ? await verifyAdminExaminerLunchCoupon(manualExamId, code)
          : await verifyExaminerLunchCoupon(manualExamId, code);
        await handleVerifyResponse(response);
      } catch (err) {
        setRepeatPrompt(null);
        setResult({
          valid: false,
          message: err instanceof Error ? err.message : "Verification failed.",
        });
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [handleVerifyResponse, manualExamId, adminMode],
  );

  const handleScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code || lastScannedRef.current === code) {
        return;
      }
      lastScannedRef.current = code;
      await runScanVerify(code);
    },
    [runScanVerify],
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
        (decodedText) => {
          void handleScan(decodedText);
        },
        () => {},
      )
      .catch(() => {
        if (!cancelled) {
          setCameraError("Unable to start camera. Use manual entry instead.");
        }
      });

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [cameraEnabled, handleScan, readerId, stopScanner]);

  useEffect(() => {
    void loadVerified();
  }, [loadVerified]);

  return (
    <SubjectOfficerPanelShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold text-foreground">Coupon verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {adminMode
              ? "Scan or enter reference codes to verify examiners for lunch today."
              : "Scan an examiner's lunch QR code or type their reference code to check them in. Each examiner can be verified once per day."}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm">
              <div className="flex flex-wrap items-end gap-3 border-b border-border/70 bg-muted/15 px-4 py-3.5 sm:px-5">
                <div className="min-w-0 w-full sm:w-auto sm:min-w-38">
                  <span className={compactLabelClass}>Camera</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-0.5 h-9 w-full gap-2 px-3"
                    onClick={() => setCameraEnabled((value) => !value)}
                  >
                    {cameraEnabled ? <CameraOff className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                    {cameraEnabled ? "Stop" : "Start"}
                  </Button>
                </div>
              </div>

              {cameraEnabled ? (
                <>
                  <div id={readerId} className="min-h-[280px] w-full bg-black/5 [&_video]:rounded-none" />
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
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm">
              <div className="border-b border-border/70 bg-muted/15 px-4 py-3 sm:px-5">
                <h3 className="text-sm font-semibold text-foreground">Manual verification</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Select an examination, then enter a reference code.</p>
              </div>
              <div className="border-b border-border/70 px-4 py-3.5 sm:px-5">
                <SubjectOfficerExamSelector
                  assignments={assignments}
                  examId={manualExamId}
                  onExamChange={setManualExamId}
                  loading={assignmentsLoading}
                  compact
                />
              </div>
              <form
                className="px-4 py-4 sm:px-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runManualVerify(manualCode);
                }}
              >
                <label className={formLabelClass} htmlFor="lunch-manual-code">
                  Reference code
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    id="lunch-manual-code"
                    className={cn(formInputClass, "mt-0 h-11 font-mono uppercase sm:flex-1")}
                    value={manualCode}
                    onChange={(event) => setManualCode(event.target.value.toUpperCase())}
                    placeholder="e.g. MATH301-NAE1"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!manualExamId}
                  />
                  <Button
                    type="submit"
                    disabled={verifying || !manualCode.trim() || !manualExamId}
                    className="h-11 w-full sm:w-32"
                  >
                    {verifying ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Verify"}
                  </Button>
                </div>
              </form>
            </div>

            {verifying ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Verifying…
              </div>
            ) : null}

            {result ? <VerificationResultCard result={result} /> : null}
          </div>

          <LunchVerifiedCouponsPanel
            items={verifiedItems}
            loading={verifiedLoading}
            error={verifiedError}
            subtitle="Verified today"
          />
        </div>
      </div>

      {repeatPrompt ? (
        <LunchVerificationRepeatModal
          result={repeatPrompt}
          onDismiss={() => {
            setRepeatPrompt(null);
            lastScannedRef.current = null;
          }}
        />
      ) : null}
    </SubjectOfficerPanelShell>
  );
}
