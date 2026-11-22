"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Upload,
  User,
  X,
} from "lucide-react";
import { getPhotoFile, uploadCandidatePhoto } from "@/lib/api";
import type { PhotoAlbumItem } from "@/types";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function PhotoImage({
  candidateId,
  candidateName,
  hasPhoto,
  cacheKey,
}: {
  candidateId: number;
  candidateName: string;
  hasPhoto: boolean;
  cacheKey?: string | number;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasPhoto) {
      setLoading(false);
      setPhotoUrl(null);
      setError(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(false);

    async function loadPhoto() {
      try {
        const url = await getPhotoFile(candidateId);
        if (isMounted) {
          if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
          }
          urlRef.current = url;
          setPhotoUrl(url);
          setError(false);
        } else if (url) {
          URL.revokeObjectURL(url);
        }
      } catch {
        if (isMounted) setError(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadPhoto();

    return () => {
      isMounted = false;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [candidateId, hasPhoto, cacheKey]);

  if (!hasPhoto) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30">
        <User className="mb-2 h-10 w-10 text-muted-foreground/40" />
        <span className="text-xs text-muted-foreground">No photo</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !photoUrl) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30">
        <User className="mb-2 h-10 w-10 text-muted-foreground/40" />
        <span className="text-xs text-muted-foreground">Failed to load</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt={candidateName}
      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
    />
  );
}

function CandidateMetaChips({ item }: { item: PhotoAlbumItem }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {item.registration_number ? (
        <span className="inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-1 font-mono text-xs text-foreground shadow-none">
          {item.registration_number}
        </span>
      ) : null}
      {item.index_number ? (
        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1 font-mono text-xs text-muted-foreground shadow-none">
          {item.index_number}
        </span>
      ) : null}
    </div>
  );
}

function acceptImageFile(file: File | undefined | null): File | null {
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    toast.error("Please select a JPEG image");
    return null;
  }
  return file;
}

function HiddenFileInput({
  inputId,
  inputKey,
  inputRef,
  uploading,
  onFileSelect,
}: {
  inputId: string;
  inputKey: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onFileSelect: (file: File | null) => void;
}) {
  return (
    <input
      key={inputKey}
      ref={inputRef}
      id={inputId}
      type="file"
      accept="image/jpeg,image/jpg"
      className="sr-only"
      disabled={uploading}
      onChange={(e) => {
        onFileSelect(acceptImageFile(e.target.files?.[0] ?? null));
        e.target.value = "";
      }}
    />
  );
}

