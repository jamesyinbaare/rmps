"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getPhotoAlbum, listAllSchoolExams, listSchoolProgrammes, getPhotoFile, bulkUploadPhotos } from "@/lib/api";
import type { PhotoAlbumItem, RegistrationExam, Programme, PhotoBulkUploadResponse } from "@/types";
import { toast } from "sonner";
import { Search, User, Image as ImageIcon, Loader2, Upload, X, CheckCircle2, AlertCircle, FileText, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";

// Component to handle photo loading with authentication
function PhotoImage({ candidateId, candidateName, hasPhoto }: { candidateId: number; candidateName: string; hasPhoto: boolean }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasPhoto) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function loadPhoto() {
      try {
        const url = await getPhotoFile(candidateId);
        if (isMounted) {
          // Revoke old URL if it exists
          if (urlRef.current) {
            URL.revokeObjectURL(urlRef.current);
          }
          urlRef.current = url;
          setPhotoUrl(url);
          setError(false);
        } else if (url) {
          // Component unmounted, revoke the URL we just created
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPhoto();

    return () => {
      isMounted = false;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [candidateId, hasPhoto]);

  if (!hasPhoto) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
        <User className="h-10 w-10 text-gray-300 mb-2" />
        <span className="text-xs text-gray-400">No Photo</span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !photoUrl) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
        <User className="h-10 w-10 text-gray-300 mb-2" />
        <span className="text-xs text-gray-400">Failed to load</span>
      </div>
    );
  }

  return (
    <img
      src={photoUrl}
      alt={candidateName}
      className="w-full h-full object-cover transition-transform duration-200 hover:scale-110"
    />
  );
}

