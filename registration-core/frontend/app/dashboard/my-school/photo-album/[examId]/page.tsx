"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  downloadMissingPhotosSummary,
  getPhotoAlbum,
  getPhotoAlbumSummary,
  listAllSchoolExams,
  listSchoolCandidates,
  listSchoolProgrammes,
} from "@/lib/api";
import type {
  PhotoAlbumItem,
  PhotoBulkUploadResponse,
  PhotoExamSummaryItem,
  Programme,
  RegistrationExam,
} from "@/types";
import {
  uploadBulkPhotosInChunks,
} from "@/lib/bulk-photo-upload";
import type { BulkUploadProgressState } from "@/lib/bulk-upload";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/SearchableSelect";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { BulkUploadProgressCard } from "@/components/bulk/BulkUploadProgressCard";
import { PhotoAlbumCandidateGrid } from "@/components/school/PhotoAlbumCandidateGrid";
import { isExamRegistrationOpen } from "@/components/school/SchoolExamRegisterCard";

function examTitle(exam: RegistrationExam): string {
  const type = exam.programme_type_name || exam.exam_type;
  const series = exam.exam_series_short_name || exam.exam_series;
  return [type, series, exam.year].filter(Boolean).join(" · ");
}

type PhotoStatusFilter = "all" | "with" | "without";

