"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadDocument, listSchools, listSubjects } from "@/lib/api";
import type { Document, School, Subject } from "@/types/document";
import { File } from "lucide-react";
import { FileGrid } from "./FileGrid";
import { FileListItem } from "./FileListItem";

interface DocumentListProps {
  documents: Document[];
  loading?: boolean;
  currentPage: number;
  totalPages: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  viewMode?: "grid" | "list";
  onSelect?: (document: Document) => void;
  onDelete?: (document: Document) => void;
}

export function DocumentList({
  documents,
  loading = false,
  currentPage,
  totalPages,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  viewMode = "grid",
  onSelect,
  onDelete,
}: DocumentListProps) {
  const [schoolMap, setSchoolMap] = useState<Map<number, string>>(new Map());
  const [subjectMap, setSubjectMap] = useState<Map<number, string>>(new Map());
  const [lookupLoading, setLookupLoading] = useState(true);

  // Fetch lookup data for schools and subjects
  useEffect(() => {
    const fetchLookupData = async () => {
      if (viewMode !== "list") {
        setLookupLoading(false);
        return;
      }

      try {
        setLookupLoading(true);
        const schoolMap = new Map<number, string>();
        const subjectMap = new Map<number, string>();

        // Fetch all schools
        let schoolPage = 1;
        let schoolHasMore = true;
        while (schoolHasMore) {
          const schools = await listSchools(schoolPage, 100);
          schools.forEach((school: School) => {
            schoolMap.set(school.id, school.name);
          });
          // If we got fewer than 100, we're done. Also add a safety limit.
          schoolHasMore = schools.length === 100 && schoolPage < 100;
          schoolPage++;
        }

        // Fetch all subjects
        let subjectPage = 1;
        let subjectHasMore = true;
        while (subjectHasMore) {
          const subjects = await listSubjects(subjectPage, 100);
          subjects.forEach((subject: Subject) => {
            subjectMap.set(subject.id, subject.name);
          });
          // If we got fewer than 100, we're done. Also add a safety limit.
          subjectHasMore = subjects.length === 100 && subjectPage < 100;
          subjectPage++;
        }

        setSchoolMap(schoolMap);
        setSubjectMap(subjectMap);
      } catch (error) {
        console.error("Failed to fetch lookup data:", error);
      } finally {
        setLookupLoading(false);
      }
    };

    fetchLookupData();
  }, [viewMode]);

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      // Use extracted_id as filename if available, otherwise use file_name
      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        // Extract file extension from original filename
        const fileExtension = doc.file_name.split('.').pop();
        downloadFilename = fileExtension ? `${doc.extracted_id}.${fileExtension}` : doc.extracted_id;
      }

      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download document:", error);
      alert("Failed to download document. Please try again.");
    }
  };

  if (loading) {
    if (viewMode === "grid") {
      return (
        <div className="grid grid-cols-2 gap-4 p-6 xl:grid-cols-7">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex flex-col items-center rounded-lg border border-border bg-card p-4">
              <Skeleton className="h-20 w-20 rounded mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="divide-y divide-border px-6 pt-6">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 py-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-3 w-[200px]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <File className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg font-medium mb-2">No documents found</p>
        <p className="text-sm text-muted-foreground">No documents match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {viewMode === "grid" ? (
        <FileGrid documents={documents} onDownload={handleDownload} onSelect={onSelect} onDelete={onDelete} />
      ) : (
        <div>
          {/* Table Header */}
          <div className="hidden md:flex items-center gap-4 border-b border-border sticky top-0 bg-background z-10 px-6 pt-6 pb-3">
            <div className="w-10 shrink-0" /> {/* Icon spacer */}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-medium">File Name</div>
            </div>
            <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block max-w-[200px]">
              <div className="text-xs truncate min-w-[200px]">School</div>
            </div>
            <div className="hidden shrink-0 text-left text-sm text-muted-foreground md:block max-w-[200px] ml-8">
              <div className="text-xs truncate min-w-[200px]">Subject</div>
            </div>
            <div className="w-10 shrink-0" /> {/* Actions spacer */}
          </div>
          {/* Table Rows */}
          <div className="divide-y divide-border px-6">
            {documents.map((doc) => (
              <FileListItem
                key={doc.id}
                document={doc}
                onDownload={handleDownload}
                onSelect={onSelect}
                onDelete={onDelete}
                schoolName={doc.school_id ? schoolMap.get(doc.school_id) : undefined}
                subjectName={doc.subject_id ? subjectMap.get(doc.subject_id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {(totalPages > 1 || onPageSizeChange) && (
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="flex items-center gap-4">
            {totalPages > 1 && (
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
            )}
            {onPageSizeChange && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select
                  value={pageSize.toString()}
                  onValueChange={(value) => onPageSizeChange(parseInt(value, 10))}
                >
                  <SelectTrigger className="h-8 w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