function PhotoUploadActions({
  selectedFile,
  uploading,
  isReplace,
  onClearFile,
  onChangeFile,
  onUpload,
  onCancelReplace,
}: {
  selectedFile: File | null;
  uploading: boolean;
  isReplace: boolean;
  onClearFile: () => void;
  onChangeFile: () => void;
  onUpload: () => void;
  onCancelReplace?: () => void;
}) {
  if (!selectedFile) {
    if (!isReplace) return null;
    return (
      <div className="space-y-3">
        <button
          type="button"
          disabled={uploading}
          onClick={onChangeFile}
          className={cn(
            "group flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-6 py-6 text-center transition-colors",
            "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/35",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              Choose a new passport photo
            </p>
            <p className="text-xs text-muted-foreground">
              JPEG · 155×191 · max 2MB
            </p>
          </div>
        </button>
        {onCancelReplace ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shadow-none"
              onClick={onCancelReplace}
              disabled={uploading}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {selectedFile.name}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {(selectedFile.size / 1024).toFixed(1)} KB · ready to upload
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 shadow-none"
          onClick={onChangeFile}
          disabled={uploading}
        >
          Change
        </Button>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shadow-none"
          onClick={isReplace && onCancelReplace ? onCancelReplace : onClearFile}
          disabled={uploading}
        >
          {isReplace ? "Cancel" : "Clear"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-w-[140px] shadow-none"
          onClick={onUpload}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              {isReplace ? "Replace photo" : "Upload photo"}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface PhotoAlbumCandidateGridProps {
  items: PhotoAlbumItem[];
  loading?: boolean;
  emptyMessage?: string;
  onPhotoChanged?: () => void;
}

export function PhotoAlbumCandidateGrid({
  items,
  loading = false,
  emptyMessage = "No candidates match your current filters.",
  onPhotoChanged,
}: PhotoAlbumCandidateGridProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAlbumItem | null>(
    null
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [frameDragging, setFrameDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showPendingPreview = Boolean(filePreviewUrl && selectedFile);
  const canPickOnFrame =
    Boolean(selectedPhoto) &&
    ((!selectedPhoto?.photo && !showPendingPreview) ||
      (replacing && !showPendingPreview));
  const currentCandidateIndex = selectedPhoto
    ? items.findIndex(
        (item) => item.candidate_id === selectedPhoto.candidate_id
      )
    : -1;

  const clearUploadState = useCallback(() => {
    setSelectedFile(null);
    setReplacing(false);
    setFrameDragging(false);
    setFileInputKey((k) => k + 1);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const setChosenFile = useCallback((file: File | null) => {
    setSelectedFile(file);
    setFilePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  const openPhoto = useCallback(
    async (item: PhotoAlbumItem) => {
      clearUploadState();
      setLoadingPhoto(true);
      setSelectedPhoto(item);
      try {
        if (!item.photo) {
          setPhotoUrl(null);
          return;
        }
        const url = await getPhotoFile(item.candidate_id);
        if (url) {
          setPhotoUrl(url);
        } else {
          toast.error("Photo file not found");
          setSelectedPhoto(null);
        }
      } catch {
        toast.error("Failed to load photo");
        setSelectedPhoto(null);
      } finally {
        setLoadingPhoto(false);
      }
    },
    [clearUploadState]
  );

  const closeViewer = useCallback(() => {
    setSelectedPhoto(null);
    clearUploadState();
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [clearUploadState]);

  const reloadViewerPhoto = useCallback(async (item: PhotoAlbumItem) => {
    setLoadingPhoto(true);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      const url = await getPhotoFile(item.candidate_id);
      if (url) setPhotoUrl(url);
      else toast.error("Photo file not found");
    } catch {
      toast.error("Failed to load photo");
    } finally {
      setLoadingPhoto(false);
    }
  }, []);

  const navigateToPhoto = useCallback(
    async (direction: "prev" | "next") => {
      if (!selectedPhoto || items.length === 0) return;

      const currentIndex = items.findIndex(
        (item) => item.candidate_id === selectedPhoto.candidate_id
      );
      if (currentIndex === -1) return;

      const newIndex =
        direction === "prev"
          ? currentIndex > 0
            ? currentIndex - 1
            : items.length - 1
          : currentIndex < items.length - 1
            ? currentIndex + 1
            : 0;

      const newItem = items[newIndex];
      if (!newItem) return;

      clearUploadState();
      setPhotoUrl((prevUrl) => {
        if (prevUrl) URL.revokeObjectURL(prevUrl);
        return null;
      });
      setLoadingPhoto(true);
      setSelectedPhoto(newItem);
      try {
        if (!newItem.photo) {
          return;
        }
        const url = await getPhotoFile(newItem.candidate_id);
        if (url) setPhotoUrl(url);
        else toast.error("Photo file not found");
      } catch {
        toast.error("Failed to load photo");
      } finally {
        setLoadingPhoto(false);
      }
    },
    [selectedPhoto, items, clearUploadState]
  );

  useEffect(() => {
    if (!selectedPhoto || uploadingPhoto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void navigateToPhoto("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void navigateToPhoto("next");
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeViewer();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto, navigateToPhoto, closeViewer, uploadingPhoto]);

  useEffect(() => {
    if (!selectedPhoto) return;
    const updated = items.find(
      (item) => item.candidate_id === selectedPhoto.candidate_id
    );
    if (!updated) return;
    if (
      updated.photo?.id !== selectedPhoto.photo?.id ||
      updated.photo?.uploaded_at !== selectedPhoto.photo?.uploaded_at
    ) {
      setSelectedPhoto(updated);
    }
  }, [items, selectedPhoto]);

  const handleUploadPhoto = async () => {
    if (!selectedPhoto || !selectedFile) return;

    setUploadingPhoto(true);
    try {
      const uploaded = await uploadCandidatePhoto(
        selectedPhoto.candidate_id,
        selectedFile,
        false
      );
      toast.success(
        selectedPhoto.photo
          ? "Photo replaced successfully"
          : "Photo uploaded successfully"
      );
      clearUploadState();

      const updatedItem: PhotoAlbumItem = {
        ...selectedPhoto,
        photo: uploaded,
      };
      setSelectedPhoto(updatedItem);
      await reloadViewerPhoto(updatedItem);
      onPhotoChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to upload photo"
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-lg border border-border bg-card p-3 shadow-none"
          >
            <Skeleton className="mb-3 aspect-square w-full rounded-md" />
            <Skeleton className="mb-2 h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card py-16 text-center shadow-none">
        <ImageIcon className="mb-3 h-12 w-12 text-muted-foreground/50" />
        <h3 className="text-sm font-medium text-foreground">
          No candidates found
        </h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {items.map((item) => (
          <button
            key={item.candidate_id}
            type="button"
            onClick={() => void openPhoto(item)}
            className={cn(
              "group rounded-lg border border-border bg-card p-3 text-left shadow-none transition-colors",
              "hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !item.photo && "opacity-90"
            )}
          >
            <div className="relative mb-3 aspect-square overflow-hidden rounded-md border border-border bg-muted/30">
              <PhotoImage
                candidateId={item.candidate_id}
                candidateName={item.candidate_name}
                hasPhoto={!!item.photo}
                cacheKey={item.photo?.id ?? item.photo?.uploaded_at ?? "none"}
              />
              {item.photo ? (
                <Badge
                  variant="outline"
                  className="absolute right-2 top-2 border-success/30 bg-success/10 text-[10px] text-success shadow-none"
                >
                  Photo
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="absolute right-2 top-2 text-[10px] text-muted-foreground shadow-none"
                >
                  Missing
                </Badge>
              )}
            </div>
            <div className="space-y-1">
              <p
                className="truncate text-sm font-medium text-foreground"
                title={item.candidate_name}
              >
                {item.candidate_name}
              </p>
              {item.index_number ? (
                <p
                  className="truncate font-mono text-xs text-muted-foreground"
                  title={item.index_number}
                >
                  {item.index_number}
                </p>
              ) : null}
              {item.registration_number ? (
                <p
                  className="truncate font-mono text-xs text-muted-foreground"
                  title={item.registration_number}
                >
                  {item.registration_number}
                </p>
              ) : null}
            </div>
          </button>
        ))}
      </div>

      <Dialog
        open={!!selectedPhoto}
        onOpenChange={(open) => {
          if (!open) closeViewer();
        }}
      >
        <DialogContent
          className={cn(
            "gap-0 overflow-hidden border-border/80 p-0 shadow-none sm:max-w-[420px]",
            "bg-card"
          )}
        >
          {selectedPhoto ? (
            <>
              <div className="relative overflow-hidden border-b border-border/70 bg-gradient-to-b from-muted/50 via-muted/20 to-background px-5 pb-5 pt-8">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.35]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)",
                    backgroundSize: "18px 18px",
                  }}
                />

                <div className="relative mx-auto flex w-full max-w-[220px] flex-col items-center">
                  <div className="relative w-full">
                    <div
                      role={canPickOnFrame ? "button" : undefined}
                      tabIndex={canPickOnFrame ? 0 : undefined}
                      onClick={() => {
                        if (!canPickOnFrame || uploadingPhoto) return;
                        fileInputRef.current?.click();
                      }}
                      onKeyDown={(e) => {
                        if (!canPickOnFrame || uploadingPhoto) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileInputRef.current?.click();
                        }
                      }}
                      onDragEnter={(e) => {
                        if (!canPickOnFrame) return;
                        e.preventDefault();
                        setFrameDragging(true);
                      }}
                      onDragOver={(e) => {
                        if (!canPickOnFrame) return;
                        e.preventDefault();
                        setFrameDragging(true);
                      }}
                      onDragLeave={(e) => {
                        if (!canPickOnFrame) return;
                        e.preventDefault();
                        setFrameDragging(false);
                      }}
                      onDrop={(e) => {
                        if (!canPickOnFrame) return;
                        e.preventDefault();
                        setFrameDragging(false);
                        const file = acceptImageFile(
                          e.dataTransfer.files?.[0] ?? null
                        );
                        if (file) setChosenFile(file);
                      }}
                      className={cn(
                        "relative aspect-[155/191] w-full overflow-hidden rounded-2xl border bg-background shadow-[0_18px_40px_-24px_rgba(0,0,0,0.45)]",
                        "ring-1 ring-black/5 dark:ring-white/10",
                        canPickOnFrame &&
                          "cursor-pointer border-2 border-dashed border-primary/60 bg-primary/5 transition-all duration-200 hover:border-primary hover:bg-primary/10 hover:ring-4 hover:ring-primary/20",
                        !canPickOnFrame && "border-border",
                        frameDragging &&
                          "scale-[1.015] border-primary bg-primary/15 ring-4 ring-primary/25"
                      )}
                    >
                      {loadingPhoto ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted/30">
                          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                        </div>
                      ) : showPendingPreview && filePreviewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={filePreviewUrl}
                          alt="Selected passport preview"
                          className="h-full w-full object-cover"
                        />
                      ) : selectedPhoto.photo && photoUrl && !replacing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl}
                          alt={selectedPhoto.candidate_name}
                          className="h-full w-full object-cover"
                        />
                      ) : selectedPhoto.photo && photoUrl && replacing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl}
                          alt={selectedPhoto.candidate_name}
                          className="h-full w-full object-cover opacity-35"
                        />
                      ) : (
                        <div className="relative flex h-full w-full flex-col items-center justify-center gap-3.5 bg-primary/5 px-4 text-center">
                          <div
                            aria-hidden
                            className={cn(
                              "pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-primary/40",
                              frameDragging && "border-primary"
                            )}
                          />
                          <div
                            className={cn(
                              "relative flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200",
                              frameDragging
                                ? "scale-105 border-primary bg-primary/20 text-primary"
                                : "border-primary/60 bg-primary/15 text-primary bulk-progress-breathe"
                            )}
                          >
                            <Upload className="h-7 w-7" strokeWidth={2.25} />
                          </div>
                          <div className="relative space-y-1.5">
                            <p className="text-sm font-semibold tracking-tight text-foreground">
                              {frameDragging
                                ? "Drop to preview"
                                : "Drop photo here"}
                            </p>
                            <p className="text-[11px] font-semibold text-primary">
                              or click to browse
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              JPEG · 155×191 · max 2MB
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {items.length > 1 &&
                    !replacing &&
                    !showPendingPreview ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute -left-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full border-border bg-background/95 shadow-none backdrop-blur"
                          onClick={() => void navigateToPhoto("prev")}
                          disabled={loadingPhoto || uploadingPhoto}
                          aria-label="Previous candidate"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute -right-3 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full border-border bg-background/95 shadow-none backdrop-blur"
                          onClick={() => void navigateToPhoto("next")}
                          disabled={loadingPhoto || uploadingPhoto}
                          aria-label="Next candidate"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="space-y-3 text-center">
                  <DialogTitle className="text-lg font-medium tracking-[-0.02em] text-foreground">
                    {selectedPhoto.candidate_name}
                  </DialogTitle>
                  <CandidateMetaChips item={selectedPhoto} />
                  {showPendingPreview ? (
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
                      Preview
                    </p>
                  ) : items.length > 1 && currentCandidateIndex >= 0 ? (
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Candidate {currentCandidateIndex + 1} of {items.length}
                    </p>
                  ) : !selectedPhoto.photo ? (
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Missing photo
                    </p>
                  ) : null}
                </div>

                <HiddenFileInput
                  inputId="album-photo-upload"
                  inputKey={fileInputKey}
                  inputRef={fileInputRef}
                  uploading={uploadingPhoto}
                  onFileSelect={(file) => {
                    if (file) setChosenFile(file);
                  }}
                />

                {!selectedPhoto.photo || replacing ? (
                  <PhotoUploadActions
                    selectedFile={selectedFile}
                    uploading={uploadingPhoto}
                    isReplace={Boolean(selectedPhoto.photo)}
                    onClearFile={() => {
                      setChosenFile(null);
                      setFileInputKey((k) => k + 1);
                    }}
                    onChangeFile={() => fileInputRef.current?.click()}
                    onUpload={() => void handleUploadPhoto()}
                    onCancelReplace={
                      selectedPhoto.photo ? clearUploadState : undefined
                    }
                  />
                ) : (
                  <div className="flex items-center justify-center gap-2 border-t border-border/70 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 shadow-none"
                      onClick={() => {
                        setChosenFile(null);
                        setFileInputKey((k) => k + 1);
                        setReplacing(true);
                      }}
                      disabled={uploadingPhoto}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Replace photo
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
