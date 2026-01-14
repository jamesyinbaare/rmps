"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getAdminPhotoAlbum, listExams, listSchools, getAdminPhotoFile, exportCandidatePhotos } from "@/lib/api";
import type { PhotoAlbumItem, RegistrationExam, School } from "@/types";
import { toast } from "sonner";
import { Search, User, Image as ImageIcon, Loader2, Download, X, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        const url = await getAdminPhotoFile(candidateId);
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

export default function AdminPhotoAlbumPage() {
  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAlbumItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function loadExams() {
      try {
        const allExams = await listExams();
        setExams(allExams);
      } catch (err) {
        console.error("Failed to load exams:", err);
      }
    }
    loadExams();
  }, []);

  useEffect(() => {
    async function loadSchools() {
      try {
        const allSchools = await listSchools();
        setSchools(allSchools);
      } catch (err) {
        console.error("Failed to load schools:", err);
      }
    }
    loadSchools();
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
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminPhotoAlbum(1, 10000, selectedExamId || undefined, selectedSchoolId, undefined);
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
  }, [selectedExamId, selectedSchoolId]);

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
      const url = await getAdminPhotoFile(item.candidate_id);
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

  const handleExportPhotos = async () => {
    if (!selectedExamId) {
      toast.error("Please select an Exam");
      return;
    }

    setExporting(true);
    try {
      await exportCandidatePhotos(selectedExamId, selectedSchoolId);
      toast.success("Photos exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export photos");
    } finally {
      setExporting(false);
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
        const url = await getAdminPhotoFile(newItem.candidate_id);
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

  const canLoadPhotos = true; // Admin can load without exam selection

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Photo Album</h1>
        <p className="text-muted-foreground">View and manage candidate photos across all schools</p>
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
            {!filtersVisible && (selectedExamId || selectedSchoolId || searchQuery) && (
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
                {selectedSchoolId && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-xs">
                    School: {schools.find((s) => s.id === selectedSchoolId)?.name}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-purple-900"
                      onClick={() => {
                        setSelectedSchoolId(undefined);
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
                    setSelectedSchoolId(undefined);
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
                <label className="text-sm font-medium mb-2 block">
                  Exam <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  options={exams.map((exam) => ({
                    value: exam.id.toString(),
                    label: `${exam.exam_type}${exam.exam_series ? ` ${exam.exam_series}` : ""} ${exam.year}`,
                  }))}
                  value={selectedExamId ? selectedExamId.toString() : ""}
                  onValueChange={(value) => {
                    setSelectedExamId(value ? parseInt(value) : null);
                    setHasLoaded(false);
                    setItems([]);
                  }}
                  placeholder="Select Exam"
                  searchPlaceholder="Search exams..."
                  emptyMessage="No exams found"
                  className="w-full"
                />
              </div>
              <div className="w-full max-w-md">
                <label className="text-sm font-medium mb-2 block">School (Optional)</label>
                <SearchableSelect
                  options={schools.map((school) => ({
                    value: school.id.toString(),
                    label: `${school.name}${school.code ? ` (${school.code})` : ""}`,
                  }))}
                  value={selectedSchoolId ? selectedSchoolId.toString() : ""}
                  onValueChange={(value) => {
                    setSelectedSchoolId(value ? parseInt(value) : undefined);
                    setHasLoaded(false);
                    setItems([]);
                  }}
                  placeholder="All Schools"
                  searchPlaceholder="Search schools..."
                  emptyMessage="No schools found"
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
                  disabled={!selectedExamId || loading}
                  className="w-full"
                  title={!selectedExamId ? "Please select an exam to load photos" : undefined}
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
            onClick={handleExportPhotos}
            disabled={!selectedExamId || exporting || !hasLoaded}
            variant="outline"
            className="min-w-[140px]"
            title={!selectedExamId ? "Please select an exam to export photos" : undefined}
          >
            {exporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Photos
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {!hasLoaded && !loading && (
        <div className="text-center py-12 text-gray-500">
          Please select filters and click "Load Photos" to view the photo album.
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
                        {item.school_name && (
                          <p className="text-xs text-gray-400 truncate" title={item.school_name}>
                            {item.school_name}
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
