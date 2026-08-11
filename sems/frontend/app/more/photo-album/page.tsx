"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PhotoAlbumPdfPreview } from "@/components/PhotoAlbumPdfPreview";
import { CandidatePhotoUpload } from "@/components/CandidatePhotoUpload";
import { examLabel } from "@/components/results/exam-label";
import {
  getPhotoAlbum,
  getAllExams,
  listSchools,
  getPhotoFile,
  listProgrammes,
  bulkUploadPhotos,
} from "@/lib/api";
import type {
  PhotoAlbumItem,
  Exam,
  School,
  Programme,
  PhotoBulkUploadResponse,
} from "@/types/document";
import { toast } from "sonner";
import {
  Search,
  User,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  Images,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

type HasPhotoFilter = "all" | "with" | "without";
type ViewMode = "idle" | "search" | "browse";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BROWSE_PAGE_SIZE = 48;
const SEARCH_PAGE_SIZE = 24;

function photoSrc(item: PhotoAlbumItem): string | null {
  if (!item.photo) return null;
  return `${API_BASE}/api/v1/candidates/${item.candidate_id}/photos/${item.photo.id}/file`;
}

export default function PhotoAlbumPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | undefined>(undefined);
  const [hasPhotoFilter, setHasPhotoFilter] = useState<HasPhotoFilter>("all");

  const [lookupQuery, setLookupQuery] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("idle");

  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAlbumItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<PhotoBulkUploadResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<PhotoAlbumItem | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === selectedExamId) ?? null,
    [exams, selectedExamId]
  );
  const selectedSchool = useMemo(
    () => schools.find((s) => s.id === selectedSchoolId) ?? null,
    [schools, selectedSchoolId]
  );
  const selectedProgramme = useMemo(
    () => programmes.find((p) => p.id === selectedProgrammeId) ?? null,
    [programmes, selectedProgrammeId]
  );

  const examOptions = useMemo(
    () =>
      exams
        .slice()
        .sort((a, b) => b.year - a.year || a.exam_type.localeCompare(b.exam_type))
        .map((exam) => ({ value: exam.id, label: examLabel(exam) })),
    [exams]
  );

  const schoolOptions = useMemo(
    () =>
      schools
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((school) => ({
          value: school.id,
          label: `${school.name} (${school.code})`,
        })),
    [schools]
  );

  const programmeOptions = useMemo(
    () => programmes.map((p) => ({ value: p.id, label: p.name })),
    [programmes]
  );

  useEffect(() => {
    async function loadOptions() {
      setOptionsLoading(true);
      try {
        const [allExams, programmesRes] = await Promise.all([
          getAllExams(),
          listProgrammes(1, 100),
        ]);
        const allSchools: School[] = [];
        let schoolPage = 1;
        let hasMore = true;
        while (hasMore) {
          const batch = await listSchools(schoolPage, 100);
          allSchools.push(...batch);
          hasMore = batch.length === 100;
          schoolPage++;
        }
        setExams(allExams);
        setSchools(allSchools);
        setProgrammes(programmesRes.items || []);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load filter options");
      } finally {
        setOptionsLoading(false);
      }
    }
    loadOptions();
  }, []);

  const resetResults = () => {
    setItems([]);
    setTotal(0);
    setPage(1);
    setTotalPages(0);
    setError(null);
    setViewMode("idle");
    setActiveSearchQuery("");
  };

  const fetchAlbum = useCallback(
    async (opts: {
      mode: "search" | "browse";
      page: number;
      searchQuery?: string;
    }) => {
      if (!selectedExamId) return;

      if (opts.mode === "search" && !opts.searchQuery?.trim()) {
        toast.error("Enter an index number or name to search");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await getPhotoAlbum({
          page: opts.page,
          page_size: opts.mode === "search" ? SEARCH_PAGE_SIZE : BROWSE_PAGE_SIZE,
          exam_id: selectedExamId,
          school_id: selectedSchoolId ?? undefined,
          programme_id: selectedProgrammeId,
          has_photo:
            opts.mode === "browse" && hasPhotoFilter !== "all"
              ? hasPhotoFilter === "with"
              : undefined,
          search_query: opts.mode === "search" ? opts.searchQuery?.trim() : undefined,
        });
        setItems(response.items);
        setTotal(response.total);
        setPage(response.page);
        setTotalPages(response.total_pages);
        setViewMode(opts.mode);
        setActiveSearchQuery(opts.mode === "search" ? opts.searchQuery?.trim() || "" : "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        setItems([]);
        setTotal(0);
        setTotalPages(0);
        toast.error(opts.mode === "search" ? "Search failed" : "Failed to load album");
      } finally {
        setLoading(false);
      }
    },
    [selectedExamId, selectedSchoolId, selectedProgrammeId, hasPhotoFilter]
  );

  const handleFindCandidate = () => {
    void fetchAlbum({ mode: "search", page: 1, searchQuery: lookupQuery });
  };

  const handleLoadAlbum = () => {
    if (!selectedExamId) {
      toast.error("Select an examination first");
      return;
    }
    void fetchAlbum({ mode: "browse", page: 1 });
  };

  const handlePageChange = (nextPage: number) => {
    if (viewMode === "search") {
      void fetchAlbum({ mode: "search", page: nextPage, searchQuery: activeSearchQuery });
    } else if (viewMode === "browse") {
      void fetchAlbum({ mode: "browse", page: nextPage });
    }
  };

  const handleViewPhoto = async (item: PhotoAlbumItem) => {
    if (!item.photo) return;
    setLoadingPhoto(true);
    setSelectedPhoto(item);
    try {
      const url = await getPhotoFile(item.candidate_id, item.photo.id);
      if (url) setPhotoUrl(url);
      else {
        toast.error("Photo file not found");
        setSelectedPhoto(null);
      }
    } catch {
      toast.error("Failed to load photo");
      setSelectedPhoto(null);
    } finally {
      setLoadingPhoto(false);
    }
  };

  const openUploadDialog = (item: PhotoAlbumItem) => {
    setUploadTarget(item);
    setUploadDialogOpen(true);
  };

  const refreshCurrentView = () => {
    if (viewMode === "search" && activeSearchQuery) {
      void fetchAlbum({ mode: "search", page, searchQuery: activeSearchQuery });
    } else if (viewMode === "browse") {
      void fetchAlbum({ mode: "browse", page });
    }
  };

  const handleUploadSuccess = () => {
    toast.success(uploadTarget?.photo ? "Photo replaced" : "Photo uploaded");
    setUploadDialogOpen(false);
    setUploadTarget(null);
    refreshCurrentView();
  };

  const withPhotoCount = items.filter((i) => i.photo).length;
  const withoutPhotoCount = items.length - withPhotoCount;

  const canBulkUpload = selectedExamId !== null;
  const canDownloadPdf =
    selectedExamId !== null &&
    selectedSchoolId !== null &&
    viewMode === "browse" &&
    items.length > 0;

  const handleBulkUpload = async () => {
    if (!selectedExamId || selectedFiles.length === 0) {
      toast.error("Select an exam and at least one JPEG file");
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await bulkUploadPhotos(selectedExamId, selectedFiles);
      setUploadResult(result);
      if (result.successful > 0) {
        toast.success(`Uploaded ${result.successful} photo(s)`);
        refreshCurrentView();
      }
      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(`${result.failed} failed, ${result.skipped} skipped`);
      }
    } catch (err) {
      toast.error("Failed to upload photos");
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const addFiles = (files: FileList | File[]) => {
    const jpegs = Array.from(files).filter(
      (f) => f.type === "image/jpeg" || /\.jpe?g$/i.test(f.name)
    );
    if (jpegs.length === 0) {
      toast.error("Only JPEG files are allowed");
      return;
    }
    setSelectedFiles((prev) => [...prev, ...jpegs]);
    setUploadResult(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <DashboardLayout>
      <div className="flex h-full flex-col">
        <TopBar title="Photo Album" />
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1400px] space-y-6 p-6">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="rounded-md bg-muted p-2">
                    <Images className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight">Passport Photos</h1>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Select an examination, then find a candidate by index/name or explicitly load a
                  school album. Nothing loads until you search or click Load album.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={!canBulkUpload}
                  onClick={() => setBulkUploadOpen(true)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Bulk Upload
                </Button>
                <Button
                  variant="outline"
                  disabled={!canDownloadPdf}
                  title={
                    !selectedSchoolId
                      ? "Load a school album first to download PDF"
                      : viewMode !== "browse"
                        ? "Load the album to download PDF"
                        : undefined
                  }
                  onClick={() => setPdfPreviewOpen(true)}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            </header>

            {/* Exam scope */}
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="max-w-md space-y-1.5">
                <Label className="text-xs text-muted-foreground">Examination</Label>
                <SearchableSelect
                  options={examOptions}
                  value={selectedExamId ?? ""}
                  onValueChange={(v) => {
                    setSelectedExamId(v === "" || v === "all" ? null : Number(v));
                    setSelectedSchoolId(null);
                    setSelectedProgrammeId(undefined);
                    setHasPhotoFilter("all");
                    setLookupQuery("");
                    resetResults();
                  }}
                  placeholder={optionsLoading ? "Loading exams…" : "Select examination"}
                  searchPlaceholder="Search examinations…"
                  emptyMessage="No examinations found"
                  disabled={optionsLoading}
                />
              </div>
            </section>

            {selectedExamId ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Find candidate */}
                <section className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-semibold">Find a candidate</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Search by index number or name for this exam — does not load the full album.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={lookupQuery}
                        onChange={(e) => setLookupQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleFindCandidate();
                        }}
                        placeholder="e.g. 074221250034 or candidate name"
                        className="pl-8"
                      />
                    </div>
                    <Button
                      onClick={handleFindCandidate}
                      disabled={loading || !lookupQuery.trim()}
                    >
                      {loading && viewMode !== "browse" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Search"
                      )}
                    </Button>
                  </div>
                </section>

                {/* Browse album */}
                <section className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="mb-3">
                    <h2 className="text-sm font-semibold">Browse album</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Optionally narrow by school/programme, then load explicitly.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">School</Label>
                      <SearchableSelect
                        options={schoolOptions}
                        value={selectedSchoolId ?? "all"}
                        onValueChange={(v) => {
                          setSelectedSchoolId(v === "" || v === "all" ? null : Number(v));
                          if (viewMode === "browse") resetResults();
                        }}
                        placeholder="All schools"
                        allowAll
                        allLabel="All schools"
                        searchPlaceholder="Search schools…"
                        disabled={optionsLoading}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Programme</Label>
                      <SearchableSelect
                        options={programmeOptions}
                        value={selectedProgrammeId ?? "all"}
                        onValueChange={(v) => {
                          setSelectedProgrammeId(
                            v === "" || v === "all" ? undefined : Number(v)
                          );
                          if (viewMode === "browse") resetResults();
                        }}
                        placeholder="All programmes"
                        allowAll
                        allLabel="All programmes"
                        searchPlaceholder="Search programmes…"
                        disabled={optionsLoading}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: "all", label: "All" },
                        { id: "with", label: "With photo" },
                        { id: "without", label: "Missing" },
                      ] as const
                    ).map((opt) => (
                      <Button
                        key={opt.id}
                        type="button"
                        size="sm"
                        variant={hasPhotoFilter === opt.id ? "secondary" : "ghost"}
                        className="h-8"
                        onClick={() => {
                          setHasPhotoFilter(opt.id);
                          if (viewMode === "browse") resetResults();
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                    <Button className="ml-auto" onClick={handleLoadAlbum} disabled={loading}>
                      {loading && viewMode !== "search" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        "Load album"
                      )}
                    </Button>
                  </div>
                  {!selectedSchoolId && (
                    <p className="mt-2 text-xs text-amber-700">
                      Tip: pick a school before loading — full-exam albums can be large.
                    </p>
                  )}
                </section>
              </div>
            ) : null}

            {/* Results */}
            {!selectedExamId ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 py-20 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <Images className="h-8 w-8 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-medium">Select an examination</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Then search for a candidate to upload or replace a photo, or load a school album to
                  browse.
                </p>
              </div>
            ) : viewMode === "idle" && !loading ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
                <Search className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <h2 className="text-base font-medium">Ready when you are</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Use <span className="font-medium text-foreground">Find a candidate</span> for a
                  quick lookup, or <span className="font-medium text-foreground">Load album</span>{" "}
                  to browse. Candidates are not loaded until you take one of those actions.
                </p>
              </div>
            ) : loading && items.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => refreshCurrentView()}
                >
                  Retry
                </Button>
              </div>
            ) : viewMode !== "idle" ? (
              <section className="space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    {viewMode === "search" ? (
                      <>
                        Search results for{" "}
                        <span className="font-medium text-foreground">
                          &quot;{activeSearchQuery}&quot;
                        </span>
                        {" · "}
                        <span className="text-foreground">{total}</span> match
                        {total === 1 ? "" : "es"}
                      </>
                    ) : (
                      <>
                        Album
                        {selectedSchool ? ` · ${selectedSchool.name}` : ""}
                        {selectedProgramme ? ` · ${selectedProgramme.name}` : ""}
                        {" · "}
                        <span className="text-foreground">{total}</span> candidates
                        {items.length > 0 && (
                          <>
                            {" · "}
                            {withPhotoCount} with photos · {withoutPhotoCount} missing
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Button variant="ghost" size="sm" onClick={resetResults}>
                      Clear results
                    </Button>
                  </div>
                </div>

                <Separator />

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
                    <ImageIcon className="mb-3 h-10 w-10 text-muted-foreground/50" />
                    <h2 className="text-base font-medium">No candidates found</h2>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                      {viewMode === "search"
                        ? "Try a different index number or name."
                        : "Adjust school, programme, or photo filters and load again."}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {items.map((item) => {
                        const src = photoSrc(item);
                        return (
                          <article
                            key={item.candidate_id}
                            className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              className="relative aspect-[3/4] cursor-pointer bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() =>
                                item.photo ? handleViewPhoto(item) : openUploadDialog(item)
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  if (item.photo) handleViewPhoto(item);
                                  else openUploadDialog(item);
                                }
                              }}
                            >
                              {src ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={src}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center">
                                  <User className="h-9 w-9 text-muted-foreground/40" />
                                  <span className="text-xs text-muted-foreground">No photo</span>
                                </div>
                              )}

                              <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                <div className="pointer-events-auto flex w-full gap-1.5 p-2">
                                  {item.photo ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 flex-1 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleViewPhoto(item);
                                        }}
                                      >
                                        View
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="h-7 flex-1 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openUploadDialog(item);
                                        }}
                                      >
                                        <RefreshCw className="mr-1 h-3 w-3" />
                                        Replace
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm"
                                      className="h-7 w-full text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openUploadDialog(item);
                                      }}
                                    >
                                      <Upload className="mr-1 h-3 w-3" />
                                      Upload
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {!item.photo && (
                                <Badge
                                  variant="outline"
                                  className="absolute left-2 top-2 border-amber-500/40 bg-background/90 text-amber-700"
                                >
                                  Missing
                                </Badge>
                              )}
                            </div>

                            <div className="space-y-0.5 border-t p-2.5">
                              <p
                                className="truncate text-sm font-medium leading-tight"
                                title={item.candidate_name}
                              >
                                {item.candidate_name}
                              </p>
                              <p
                                className="truncate font-mono text-xs text-muted-foreground"
                                title={item.index_number}
                              >
                                {item.index_number}
                              </p>
                              {(!selectedSchoolId || viewMode === "search") && (
                                <p
                                  className="truncate text-[11px] text-muted-foreground/80"
                                  title={item.school_name}
                                >
                                  {item.school_name}
                                </p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-3 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page <= 1 || loading}
                          onClick={() => handlePageChange(page - 1)}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page >= totalPages || loading}
                          onClick={() => handlePageChange(page + 1)}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </section>
            ) : null}

            {selectedExam && (
              <p className="pb-2 text-center text-xs text-muted-foreground">
                {examLabel(selectedExam)}
                {selectedSchool ? ` · ${selectedSchool.name}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bulk upload */}
      <Dialog
        open={bulkUploadOpen}
        onOpenChange={(open) => {
          setBulkUploadOpen(open);
          if (!open) {
            setSelectedFiles([]);
            setUploadResult(null);
            setIsDragging(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk upload photos</DialogTitle>
            <DialogDescription>
              {selectedExam
                ? `Matched to candidates in ${examLabel(selectedExam)} by index number.`
                : "Select an examination first."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Naming</p>
              <p className="mt-1">
                Use <code className="rounded bg-muted px-1">index_number.jpg</code> (e.g.{" "}
                <code className="rounded bg-muted px-1">074221250034.jpg</code>). JPEG only,
                200–600px, max 2MB. Existing photos are replaced.
              </p>
            </div>

            <div
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/40"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
              }}
              onClick={() => bulkInputRef.current?.click()}
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop JPEGs here or click to browse</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedFiles.length > 0
                  ? `${selectedFiles.length} file(s) selected`
                  : "Multiple files supported"}
              </p>
              <input
                ref={bulkInputRef}
                type="file"
                multiple
                accept="image/jpeg,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {selectedFiles.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                {selectedFiles.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {uploadResult && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {uploadResult.successful} uploaded
                  </span>
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {uploadResult.failed} failed
                  </span>
                  {uploadResult.skipped > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertCircle className="h-4 w-4" />
                      {uploadResult.skipped} skipped
                    </span>
                  )}
                </div>
                {uploadResult.errors.length > 0 && (
                  <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                    {uploadResult.errors.map((err, idx) => (
                      <li key={idx} className="rounded bg-destructive/5 px-2 py-1 text-destructive">
                        <span className="font-medium">{err.filename}</span>
                        {err.index_number ? ` (${err.index_number})` : ""}: {err.error_message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBulkUploadOpen(false);
                setSelectedFiles([]);
                setUploadResult(null);
              }}
            >
              Close
            </Button>
            <Button
              onClick={handleBulkUpload}
              disabled={!canBulkUpload || selectedFiles.length === 0 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {selectedFiles.length || ""} photo
                  {selectedFiles.length === 1 ? "" : "s"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {uploadTarget && (
        <CandidatePhotoUpload
          candidateId={uploadTarget.candidate_id}
          candidateName={uploadTarget.candidate_name}
          open={uploadDialogOpen}
          onOpenChange={(open) => {
            setUploadDialogOpen(open);
            if (!open) setUploadTarget(null);
          }}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      <PhotoAlbumPdfPreview
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        examId={selectedExamId || 0}
        schoolId={selectedSchoolId || 0}
        programmeId={selectedProgrammeId}
        examName={selectedExam ? examLabel(selectedExam) : undefined}
        schoolName={selectedSchool?.name}
        programmeName={selectedProgramme?.name}
        candidateCount={total}
        searchQuery={viewMode === "search" ? activeSearchQuery : undefined}
      />

      <Dialog
        open={!!selectedPhoto}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPhoto(null);
            if (photoUrl) {
              URL.revokeObjectURL(photoUrl);
              setPhotoUrl(null);
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-6">{selectedPhoto?.candidate_name}</DialogTitle>
            <DialogDescription className="font-mono">
              {selectedPhoto?.index_number}
            </DialogDescription>
          </DialogHeader>
          {loadingPhoto ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : photoUrl && selectedPhoto ? (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={selectedPhoto.candidate_name}
                className="mx-auto max-h-[60vh] w-auto rounded-lg border object-contain"
              />
              <p className="text-sm text-muted-foreground">
                {selectedPhoto.school_name} ({selectedPhoto.school_code})
              </p>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    const item = selectedPhoto;
                    setSelectedPhoto(null);
                    if (photoUrl) {
                      URL.revokeObjectURL(photoUrl);
                      setPhotoUrl(null);
                    }
                    openUploadDialog(item);
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Replace photo
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