export default function PhotoAlbumPage() {
  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAlbumItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<PhotoBulkUploadResponse | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);

  useEffect(() => {
    async function loadExams() {
      try {
        const allExams = await listAllSchoolExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    }
    loadExams();
  }, []);

  useEffect(() => {
    async function loadProgrammes() {
      try {
        const programmes = await listSchoolProgrammes();
        setProgrammes(programmes);
      } catch (err) {
        console.error("Failed to load programmes:", err);
      }
    }
    loadProgrammes();
  }, []);

  // Keyboard shortcut to toggle filters (Ctrl+F or Cmd+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFiltersVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadPhotos = useCallback(async (append = false) => {
    if (!selectedExamId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getPhotoAlbum(1, 10000, selectedExamId, selectedProgrammeId);
      if (append) {
        setItems((prev) => [...prev, ...response.items]);
      } else {
        setItems(response.items);
      }
      setTotal(response.total);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
      toast.error("Failed to load photo album");
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedProgrammeId]);

  const handleLoadPhotos = () => {
    if (!selectedExamId) {
      toast.error("Please select an Exam");
      return;
    }
    loadPhotos();
  };

  const handleViewPhoto = async (item: PhotoAlbumItem) => {
    if (!item.photo) return;

    setLoadingPhoto(true);
    setSelectedPhoto(item);
    try {
      const url = await getPhotoFile(item.candidate_id);
      if (url) {
        setPhotoUrl(url);
      } else {
        toast.error("Photo file not found");
        setSelectedPhoto(null);
      }
    } catch (err) {
      toast.error("Failed to load photo");
      setSelectedPhoto(null);
    } finally {
      setLoadingPhoto(false);
    }
  };

  // Filter items by search query
  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.candidate_name.toLowerCase().includes(query) ||
      (item.index_number && item.index_number.toLowerCase().includes(query)) ||
      (item.registration_number && item.registration_number.toLowerCase().includes(query))
    );
  });

  // Get items with photos for navigation
  const itemsWithPhotos = filteredItems.filter((item) => item.photo);

  // Navigation functions
  const navigateToPhoto = useCallback(async (direction: "prev" | "next") => {
    if (!selectedPhoto) return;

    const currentIndex = itemsWithPhotos.findIndex(
      (item) => item.candidate_id === selectedPhoto.candidate_id
    );

    if (currentIndex === -1) return;

    let newIndex: number;
    if (direction === "prev") {
      newIndex = currentIndex > 0 ? currentIndex - 1 : itemsWithPhotos.length - 1;
    } else {
      newIndex = currentIndex < itemsWithPhotos.length - 1 ? currentIndex + 1 : 0;
    }

    const newItem = itemsWithPhotos[newIndex];
    if (newItem) {
      // Clean up old photo URL
      setPhotoUrl((prevUrl) => {
        if (prevUrl) {
          URL.revokeObjectURL(prevUrl);
        }
        return null;
      });

      setLoadingPhoto(true);
      setSelectedPhoto(newItem);
      try {
        const url = await getPhotoFile(newItem.candidate_id);
        if (url) {
          setPhotoUrl(url);
        } else {
          toast.error("Photo file not found");
        }
      } catch (err) {
        toast.error("Failed to load photo");
      } finally {
        setLoadingPhoto(false);
      }
    }
  }, [selectedPhoto, itemsWithPhotos]);

  // Keyboard navigation for photo viewer
  useEffect(() => {
    if (!selectedPhoto) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigateToPhoto("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigateToPhoto("next");
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedPhoto(null);
        setPhotoUrl((prevUrl) => {
          if (prevUrl) {
            URL.revokeObjectURL(prevUrl);
          }
          return null;
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhoto, navigateToPhoto]);

  // Check if registration period has ended for the selected exam
  const isRegistrationEnded = useMemo(() => {
    if (!selectedExamId) return false;
    const exam = exams.find((e) => e.id === selectedExamId);
    if (!exam?.registration_period) return false;
    const now = new Date();
    const endDate = new Date(exam.registration_period.registration_end_date);
    return !exam.registration_period.is_active || now > endDate;
  }, [selectedExamId, exams]);

  const canLoadPhotos = selectedExamId !== null;

  const handleBulkUpload = async () => {
    if (!selectedExamId || selectedFiles.length === 0) {
      toast.error("Please select an exam and at least one photo file");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    try {
      const result = await bulkUploadPhotos(selectedExamId, selectedFiles);
      setUploadResult(result);

      if (result.successful > 0) {
        toast.success(`Successfully uploaded ${result.successful} photo(s)`);
        if (hasLoaded) {
          loadPhotos();
        }
      }

      if (result.failed > 0 || result.skipped > 0) {
        toast.warning(`${result.failed} failed, ${result.skipped} skipped`);
      }
    } catch (err) {
      toast.error("Failed to upload photos");
      console.error("Bulk upload error:", err);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Photo Album</h1>
        <p className="text-muted-foreground">View and manage candidate photos</p>
      </div>

      {/* Filters Toggle & Summary */}
      <Card className="p-4 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltersVisible(!filtersVisible)}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              {filtersVisible ? (
                <>
                  <span>Hide Filters</span>
                  <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  <span>Show Filters</span>
                  <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
            {!filtersVisible && (selectedExamId || selectedProgrammeId || searchQuery) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Active filters:</span>
                {selectedExamId && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    Exam: {exams.find((e) => e.id === selectedExamId)?.exam_type} {exams.find((e) => e.id === selectedExamId)?.exam_series} {exams.find((e) => e.id === selectedExamId)?.year}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-blue-900"
                      onClick={() => {
                        setSelectedExamId(null);
                        setHasLoaded(false);
                        setItems([]);
                      }}
                    />
                  </span>
                )}
                {selectedProgrammeId && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-xs">
                    Programme: {programmes.find((p) => p.id === selectedProgrammeId)?.name}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-purple-900"
                      onClick={() => {
                        setSelectedProgrammeId(undefined);
                        setHasLoaded(false);
                        setItems([]);
                      }}
                    />
                  </span>
                )}
                {searchQuery && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-800 rounded-md text-xs">
                    Search: "{searchQuery}"
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-orange-900"
                      onClick={() => setSearchQuery("")}
                    />
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedExamId(null);
                    setSelectedProgrammeId(undefined);
                    setSearchQuery("");
                    setHasLoaded(false);
                    setItems([]);
                  }}
                  className="text-xs h-6"
                >
                  Clear All
                </Button>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs">Ctrl+F</kbd> to toggle
          </div>
        </div>
      </Card>

      {/* Filters */}
      {filtersVisible && (
        <Card className="p-6 shadow-sm">
          <div className="space-y-4">
            <div className="space-y-4 flex flex-col items-center">
              <div className="w-full max-w-md">
                <label className="text-sm font-medium mb-2 block">Exam *</label>
                <div className="relative">
                  <Select
                    value={selectedExamId?.toString() || "none"}
                    onValueChange={(value) => {
                      const newExamId = value === "none" ? null : parseInt(value);
                      setSelectedExamId(newExamId);
                      setHasLoaded(false);
                      setItems([]);
                    }}
                  >
                    <SelectTrigger className="w-full pr-8">
                      <SelectValue placeholder="Select Exam" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select Exam</SelectItem>
                      {exams.map((exam) => (
                        <SelectItem key={exam.id} value={exam.id.toString()}>
                          {exam.exam_type}{exam.exam_series ? ` ${exam.exam_series}` : ""} {exam.year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedExamId && selectedExamId !== null && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedExamId(null);
                        setHasLoaded(false);
                        setItems([]);
                      }}
                      className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity z-10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full max-w-md">
                <label className="text-sm font-medium mb-2 block">Programme (Optional)</label>
                <SearchableSelect
                  options={programmes.map((programme) => ({
                    value: programme.id.toString(),
                    label: programme.name,
                  }))}
                  value={selectedProgrammeId ? selectedProgrammeId.toString() : ""}
                  onValueChange={(value) => {
                    setSelectedProgrammeId(value ? parseInt(value) : undefined);
                    setHasLoaded(false);
                    setItems([]);
                  }}
                  placeholder="All Programmes"
                  searchPlaceholder="Search programmes..."
                  emptyMessage="No programmes found"
                  className="w-full"
                />
              </div>
              {hasLoaded && (
                <div className="w-full max-w-md">
                  <label className="text-sm font-medium mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name, index number, or registration number..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-8"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="w-full max-w-md pt-2">
                <Button
                  onClick={handleLoadPhotos}
                  disabled={!canLoadPhotos || loading}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load Photos"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      <Card className="p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            onClick={() => setBulkUploadOpen(true)}
            disabled={!selectedExamId || isRegistrationEnded}
            variant="outline"
            className="min-w-[140px]"
            title={isRegistrationEnded ? "Upload is disabled because registration period has ended" : undefined}
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Upload
          </Button>
        </div>
      </Card>

      {/* Results */}
      {!hasLoaded && !loading && (
        <div className="text-center py-12 text-gray-500">
          Please select an Exam, then click "Load Photos" to view the photo album.
        </div>
      )}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-600">{error}</div>
      ) : hasLoaded ? (
        <>
          <div className="text-sm text-gray-600 mb-4">
            Showing {filteredItems.length} of {total} candidates
          </div>

          {filteredItems.length === 0 ? (
            <Card className="p-12 max-w-[1600px] mx-auto">
              <div className="text-center space-y-4">
                <ImageIcon className="h-16 w-16 mx-auto text-gray-300" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">No candidates found</h3>
                  <p className="text-gray-500">No candidates match your current filters.</p>
                </div>
              </div>
            </Card>
          ) : (
            <>
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Total Candidates</p>
                      <p className="text-2xl font-bold text-blue-900">{total}</p>
                    </div>
                    <User className="h-8 w-8 text-blue-400" />
                  </div>
                </Card>
                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 font-medium">With Photos</p>
                      <p className="text-2xl font-bold text-green-900">{filteredItems.filter((i) => i.photo).length}</p>
                    </div>
                    <ImageIcon className="h-8 w-8 text-green-400" />
                  </div>
                </Card>
                <Card className="p-4 bg-orange-50 border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-600 font-medium">Without Photos</p>
                      <p className="text-2xl font-bold text-orange-900">{filteredItems.filter((i) => !i.photo).length}</p>
                    </div>
                    <User className="h-8 w-8 text-orange-400" />
                  </div>
                </Card>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredItems.map((item) => (
                  <Card
                    key={item.candidate_id}
                    className={`cursor-pointer transition-all duration-200 ${
                      item.photo
                        ? "hover:shadow-xl hover:scale-105 border-2 hover:border-blue-300"
                        : "hover:shadow-md opacity-75"
                    }`}
                    onClick={() => item.photo && handleViewPhoto(item)}
                  >
                    <CardContent className="p-3">
                      <div className="aspect-square relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden mb-3 border border-gray-200 shadow-inner">
                        <PhotoImage
                          candidateId={item.candidate_id}
                          candidateName={item.candidate_name}
                          hasPhoto={!!item.photo}
                        />
                        {item.photo && (
                          <div className="absolute top-2 right-2 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-semibold">
                            Photo
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <p className="font-semibold text-sm truncate text-gray-900" title={item.candidate_name}>
                          {item.candidate_name}
                        </p>
                        {item.index_number && (
                          <p className="text-xs font-mono font-medium text-gray-600 truncate" title={item.index_number}>
                            {item.index_number}
                          </p>
                        )}
                        {item.registration_number && (
                          <p className="text-xs font-mono font-medium text-gray-500 truncate" title={item.registration_number}>
                            {item.registration_number}
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkUploadOpen} onOpenChange={(open) => {
        setBulkUploadOpen(open);
        if (!open) {
          setSelectedFiles([]);
          setUploadResult(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Upload Photos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p className="mb-2">Upload multiple photos at once. Photos will be matched to candidates by registration number (preferred) or index number.</p>
              <p className="font-medium">File naming requirements:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>File name must match candidate&apos;s <strong>registration number</strong> (preferred) or index number</li>
                <li>Examples: <code className="bg-muted px-1 rounded">REG123456.jpg</code> (registration number) or <code className="bg-muted px-1 rounded">074221250034.jpg</code> (index number)</li>
                <li>Registration number matching is prioritized over index number</li>
                <li>Only JPEG images are allowed</li>
                <li>Dimensions: 200x200 to 600x600 pixels</li>
                <li>Max file size: 2MB</li>
                <li>Photos will be matched to candidates registered for the selected exam</li>
                <li>Photos will be renamed using the candidate&apos;s registration number when saved</li>
              </ul>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Select Photos</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  id="bulk-upload-input"
                  multiple
                  accept="image/jpeg"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label
                  htmlFor="bulk-upload-input"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Click to select photos or drag and drop
                  </span>
                  <span className="text-xs text-gray-400">
                    {selectedFiles.length > 0 ? `${selectedFiles.length} file(s) selected` : "No files selected"}
                  </span>
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {selectedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 bg-muted rounded-lg"
                    >
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <span className="text-xs text-muted-foreground mx-2">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {uploadResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Success: {uploadResult.successful}</span>
                  </div>
                  <div className="flex items-center gap-1 text-red-600">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed: {uploadResult.failed}</span>
                  </div>
                  {uploadResult.skipped > 0 && (
                    <div className="flex items-center gap-1 text-yellow-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>Skipped: {uploadResult.skipped}</span>
                    </div>
                  )}
                </div>

                {uploadResult.errors.length > 0 && (
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2">
                    <div className="text-xs font-medium mb-2">Errors:</div>
                    <div className="space-y-1">
                      {uploadResult.errors.map((error, idx) => (
                        <div key={idx} className="text-xs text-red-600 p-1 bg-red-50 rounded">
                          <div className="font-medium">{error.filename}</div>
                          {error.index_number && (
                            <div className="text-muted-foreground">Index: {error.index_number}</div>
                          )}
                          {error.registration_number && (
                            <div className="text-muted-foreground">Reg: {error.registration_number}</div>
                          )}
                          <div>{error.error_message}</div>
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
                onClick={() => {
                  setBulkUploadOpen(false);
                  setSelectedFiles([]);
                  setUploadResult(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkUpload}
                disabled={!selectedExamId || selectedFiles.length === 0 || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {selectedFiles.length} Photo(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => {
        setSelectedPhoto(null);
        if (photoUrl) {
          URL.revokeObjectURL(photoUrl);
          setPhotoUrl(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedPhoto?.candidate_name} - {selectedPhoto?.index_number || selectedPhoto?.registration_number}
              {itemsWithPhotos.length > 1 && selectedPhoto && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({itemsWithPhotos.findIndex((item) => item.candidate_id === selectedPhoto.candidate_id) + 1} of {itemsWithPhotos.length})
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {loadingPhoto ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : photoUrl && selectedPhoto ? (
            <div className="space-y-4">
              <div className="relative">
                <img src={photoUrl} alt={selectedPhoto.candidate_name} className="w-full h-auto rounded-lg" />
                {itemsWithPhotos.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                      onClick={() => navigateToPhoto("prev")}
                      disabled={loadingPhoto}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                      onClick={() => navigateToPhoto("next")}
                      disabled={loadingPhoto}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                {selectedPhoto.school_name && (
                  <p>
                    <strong>School:</strong> {selectedPhoto.school_name} {selectedPhoto.school_code && `(${selectedPhoto.school_code})`}
                  </p>
                )}
                {selectedPhoto.index_number && (
                  <p>
                    <strong>Index Number:</strong> {selectedPhoto.index_number}
                  </p>
                )}
                {selectedPhoto.registration_number && (
                  <p>
                    <strong>Registration Number:</strong> {selectedPhoto.registration_number}
                  </p>
                )}
              </div>
              {itemsWithPhotos.length > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPhoto("prev")}
                    disabled={loadingPhoto}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-4">
                    {itemsWithPhotos.findIndex((item) => item.candidate_id === selectedPhoto.candidate_id) + 1} / {itemsWithPhotos.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigateToPhoto("next")}
                    disabled={loadingPhoto}
                    className="gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
