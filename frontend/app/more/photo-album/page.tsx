"use client";

import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { getPhotoAlbum, getAllExams, listSchools, getPhotoFile, listProgrammes, bulkUploadPhotos } from "@/lib/api";
import type { PhotoAlbumItem, PhotoAlbumFilters, Exam, School, Programme, PhotoBulkUploadResponse } from "@/types/document";
import { toast } from "sonner";
import { Search, User, Image as ImageIcon, Loader2, Upload, X, CheckCircle2, AlertCircle, FileText, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { PhotoAlbumPdfPreview } from "@/components/PhotoAlbumPdfPreview";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PhotoAlbumPage() {
  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [allItemsLoaded, setAllItemsLoaded] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
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
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);

  useEffect(() => {
    async function loadExams() {
      try {
        const allExams = await getAllExams();
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
        const allSchools = await listSchools(1, 100);
        setSchools(allSchools);
      } catch (err) {
        console.error("Failed to load schools:", err);
      }
    }
    loadSchools();
  }, []);

  useEffect(() => {
    async function loadProgrammes() {
      try {
        const response = await listProgrammes(1, 100);
        setProgrammes(response.items || []);
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
    if (!selectedExamId || !selectedSchoolId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Load all photos by using a large page_size
      const photoFilters: PhotoAlbumFilters = {
        page: 1,
        page_size: 10000, // Large number to get all results
        exam_id: selectedExamId,
        school_id: selectedSchoolId,
        programme_id: selectedProgrammeId,
      };
      const response = await getPhotoAlbum(photoFilters);
      if (append) {
        setItems((prev) => [...prev, ...response.items]);
      } else {
        setItems(response.items);
      }
      setTotal(response.total);
      setHasLoaded(true);
      setAllItemsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
      toast.error("Failed to load photo album");
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedSchoolId, selectedProgrammeId]);

  const handleLoadPhotos = () => {
    if (!selectedExamId || !selectedSchoolId) {
      toast.error("Please select both Exam and School");
      return;
    }
    loadPhotos();
  };


  const handleViewPhoto = async (item: PhotoAlbumItem) => {
    if (!item.photo) return;

    setLoadingPhoto(true);
    setSelectedPhoto(item);
    try {
      const url = await getPhotoFile(item.candidate_id, item.photo.id);
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
      item.index_number.toLowerCase().includes(query) ||
      item.school_name.toLowerCase().includes(query) ||
      item.school_code.toLowerCase().includes(query)
    );
  });

  const canLoadPhotos = selectedExamId !== null && selectedSchoolId !== null;

  const handleBulkUpload = async () => {
    if (!selectedExamId || !selectedSchoolId || selectedFiles.length === 0) {
      toast.error("Please select an exam, school, and at least one photo file");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    try {
      const result = await bulkUploadPhotos(selectedExamId, selectedFiles);
      setUploadResult(result);

      if (result.successful > 0) {
        toast.success(`Successfully uploaded ${result.successful} photo(s)`);
        // Reload photos if already loaded
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
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Candidate Photo Album" />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
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
                  {!filtersVisible && (selectedExamId || selectedSchoolId || selectedProgrammeId || searchQuery) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">Active filters:</span>
                      {selectedExamId && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                          Exam: {exams.find((e) => e.id === selectedExamId)?.exam_type} {exams.find((e) => e.id === selectedExamId)?.series} {exams.find((e) => e.id === selectedExamId)?.year}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-blue-900"
                            onClick={() => {
                              setSelectedExamId(null);
                              setSelectedSchoolId(null);
                              setHasLoaded(false);
                              setItems([]);
                            }}
                          />
                        </span>
                      )}
                      {selectedSchoolId && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs">
                          School: {schools.find((s) => s.id === selectedSchoolId)?.name}
                          <X
                            className="h-3 w-3 cursor-pointer hover:text-green-900"
                            onClick={() => {
                              setSelectedSchoolId(null);
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
                          setSelectedSchoolId(null);
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
                          // Clear dependent fields when exam changes
                          if (newExamId === null || newExamId !== selectedExamId) {
                            setSelectedSchoolId(null);
                          }
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
                              {exam.exam_type} {exam.series} {exam.year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedExamId && selectedExamId !== null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Clear Exam and its dependent field (School)
                            setSelectedExamId(null);
                            setSelectedSchoolId(null);
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
                    <label className="text-sm font-medium mb-2 block">School *</label>
                    <SearchableSelect
                      options={schools.map((school) => ({
                        value: school.id.toString(),
                        label: school.name,
                      }))}
                      value={selectedSchoolId ? selectedSchoolId.toString() : ""}
                      onValueChange={(value) => {
                        // Clear only School (no dependencies to clear)
                        setSelectedSchoolId(value ? parseInt(value) : null);
                        setHasLoaded(false);
                        setItems([]);
                      }}
                      placeholder="Select School"
                      searchPlaceholder="Search schools..."
                      emptyMessage="No schools found"
                      disabled={!selectedExamId}
                      className="w-full"
                    />
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
                        // Clear only Programme (no dependencies to clear)
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
                          placeholder="Search by name, index number, or school..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8 pr-8"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              // Clear only Search (no dependencies)
                              setSearchQuery("");
                            }}
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
                  disabled={!selectedExamId || !selectedSchoolId}
                  variant="outline"
                  className="min-w-[140px]"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Bulk Upload
                </Button>
                <Button
                  onClick={() => setPdfPreviewOpen(true)}
                  disabled={!selectedExamId || !selectedSchoolId || filteredItems.length === 0}
                  variant="outline"
                  className="min-w-[160px]"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Download Photo Album
                </Button>
              </div>
            </Card>

            {/* Results */}
            {!hasLoaded && !loading && (
              <div className="text-center py-12 text-gray-500">
                Please select Exam and School, then click "Load Photos" to view the photo album.
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
                              {item.photo ? (
                                <img
                                  src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/api/v1/candidates/${item.candidate_id}/photos/${item.photo.id}/file`}
                                  alt={item.candidate_name}
                                  className="w-full h-full object-cover transition-transform duration-200 hover:scale-110"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "";
                                    (e.target as HTMLImageElement).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50">
                                  <User className="h-10 w-10 text-gray-300 mb-2" />
                                  <span className="text-xs text-gray-400">No Photo</span>
                                </div>
                              )}
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
                              <p className="text-xs font-mono font-medium text-gray-600 truncate" title={item.index_number}>
                                {item.index_number}
                              </p>
                              <p className="text-xs text-gray-400 truncate" title={item.school_name}>
                                {item.school_name}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

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
              <p className="mb-2">Upload multiple photos at once. Photos will be matched to candidates by index number.</p>
              <p className="font-medium">File naming requirements:</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>File name must match candidate&apos;s index number (e.g., <code className="bg-muted px-1 rounded">074221250034.jpg</code>)</li>
                <li>Only JPEG images are allowed</li>
                <li>Dimensions: 200x200 to 600x600 pixels</li>
                <li>Max file size: 2MB</li>
                <li>Photos will be matched to candidates registered for the selected exam</li>
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
                disabled={!selectedExamId || !selectedSchoolId || selectedFiles.length === 0 || uploading}
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

      {/* PDF Preview Dialog */}
      <PhotoAlbumPdfPreview
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        examId={selectedExamId || 0}
        schoolId={selectedSchoolId || 0}
        programmeId={selectedProgrammeId}
        examName={selectedExamId ? exams.find((e) => e.id === selectedExamId)?.exam_type + " " + exams.find((e) => e.id === selectedExamId)?.series + " " + exams.find((e) => e.id === selectedExamId)?.year : undefined}
        schoolName={selectedSchoolId ? schools.find((s) => s.id === selectedSchoolId)?.name : undefined}
        programmeName={selectedProgrammeId ? programmes.find((p) => p.id === selectedProgrammeId)?.name : undefined}
        candidateCount={filteredItems.length}
        searchQuery={searchQuery}
      />

      {/* Photo Viewer Dialog */}
      <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedPhoto?.candidate_name} - {selectedPhoto?.index_number}
            </DialogTitle>
          </DialogHeader>
          {loadingPhoto ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : photoUrl && selectedPhoto ? (
            <div className="space-y-4">
              <img src={photoUrl} alt={selectedPhoto.candidate_name} className="w-full h-auto rounded-lg" />
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  <strong>School:</strong> {selectedPhoto.school_name} ({selectedPhoto.school_code})
                </p>
                <p>
                  <strong>Index Number:</strong> {selectedPhoto.index_number}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
