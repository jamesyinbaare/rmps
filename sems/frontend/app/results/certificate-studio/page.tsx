"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { examLabel } from "@/components/results/exam-label";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  confirmCertificateScan,
  createCertificateScanBatch,
  fetchCertificateScanImageBlob,
  getAllExams,
  getCertificateScanBatch,
  listCertificateScans,
  manualMatchCertificateScan,
  processCertificateScanBatch,
  rejectCertificateScan,
  uploadCertificateScans,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  CertificateRoiRect,
  CertificateScan,
  CertificateScanBatch,
  Exam,
} from "@/types/document";
import { Check, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type RoiKey = "certificate" | "index";
type StudioStep = "setup" | "upload" | "review";

const CERT_COLOR = "#0f766e";
const INDEX_COLOR = "#1d4ed8";
const DRAFT_COLOR = "#b45309";

function ScanThumb({ scanId }: { scanId: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchCertificateScanImageBlob(scanId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scanId]);
  if (!url) {
    return <div className="h-10 w-10 shrink-0 rounded bg-slate-200" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
  );
}

function RoiBox({
  roi,
  color,
  label,
}: {
  roi: CertificateRoiRect | null;
  color: string;
  label: string;
}) {
  if (!roi) return null;
  return (
    <div
      className="pointer-events-none absolute border-2"
      style={{
        left: `${roi.x * 100}%`,
        top: `${roi.y * 100}%`,
        width: `${roi.w * 100}%`,
        height: `${roi.h * 100}%`,
        borderColor: color,
        backgroundColor: `${color}30`,
      }}
    >
      <span
        className="absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {label}
      </span>
    </div>
  );
}

function CertificateStudioInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchParam = searchParams.get("batch");
  const [step, setStep] = useState<StudioStep>("setup");
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | "">("");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [activeRoi, setActiveRoi] = useState<RoiKey>("certificate");
  const [roiCert, setRoiCert] = useState<CertificateRoiRect | null>(null);
  const [roiIndex, setRoiIndex] = useState<CertificateRoiRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sampleInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [batch, setBatch] = useState<CertificateScanBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Working…");
  const [unmatched, setUnmatched] = useState<CertificateScan[]>([]);
  const [showMatched, setShowMatched] = useState(false);
  const [reviewScan, setReviewScan] = useState<CertificateScan | null>(null);
  const [reviewImageUrl, setReviewImageUrl] = useState<string | null>(null);
  const [editIndex, setEditIndex] = useState("");
  const [editCert, setEditCert] = useState("");

  useEffect(() => {
    getAllExams()
      .then((list) => setExams([...list].sort((a, b) => b.year - a.year)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!batchParam) return;
    const id = Number(batchParam);
    if (!Number.isFinite(id) || id <= 0) return;
    getCertificateScanBatch(id)
      .then((loaded) => {
        setBatch(loaded);
        setExamId(loaded.exam_id);
        setRoiCert(loaded.roi_certificate_number);
        setRoiIndex(loaded.roi_index_number);
        setStep((loaded.scans?.length ?? 0) > 0 ? "review" : "upload");
      })
      .catch(() => toast.error("Could not resume that scan batch"));
  }, [batchParam]);

  useEffect(() => {
    return () => {
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
      if (reviewImageUrl) URL.revokeObjectURL(reviewImageUrl);
    };
  }, [sampleUrl, reviewImageUrl]);

  const loadUnmatched = useCallback(async () => {
    if (examId === "") {
      setUnmatched([]);
      return;
    }
    try {
      const data = await listCertificateScans({
        matchStatus: "unmatched",
        examId,
        pageSize: 100,
      });
      setUnmatched(data.items);
    } catch {
      /* ignore */
    }
  }, [examId]);

  useEffect(() => {
    if (examId === "") return;
    void loadUnmatched();
  }, [examId, loadUnmatched]);

  const toNorm = (clientX: number, clientY: number) => {
    const el = imgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  useEffect(() => {
    if (!dragStart) return;
    const onMove = (e: MouseEvent) => {
      setDragCurrent(toNorm(e.clientX, e.clientY));
    };
    const onUp = (e: MouseEvent) => {
      const end = toNorm(e.clientX, e.clientY);
      const x = Math.min(dragStart.x, end.x);
      const y = Math.min(dragStart.y, end.y);
      const w = Math.abs(end.x - dragStart.x);
      const h = Math.abs(end.y - dragStart.y);
      if (w >= 0.01 && h >= 0.01) {
        const rect = { x, y, w, h };
        if (activeRoi === "certificate") setRoiCert(rect);
        else setRoiIndex(rect);
      }
      setDragStart(null);
      setDragCurrent(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragStart, activeRoi]);

  const draftRect = useMemo(() => {
    if (!dragStart || !dragCurrent) return null;
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const w = Math.abs(dragCurrent.x - dragStart.x);
    const h = Math.abs(dragCurrent.y - dragStart.y);
    if (w < 0.01 || h < 0.01) return null;
    return { x, y, w, h };
  }, [dragStart, dragCurrent]);

  const applySampleFile = (file: File | null) => {
    if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    if (!file) {
      setSampleUrl(null);
      return;
    }
    setSampleUrl(URL.createObjectURL(file));
  };

  const setupReady = Boolean(examId && sampleUrl && roiCert && roiIndex);

  const persistBatchUrl = (batchId: number) => {
    router.replace(`/results/certificate-studio?batch=${batchId}`, { scroll: false });
  };

  const patchScan = (updated: CertificateScan) => {
    setBatch((prev) =>
      prev
        ? {
            ...prev,
            scans: prev.scans.some((s) => s.id === updated.id)
              ? prev.scans.map((s) => (s.id === updated.id ? updated : s))
              : [...prev.scans, updated],
          }
        : prev
    );
    setUnmatched((prev) =>
      updated.match_status === "unmatched"
        ? prev.some((s) => s.id === updated.id)
          ? prev.map((s) => (s.id === updated.id ? updated : s))
          : [updated, ...prev]
        : prev.filter((s) => s.id !== updated.id)
    );
  };

  const handleContinueSetup = async () => {
    if (!examId || !roiCert || !roiIndex) {
      toast.error("Select an exam and mark both regions");
      return;
    }
    setBusyLabel("Saving regions…");
    setBusy(true);
    try {
      const created = await createCertificateScanBatch({
        exam_id: examId,
        roi_certificate_number: roiCert,
        roi_index_number: roiIndex,
      });
      setBatch(created);
      persistBatchUrl(created.id);
      setStep("upload");
      toast.success("Regions saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!batch || !fileList?.length) return;
    setBusyLabel("Uploading scans…");
    setBusy(true);
    try {
      const uploaded = await uploadCertificateScans(batch.id, Array.from(fileList));
      setBatch((prev) =>
        prev ? { ...prev, scans: [...uploaded, ...(prev.scans || [])] } : prev
      );
      setStep("review");
      setBusyLabel("Running OCR and matching…");
      const processPromise = processCertificateScanBatch(batch.id);
      const poll = window.setInterval(async () => {
        try {
          const latest = await getCertificateScanBatch(batch.id);
          setBatch(latest);
        } catch {
          /* ignore transient poll errors */
        }
      }, 2000);
      try {
        const refreshed = await processPromise;
        setBatch(refreshed);
      } finally {
        window.clearInterval(poll);
      }
      await loadUnmatched();
      toast.success("Scans processed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const openReview = async (scan: CertificateScan) => {
    setReviewScan(scan);
    setEditIndex(scan.ocr_index_number || "");
    setEditCert(scan.ocr_certificate_number || "");
    if (reviewImageUrl) URL.revokeObjectURL(reviewImageUrl);
    try {
      const blob = await fetchCertificateScanImageBlob(scan.id);
      setReviewImageUrl(URL.createObjectURL(blob));
    } catch {
      setReviewImageUrl(null);
    }
  };

  const handleConfirm = async () => {
    if (!reviewScan) return;
    setBusyLabel("Matching scan…");
    setBusy(true);
    try {
      const updated = await confirmCertificateScan(reviewScan.id, {
        index_number: editIndex.trim() || undefined,
        certificate_number: editCert.trim() || undefined,
      });
      toast.success("Matched");
      setReviewScan(updated);
      patchScan(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setBusy(false);
    }
  };

  const handleManualMatch = async () => {
    if (!reviewScan || !editIndex.trim()) {
      toast.error("Enter index number");
      return;
    }
    setBusyLabel("Matching scan…");
    setBusy(true);
    try {
      const updated = await manualMatchCertificateScan(reviewScan.id, {
        index_number: editIndex.trim(),
        certificate_number: editCert.trim() || undefined,
      });
      toast.success("Matched");
      setReviewScan(updated);
      patchScan(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Match failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!reviewScan) return;
    setBusyLabel("Rejecting scan…");
    setBusy(true);
    try {
      const updated = await rejectCertificateScan(reviewScan.id);
      toast.success("Rejected");
      setReviewScan(null);
      patchScan(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  };

  const needsAttention = useMemo(() => {
    const fromBatch =
      batch?.scans.filter(
        (s) => s.match_status === "unmatched" || s.match_status === "pending"
      ) ?? [];
    if (fromBatch.length) return fromBatch;
    return unmatched;
  }, [batch, unmatched]);

  const matchedScans = batch?.scans.filter((s) => s.match_status === "matched") ?? [];
  const reviewList = showMatched ? matchedScans : needsAttention;

  const progressSteps: { id: StudioStep; label: string; n: number }[] = [
    { id: "setup", label: "Mark regions", n: 1 },
    { id: "upload", label: "Upload", n: 2 },
    { id: "review", label: "Fix matches", n: 3 },
  ];

  const stepIndex = progressSteps.findIndex((s) => s.id === step);

  const canVisitStep = (id: StudioStep) => {
    if (id === "setup") return true;
    if (id === "upload") return Boolean(batch);
    return Boolean(batch && (batch.scans?.length ?? 0) > 0);
  };

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Certificate Studio" showSearch={false} />

        <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-1 sm:flex">
                {progressSteps.map((s, i) => {
                  const done = stepIndex > i;
                  const active = step === s.id;
                  const allowed = canVisitStep(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!allowed}
                      onClick={() => allowed && setStep(s.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                        active && "bg-slate-900 text-white",
                        done && !active && "text-teal-700",
                        !done && !active && "text-slate-400",
                        !allowed && "cursor-not-allowed opacity-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px]",
                          active && "bg-teal-500 text-white",
                          done && !active && "bg-teal-100 text-teal-800",
                          !done && !active && "bg-slate-100 text-slate-500"
                        )}
                      >
                        {done && !active ? <Check className="h-3 w-3" /> : s.n}
                      </span>
                      {s.label}
                      {s.id === "review" && needsAttention.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                          {needsAttention.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/results/certificate-issue-forms"
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Issue forms
              </Link>
              <span className="text-slate-300">·</span>
              <Link
                href="/results/certificates"
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                Manage
              </Link>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {busy && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm shadow-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                  {busyLabel}
                </div>
              </div>
            )}

            {step === "setup" && (
              <div className="flex h-full min-h-[calc(100vh-12rem)] flex-col animate-in fade-in-0 duration-200">
                <div className="mx-auto w-full max-w-5xl px-5 pt-4">
                  <div className="mb-3 max-w-sm">
                    <Label className="mb-1 text-xs text-slate-500">Examination</Label>
                    <Select
                      value={examId === "" ? "" : String(examId)}
                      onValueChange={(v) => setExamId(v ? Number(v) : "")}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue placeholder="Select examination" />
                      </SelectTrigger>
                      <SelectContent>
                        {exams.map((exam) => (
                          <SelectItem key={exam.id} value={String(exam.id)}>
                            {examLabel(exam)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="relative mx-5 mb-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-slate-900">
                  {!sampleUrl ? (
                    <label
                      className="flex w-full max-w-md cursor-pointer flex-col items-center justify-center px-6 py-20 text-center"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f?.type.startsWith("image/")) applySampleFile(f);
                      }}
                    >
                      <p className="text-lg font-medium text-white">Drop a reference scan</p>
                      <p className="mt-1 text-sm text-slate-400">
                        Then drag regions for certificate # and index #
                      </p>
                      <input
                        ref={sampleInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => applySampleFile(e.target.files?.[0] || null)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="mt-5 bg-teal-700 hover:bg-teal-600"
                        onClick={(e) => {
                          e.preventDefault();
                          sampleInputRef.current?.click();
                        }}
                      >
                        Choose image
                      </Button>
                    </label>
                  ) : (
                    <>
                      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur">
                        <div className="flex rounded-full bg-slate-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => setActiveRoi("certificate")}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              activeRoi === "certificate"
                                ? "bg-teal-700 text-white"
                                : "text-slate-600"
                            )}
                          >
                            Certificate #
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveRoi("index")}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              activeRoi === "index" ? "bg-blue-700 text-white" : "text-slate-600"
                            )}
                          >
                            Index #
                          </button>
                        </div>
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full",
                            roiCert ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-400"
                          )}
                        >
                          {roiCert ? <Check className="h-3 w-3" /> : "1"}
                        </span>
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full",
                            roiIndex ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-400"
                          )}
                        >
                          {roiIndex ? <Check className="h-3 w-3" /> : "2"}
                        </span>
                      </div>

                      <div className="relative max-h-[min(68vh,720px)] max-w-full p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          ref={imgRef}
                          src={sampleUrl}
                          alt="Reference scan"
                          className="max-h-[min(68vh,720px)] max-w-full cursor-crosshair select-none rounded shadow-2xl"
                          draggable={false}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const p = toNorm(e.clientX, e.clientY);
                            setDragStart(p);
                            setDragCurrent(p);
                          }}
                        />
                        <RoiBox roi={roiCert} color={CERT_COLOR} label="Certificate #" />
                        <RoiBox roi={roiIndex} color={INDEX_COLOR} label="Index #" />
                        <RoiBox roi={draftRect} color={DRAFT_COLOR} label="Drawing" />
                      </div>
                      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] text-slate-400">
                        Drag on the image to mark the active region
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === "upload" && (
              <div className="flex h-full min-h-[calc(100vh-12rem)] animate-in fade-in-0 duration-200 items-center justify-center p-6">
                <label
                  className="flex w-full max-w-xl cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white px-8 py-24 text-center transition-colors hover:border-teal-500 hover:bg-teal-50/30"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleUpload(e.dataTransfer.files);
                  }}
                >
                  <p className="text-xl font-medium text-slate-900">Drop certificate scans</p>
                  <p className="mt-2 text-sm text-slate-500">
                    JPEG or PNG · OCR and matching run automatically
                  </p>
                  {batch && <p className="mt-3 text-xs text-slate-400">Batch #{batch.id}</p>}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={!batch || busy}
                    onChange={(e) => void handleUpload(e.target.files)}
                  />
                  <Button
                    type="button"
                    className="mt-6 bg-teal-800 hover:bg-teal-700"
                    disabled={!batch || busy}
                    onClick={(e) => {
                      e.preventDefault();
                      uploadInputRef.current?.click();
                    }}
                  >
                    Choose files
                  </Button>
                </label>
              </div>
            )}

            {step === "review" && (
              <div className="mx-auto w-full max-w-3xl animate-in fade-in-0 duration-200 px-5 py-6">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {showMatched ? "Matched" : "Needs attention"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {showMatched
                        ? `${matchedScans.length} matched`
                        : `${needsAttention.length} to review`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-teal-800 hover:underline"
                    onClick={() => setShowMatched((v) => !v)}
                  >
                    {showMatched ? "Show needs attention" : `Show matched (${matchedScans.length})`}
                  </button>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  {reviewList.length === 0 ? (
                    <div className="px-6 py-16 text-center text-sm text-slate-500">
                      {showMatched
                        ? "No matched scans yet."
                        : "Nothing to fix — all clear, or upload scans first."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {reviewList.map((scan) => (
                        <li key={scan.id}>
                          <button
                            type="button"
                            onClick={() => void openReview(scan)}
                            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50"
                          >
                            <ScanThumb scanId={scan.id} />
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                scan.match_status === "matched" && "bg-teal-600",
                                scan.match_status === "unmatched" && "bg-amber-500",
                                scan.match_status === "pending" && "bg-slate-400",
                                scan.match_status === "rejected" && "bg-rose-500"
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-slate-900">
                                {scan.suggested_candidate_name || scan.original_filename}
                              </div>
                              <div className="truncate text-xs text-slate-500">
                                {scan.error_message ||
                                  `${scan.ocr_index_number || "—"} · ${scan.ocr_certificate_number || "—"}`}
                              </div>
                            </div>
                            <Badge variant="outline" className="shrink-0 capitalize">
                              {scan.match_status}
                            </Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={step === "setup"}
              onClick={() => {
                if (step === "upload") setStep("setup");
                else if (step === "review") setStep("upload");
              }}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>

            {step === "setup" && (
              <Button
                className="min-w-[140px] bg-teal-800 hover:bg-teal-700"
                disabled={!setupReady || busy}
                onClick={handleContinueSetup}
              >
                Continue
              </Button>
            )}
            {step === "upload" && (
              <Button
                className="min-w-[140px] bg-teal-800 hover:bg-teal-700"
                disabled={!batch || busy}
                onClick={() => uploadInputRef.current?.click()}
              >
                Upload & process
              </Button>
            )}
            {step === "review" && (
              <Button className="min-w-[140px] bg-teal-800 hover:bg-teal-700" asChild>
                <Link href="/results/certificate-issue-forms">
                  {needsAttention.length === 0 ? "Issue forms" : "Continue to issue forms"}
                </Link>
              </Button>
            )}
          </footer>
        </div>
      </div>

      <Dialog open={!!reviewScan} onOpenChange={(open) => !open && setReviewScan(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Review
              {reviewScan && (
                <Badge variant="outline" className="capitalize font-normal">
                  {reviewScan.match_status}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{reviewScan?.original_filename}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="overflow-hidden rounded-xl bg-slate-900">
              {reviewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={reviewImageUrl}
                  alt="Scan"
                  className="max-h-[55vh] w-full object-contain"
                />
              ) : (
                <div className="flex h-56 items-center justify-center text-sm text-slate-400">
                  Image unavailable
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {reviewScan?.suggested_candidate_name && (
                <div className="rounded-xl border border-teal-100 bg-teal-50/80 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-teal-800/70">
                    Candidate
                  </div>
                  <div className="mt-0.5 font-medium text-slate-900">
                    {reviewScan.suggested_candidate_name}
                  </div>
                  <div className="font-mono text-xs text-slate-600">
                    {reviewScan.suggested_index_number}
                  </div>
                </div>
              )}
              {reviewScan?.error_message && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {reviewScan.error_message}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="rev-index">Index number</Label>
                <Input
                  id="rev-index"
                  className="font-mono"
                  value={editIndex}
                  onChange={(e) => setEditIndex(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rev-cert">Certificate number</Label>
                <Input
                  id="rev-cert"
                  className="font-mono"
                  value={editCert}
                  onChange={(e) => setEditCert(e.target.value)}
                />
              </div>
              <DialogFooter className="mt-auto flex-col gap-2 sm:flex-col">
                <Button
                  className="w-full bg-teal-800 hover:bg-teal-700"
                  onClick={handleConfirm}
                  disabled={busy}
                >
                  Confirm
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={handleManualMatch}
                  disabled={busy}
                >
                  Match by index
                </Button>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={handleReject}
                  disabled={busy}
                >
                  Reject
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

export default function CertificateStudioPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout title="Certificates">
          <TopBar title="Certificate Studio" showSearch={false} />
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading studio…
          </div>
        </DashboardLayout>
      }
    >
      <CertificateStudioInner />
    </Suspense>
  );
}
