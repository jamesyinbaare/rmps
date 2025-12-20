"use client";

import { useState, useEffect } from "react";
import { X, File, Image as ImageIcon, FileText, Download } from "lucide-react";
import { Button } from "./ui/button";
import type { Document, Exam, School, Subject } from "@/types/document";
import { formatFileSize, formatDate } from "@/lib/utils";
import { API_BASE_URL, downloadDocument, getExam, listSchools, listSubjects } from "@/lib/api";

interface DocumentViewerProps {
  document: Document;
  onClose: () => void;
  onDownload?: (document: Document) => void;
}

export function DocumentViewer({ document, onClose, onDownload }: DocumentViewerProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [examName, setExamName] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const previewUrl = `${API_BASE_URL}/api/v1/documents/${document.id}/download`;
  const displayText = document.extracted_id || document.file_name;

  // Fetch exam, school, and subject names
  useEffect(() => {
    // Reset names when document changes
    setExamName(null);
    setSchoolName(null);
    setSubjectName(null);

    const fetchNames = async () => {
      try {
        // Fetch exam name (with pagination)
        if (document.exam_id) {
          try {
            const exam = await getExam(document.exam_id);
            setExamName(exam.exam_type);
          } catch (err) {
            console.error("Failed to fetch exam:", err);
          }
        }

        // Fetch school name (with pagination)
        if (document.school_id) {
          try {
            let schoolPage = 1;
            let schoolFound = false;
            while (!schoolFound && schoolPage <= 10) {
              const schools = await listSchools(schoolPage, 100);
              const school = schools.find((s: School) => s.id === document.school_id);
              if (school) {
                setSchoolName(school.name);
                schoolFound = true;
              }
              if (schools.length < 100) break; // No more pages
              schoolPage++;
            }
          } catch (err) {
            console.error("Failed to fetch school:", err);
          }
        }

        // Fetch subject name (with pagination)
        if (document.subject_id) {
          try {
            let subjectPage = 1;
            let subjectFound = false;
            while (!subjectFound && subjectPage <= 10) {
              const subjects = await listSubjects(subjectPage, 100);
              const subject = subjects.find((s: Subject) => s.id === document.subject_id);
              if (subject) {
                setSubjectName(subject.name);
                subjectFound = true;
              }
              if (subjects.length < 100) break; // No more pages
              subjectPage++;
            }
          } catch (err) {
            console.error("Failed to fetch subject:", err);
          }
        }
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      }
    };

    fetchNames();
  }, [document.exam_id, document.school_id, document.subject_id]);

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) {
      return ImageIcon;
    }
    if (mimeType === "application/pdf") {
      return FileText;
    }
    return File;
  };

  const getFileType = (mimeType: string, fileName: string) => {
    if (mimeType.startsWith("image/")) {
      const ext = fileName.split(".").pop()?.toUpperCase();
      return ext || "IMAGE";
    }
    if (mimeType === "application/pdf") {
      return "PDF";
    }
    return "FILE";
  };

  const Icon = getFileIcon(document.mime_type);
  const fileType = getFileType(document.mime_type, document.file_name);

  const handleDownload = async () => {
    if (onDownload) {
      onDownload(document);
    } else {
      // Fallback download handler
      try {
        const blob = await downloadDocument(document.id);
        const url = window.URL.createObjectURL(blob);
        const a = window.document.createElement("a");
        a.href = url;

        let downloadFilename = document.file_name;
        if (document.extracted_id) {
          const fileExtension = document.file_name.split('.').pop();
          downloadFilename = fileExtension ? `${document.extracted_id}.${fileExtension}` : document.extracted_id;
        }

        a.download = downloadFilename;
        window.document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        window.document.body.removeChild(a);
      } catch (error) {
        console.error("Failed to download document:", error);
        alert("Failed to download document. Please try again.");
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-l border-border">
      {/* Header with Document Details */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{document.extracted_id || "-"}</h2>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            {schoolName && (
              <span>School: {schoolName}</span>
            )}
            {subjectName && (
              <>
                {schoolName && <span>•</span>}
                <span>Subject: {subjectName}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={handleDownload}
            className="h-8 w-8"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document Content Area */}
      <div className="flex-1 overflow-auto bg-muted/30 p-4">
        <div className="w-full h-full flex items-center justify-center">
          {imageLoading && !imageError && document.mime_type.startsWith("image/") && (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          {!imageError && document.mime_type.startsWith("image/") ? (
            <img
              src={previewUrl}
              alt={displayText}
              className="max-w-full max-h-full object-contain"
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8">
              <Icon className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {fileType} • {formatFileSize(document.file_size)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