export default function PhotoAlbumExamDetailPage() {
  const router = useRouter();
  const params = useParams();
  const examIdParam = params.examId as string | undefined;
  const examId = examIdParam ? parseInt(examIdParam, 10) : NaN;

  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [summary, setSummary] = useState<PhotoExamSummaryItem | null>(null);
  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAlbum, setLoadingAlbum] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [programmeId, setProgrammeId] = useState<number | undefined>(undefined);
  const [photoStatus, setPhotoStatus] = useState<PhotoStatusFilter>("all");

  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] =
    useState<BulkUploadProgressState | null>(null);
  const [uploadResult, setUploadResult] = useState<PhotoBulkUploadResponse | null>(
    null
  );
  const [downloadingMissing, setDownloadingMissing] = useState(false);

  const uploadInProgress = uploading;

  const refreshSummary = useCallback(async (id: number) => {
    try {
      const response = await getPhotoAlbumSummary(id);
      setSummary(response.items[0] ?? {
        exam_id: id,
        total: 0,
        with_photo: 0,
        without_photo: 0,
      });
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadAlbum = useCallback(
    async (id: number, progId?: number, status?: PhotoStatusFilter) => {
      setLoadingAlbum(true);
      try {
        const hasPhoto =
          status === "with" ? true : status === "without" ? false : undefined;
        const response = await getPhotoAlbum(1, 10000, id, progId, hasPhoto);
        setItems(response.items);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load photo album");
        setItems([]);
      } finally {
        setLoadingAlbum(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!Number.isInteger(examId) || examId <= 0) {
      toast.error("Invalid examination");
      router.replace("/dashboard/my-school/photo-album");
      return;
    }

    const init = async () => {
      setLoading(true);
      try {
        const [examsData, programmesData, candidates] = await Promise.all([
          listAllSchoolExams(),
          listSchoolProgrammes(examId),
          listSchoolCandidates(examId),
        ]);
        const found = examsData.find((e) => e.id === examId);
        if (!found) {
          toast.error("Examination not found for your school");
          router.replace("/dashboard/my-school/photo-album");
          return;
        }
        setExam(found);
        const usedProgrammeIds = new Set(
          candidates
            .map((c) => c.programme_id)
            .filter((id): id is number => id != null)
        );
        setProgrammes(
          programmesData
            .filter((p) => usedProgrammeIds.has(p.id))
            .sort((a, b) => a.code.localeCompare(b.code))
        );
        document.title = `${examTitle(found)} - Photo Album`;
        await Promise.all([
          refreshSummary(examId),
          loadAlbum(examId, undefined, "all"),
        ]);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load examination");
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [examId, router, refreshSummary, loadAlbum]);

  useEffect(() => {
    if (!exam) return;
    void loadAlbum(exam.id, programmeId, photoStatus);
  }, [programmeId, photoStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.candidate_name.toLowerCase().includes(query) ||
        (item.index_number &&
          item.index_number.toLowerCase().includes(query)) ||
        (item.registration_number &&
          item.registration_number.toLowerCase().includes(query))
    );
  }, [items, searchQuery]);

  const registrationOpen = exam ? isExamRegistrationOpen(exam) : false;
  const canBulkUpload = Boolean(exam) && registrationOpen;

  const filtersActive =
    Boolean(searchQuery.trim()) ||
    programmeId !== undefined ||
    photoStatus !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setProgrammeId(undefined);
    setPhotoStatus("all");
  };

  const coverage =
    summary && summary.total > 0
      ? Math.round((summary.with_photo / summary.total) * 1000) / 10
      : 0;

  const resetBulkUploadState = () => {
    setSelectedFiles([]);
    setUploadResult(null);
    setUploadProgress(null);
    setUploading(false);
  };

  const handleDownloadMissingPhotos = async () => {
    if (!exam) return;
    setDownloadingMissing(true);
    try {
      await downloadMissingPhotosSummary(exam.id);
      toast.success("Missing photos PDF downloaded");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to download missing photos PDF";
      toast.error(message);
    } finally {
      setDownloadingMissing(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!exam || selectedFiles.length === 0) {
      toast.error("Please select at least one photo file");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setUploadProgress(null);
    try {
      const result = await uploadBulkPhotosInChunks({
        examId: exam.id,
        files: selectedFiles,
        onProgress: setUploadProgress,
      });
      setUploadResult(result);

      if (result.successful > 0) {
        toast.success(`Successfully uploaded ${result.successful} photo(s)`);
        await Promise.all([
          refreshSummary(exam.id),
          loadAlbum(exam.id, programmeId, photoStatus),
        ]);
      }

      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(`${result.failed} failed, ${result.skipped} skipped`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload photos";
      setUploadProgress((prev) =>
        prev
          ? {
              ...prev,
              phase: "error",
              message,
            }
          : {
              phase: "error",
              percent: 0,
              currentBatch: 0,
              totalBatches: 0,
              totalRows: selectedFiles.length,
              successful: 0,
              failed: 0,
              remaining: selectedFiles.length,
              message,
            }
      );
      toast.error(message);
      console.error("Bulk upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!exam) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" size="sm" className="h-8 px-2 shadow-none" asChild>
            <Link href="/dashboard/my-school/photo-album">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Photo Album
            </Link>
          </Button>
        }
        title={examTitle(exam)}
        subtitle="View and manage candidate photos for this examination"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="shadow-none"
              disabled={
                downloadingMissing ||
                !summary ||
                summary.without_photo === 0
              }
              title={
                summary && summary.without_photo === 0
                  ? "All candidates have photos"
                  : undefined
              }
              onClick={handleDownloadMissingPhotos}
            >
              {downloadingMissing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download missing photos
            </Button>
            <Button
              variant="outline"
              className="shadow-none"
              disabled={!canBulkUpload}
              title={
                !canBulkUpload
                  ? "Upload is disabled because registration is not open"
                  : undefined
              }
              onClick={() => setBulkUploadOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              Bulk Upload
            </Button>
          </div>
        }
      />

      <div className="rounded-lg border border-border bg-card p-5 shadow-none">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              registrationOpen
                ? "border-success/30 bg-success/10 text-success shadow-none"
                : "text-muted-foreground shadow-none"
            }
          >
            {registrationOpen ? "Registration open" : "Registration closed"}
          </Badge>
          {exam.registration_period ? (
            <span className="text-sm text-muted-foreground">
              {new Date(
                exam.registration_period.registration_start_date
              ).toLocaleDateString()}{" "}
              –{" "}
              {new Date(
                exam.registration_period.registration_end_date
              ).toLocaleDateString()}
            </span>
          ) : null}
        </div>
      </div>

      <StatStrip
        items={[
          {
            label: "Total candidates",
            value: (summary?.total ?? 0).toLocaleString(),
          },
          {
            label: "With photo",
            value: (summary?.with_photo ?? 0).toLocaleString(),
            hint: summary && summary.total > 0 ? `${coverage}% coverage` : undefined,
          },
          {
            label: "Without photo",
            value: (summary?.without_photo ?? 0).toLocaleString(),
          },
          {
            label: "Coverage",
            value: `${coverage}%`,
          },
        ]}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, index, or registration…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 shadow-none"
            />
          </div>
          <div className="w-full sm:w-[220px]">
            <SearchableSelect
              options={programmes.map((programme) => ({
                value: programme.id.toString(),
                label: programme.name
                  ? `${programme.code} — ${programme.name}`
                  : programme.code,
              }))}
              value={programmeId ? programmeId.toString() : ""}
              onValueChange={(value) => {
                setProgrammeId(value ? parseInt(value, 10) : undefined);
              }}
              placeholder="All programmes"
              searchPlaceholder="Search programmes…"
              emptyMessage="No programmes found"
              className="w-full"
            />
          </div>
          <Select
            value={photoStatus}
            onValueChange={(value) =>
              setPhotoStatus(value as PhotoStatusFilter)
            }
          >
            <SelectTrigger className="h-9 w-full shadow-none sm:w-[170px]">
              <SelectValue placeholder="Photo status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All photos</SelectItem>
              <SelectItem value="with">With photo</SelectItem>
              <SelectItem value="without">Without photo</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shadow-none"
              onClick={clearFilters}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Showing {filteredItems.length.toLocaleString()}
          {filtersActive ? " filtered" : ""} candidates
        </p>
      </div>

      <PhotoAlbumCandidateGrid
        items={filteredItems}
        loading={loadingAlbum}
        emptyMessage="No candidates match your current filters."
        onPhotoChanged={() => {
          if (!exam) return;
          void Promise.all([
            refreshSummary(exam.id),
            loadAlbum(exam.id, programmeId, photoStatus),
          ]);
        }}
      />

      <Dialog
        open={bulkUploadOpen}
        onOpenChange={(open) => {
          if (!open && uploadInProgress) return;
          setBulkUploadOpen(open);
          if (!open) resetBulkUploadState();
        }}
      >
        <DialogContent
          className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-x-hidden overflow-y-auto"
          onInteractOutside={(e) => {
            if (uploadInProgress) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (uploadInProgress) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Bulk Upload Photos</DialogTitle>
          </DialogHeader>
          <div className="min-w-0 space-y-4">
            {uploadProgress ? (
              <BulkUploadProgressCard
                progress={uploadProgress}
                mode="upload"
                unitLabel="photos"
                onDismiss={
                  uploadProgress.phase === "done" ||
                  uploadProgress.phase === "error"
                    ? () => setUploadProgress(null)
                    : undefined
                }
              />
            ) : null}

            {!uploadInProgress && (
              <>
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    Upload multiple photos at once. Each file is matched to a
                    candidate by the <strong>last 4 characters</strong> of their
                    registration number (or the full registration number).
                    Photos are sent in small batches with automatic retry on
                    poor connections.
                  </p>
                  <p className="font-medium text-foreground">
                    File naming requirements:
                  </p>
                  <ul className="mt-1 list-inside list-disc space-y-1">
                    <li>
                      Name the file with the last 4 characters of the
                      registration number (e.g.{" "}
                      <code className="rounded bg-muted px-1">0000.jpg</code> →{" "}
                      <code className="rounded bg-muted px-1">F17090260000</code>
                      ,{" "}
                      <code className="rounded bg-muted px-1">0004.jpg</code> →{" "}
                      <code className="rounded bg-muted px-1">F17090260004</code>
                      )
                    </li>
                    <li>
                      Full registration numbers as filenames are also accepted
                    </li>
                    <li>Only JPEG images are allowed</li>
                    <li>Dimensions: 155×191 pixels (passport photo standard)</li>
                    <li>Max file size: 2MB</li>
                  </ul>
                </div>

                <div className="min-w-0">
                  <label className="mb-2 block text-sm font-medium">
                    Select Photos
                  </label>
                  <div className="min-w-0 rounded-lg border border-dashed border-border p-6 text-center">
                    <input
                      type="file"
                      id="bulk-upload-input"
                      multiple
                      accept="image/jpeg"
                      disabled={uploading}
                      onChange={(e) => {
                        if (e.target.files) {
                          setSelectedFiles(Array.from(e.target.files));
                          setUploadResult(null);
                          setUploadProgress(null);
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="bulk-upload-input"
                      className="flex cursor-pointer flex-col items-center gap-2"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Click to select photos or drag and drop
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {selectedFiles.length > 0
                          ? `${selectedFiles.length} file(s) selected`
                          : "No files selected"}
                      </span>
                    </label>
                  </div>

                  {selectedFiles.length > 0 && (
                    <div className="mt-4 max-h-48 min-w-0 space-y-2 overflow-y-auto">
                      {selectedFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex min-w-0 items-center gap-2 rounded-lg bg-muted p-2"
                        >
                          <span
                            className="min-w-0 flex-1 truncate text-sm"
                            title={file.name}
                          >
                            {file.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={uploading}
                            onClick={() =>
                              setSelectedFiles((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                            className="h-6 w-6 shrink-0 p-0"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {uploadResult && !uploadInProgress && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Success: {uploadResult.successful}</span>
                  </div>
                  <div className="flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed: {uploadResult.failed}</span>
                  </div>
                  {uploadResult.skipped > 0 && (
                    <div className="flex items-center gap-1 text-warning">
                      <AlertCircle className="h-4 w-4" />
                      <span>Skipped: {uploadResult.skipped}</span>
                    </div>
                  )}
                </div>

                {uploadResult.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
                    <div className="mb-2 text-xs font-medium">Errors:</div>
                    <div className="space-y-1">
                      {uploadResult.errors.map((error, idx) => (
                        <div
                          key={idx}
                          className="min-w-0 rounded bg-destructive/5 p-1 text-xs text-destructive"
                        >
                          <div
                            className="truncate font-medium"
                            title={error.filename}
                          >
                            {error.filename}
                          </div>
                          {error.index_number && (
                            <div className="text-muted-foreground">
                              Index: {error.index_number}
                            </div>
                          )}
                          {error.registration_number && (
                            <div className="text-muted-foreground">
                              Reg: {error.registration_number}
                            </div>
                          )}
                          <div className="break-words">{error.error_message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                className="shadow-none"
                disabled={uploadInProgress}
                onClick={() => {
                  setBulkUploadOpen(false);
                  resetBulkUploadState();
                }}
              >
                {uploadProgress?.phase === "done" ||
                uploadProgress?.phase === "error"
                  ? "Close"
                  : "Cancel"}
              </Button>
              {!uploadInProgress &&
                uploadProgress?.phase !== "done" && (
                  <Button
                    onClick={() => void handleBulkUpload()}
                    disabled={selectedFiles.length === 0 || uploading}
                    className="shadow-none"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload {selectedFiles.length} Photo(s)
                      </>
                    )}
                  </Button>
                )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
