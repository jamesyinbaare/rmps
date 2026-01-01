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
import { getPhotoAlbum, getAllExams, listSchools, getPhotoFile } from "@/lib/api";
import type { PhotoAlbumItem, PhotoAlbumFilters, Exam, School } from "@/types/document";
import { toast } from "sonner";
import { Search, User, Image as ImageIcon, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function PhotoAlbumPage() {
  const [items, setItems] = useState<PhotoAlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<PhotoAlbumFilters>({
    page: 1,
    page_size: 24,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoAlbumItem | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

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
        const allSchools = await listSchools(1, 1000);
        setSchools(allSchools);
      } catch (err) {
        console.error("Failed to load schools:", err);
      }
    }
    loadSchools();
  }, []);

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPhotoAlbum(filters);
      setItems(response.items);
      setTotalPages(response.total_pages);
      setCurrentPage(response.page);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
      toast.error("Failed to load photo album");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handleFilterChange = (key: keyof PhotoAlbumFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
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

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full">
        <TopBar title="Candidate Photo Album" />
        <div className="flex-1 overflow-auto p-6">
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name, index number, or school..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="w-[200px]">
                <Select
                  value={filters.school_id?.toString() || ""}
                  onValueChange={(value) =>
                    handleFilterChange("school_id", value ? parseInt(value) : undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Schools" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Schools</SelectItem>
                    {schools.map((school) => (
                      <SelectItem key={school.id} value={school.id.toString()}>
                        {school.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[200px]">
                <Select
                  value={filters.exam_id?.toString() || ""}
                  onValueChange={(value) =>
                    handleFilterChange("exam_id", value ? parseInt(value) : undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Exams" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Exams</SelectItem>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.exam_type} {exam.series} {exam.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[180px]">
                <Select
                  value={filters.has_photo?.toString() || ""}
                  onValueChange={(value) =>
                    handleFilterChange("has_photo", value === "" ? undefined : value === "true")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Candidates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Candidates</SelectItem>
                    <SelectItem value="true">With Photos</SelectItem>
                    <SelectItem value="false">Without Photos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results */}
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-red-600">{error}</div>
            ) : (
              <>
                <div className="text-sm text-gray-600 mb-4">
                  Showing {filteredItems.length} of {total} candidates
                </div>

                {filteredItems.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    No candidates found matching your filters.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {filteredItems.map((item) => (
                      <Card
                        key={item.candidate_id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => item.photo && handleViewPhoto(item)}
                      >
                        <CardContent className="p-4">
                          <div className="aspect-square relative bg-gray-100 rounded-lg overflow-hidden mb-2">
                            {item.photo ? (
                              <img
                                src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"}/api/v1/candidates/${item.candidate_id}/photos/${item.photo.id}/file`}
                                alt={item.candidate_name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "";
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <User className="h-12 w-12 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div className="text-xs space-y-1">
                            <p className="font-medium truncate">{item.candidate_name}</p>
                            <p className="text-gray-500 truncate">{item.index_number}</p>
                            <p className="text-gray-400 truncate">{item.school_name}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

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
