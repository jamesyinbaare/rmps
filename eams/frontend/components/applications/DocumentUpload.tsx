"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadDocument, deleteDocument } from "@/lib/api";
import { toast } from "sonner";
import { Upload, FileText, Trash2 } from "lucide-react";
import type { ExaminerDocumentType, ExaminerApplicationDocumentResponse } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002";

interface DocumentUploadProps {
  applicationId: string;
  documents?: ExaminerApplicationDocumentResponse[];
  onUploadSuccess?: (updatedDocuments: ExaminerApplicationDocumentResponse[]) => void;
}

const documentTypes: { value: ExaminerDocumentType; label: string; maxFiles: number; accept: string; required?: boolean; requiredHint?: string }[] = [
  { value: "PHOTOGRAPH", label: "Photograph", maxFiles: 1, accept: "image/jpeg,image/png,image/jpg", required: true },
  { value: "CERTIFICATE", label: "Certificate", maxFiles: 3, accept: "image/jpeg,image/png,image/jpg,application/pdf", required: true, requiredHint: "At least one required" },
  { value: "TRANSCRIPT", label: "Transcript", maxFiles: 3, accept: "image/jpeg,image/png,image/jpg,application/pdf" },
];

export function DocumentUpload({ applicationId, documents = [], onUploadSuccess }: DocumentUploadProps) {
  const [localDocuments, setLocalDocuments] = useState<ExaminerApplicationDocumentResponse[]>(documents);
  const [uploading, setUploading] = useState<Record<ExaminerDocumentType, boolean>>({
    PHOTOGRAPH: false,
    CERTIFICATE: false,
    TRANSCRIPT: false,
  });
  const [dragging, setDragging] = useState<ExaminerDocumentType | null>(null);
  const fileInputRefs = useRef<Record<ExaminerDocumentType, HTMLInputElement | null>>({
    PHOTOGRAPH: null,
    CERTIFICATE: null,
    TRANSCRIPT: null,
  });

  // Update local documents when prop changes (only if documents actually changed)
  const prevDocumentsRef = useRef<string>("");
  useEffect(() => {
    // Only update if documents array content actually changed
    const documentsStr = JSON.stringify(documents);
    if (documentsStr !== prevDocumentsRef.current) {
      prevDocumentsRef.current = documentsStr;
      setLocalDocuments(documents);
    }
  }, [documents]);

  const getDocumentsByType = (type: ExaminerDocumentType) => {
    return localDocuments.filter((doc) => doc.document_type === type);
  };

  const canUploadMore = (type: ExaminerDocumentType) => {
    const typeConfig = documentTypes.find((dt) => dt.value === type);
    if (!typeConfig) return false;
    const currentCount = getDocumentsByType(type).length;
    return currentCount < typeConfig.maxFiles;
  };

  const validateFile = (file: File, type: ExaminerDocumentType): boolean => {
    const typeConfig = documentTypes.find((dt) => dt.value === type);
    if (!typeConfig) return false;

    // Validate file type
    const allowedTypes = typeConfig.accept.split(",").map((t) => t.trim());
    if (!allowedTypes.includes(file.type)) {
      toast.error(`Invalid file type for ${typeConfig.label}. Allowed types: ${typeConfig.accept}`);
      return false;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("File size exceeds 10MB limit.");
      return false;
    }

    return true;
  };

  const handleUpload = useCallback(
    async (file: File, type: ExaminerDocumentType) => {
      if (!validateFile(file, type)) return;

      const typeConfig = documentTypes.find((dt) => dt.value === type);
      if (!typeConfig) return;

      // Check if we need to delete old photo before uploading new one
      if (type === "PHOTOGRAPH") {
        const existingPhotos = getDocumentsByType("PHOTOGRAPH");
        if (existingPhotos.length > 0) {
          // Delete old photo
          try {
            await deleteDocument(applicationId, existingPhotos[0].id);
          } catch {
            // Continue with upload anyway
          }
        }
      } else {
        // Check if we've reached the max files
        const currentCount = getDocumentsByType(type).length;
        if (currentCount >= typeConfig.maxFiles) {
          toast.error(`Maximum ${typeConfig.maxFiles} ${typeConfig.label} file(s) allowed.`);
          return;
        }
      }

      setUploading((prev) => ({ ...prev, [type]: true }));
      try {
        const uploadedDoc = await uploadDocument(applicationId, type, file);

        // Update local documents immediately
        let updatedDocs: ExaminerApplicationDocumentResponse[];
        if (type === "PHOTOGRAPH") {
          // Replace existing photo
          updatedDocs = [
            ...localDocuments.filter((d) => d.document_type !== "PHOTOGRAPH"),
            uploadedDoc,
          ];
        } else {
          // Add new document
          updatedDocs = [...localDocuments, uploadedDoc];
        }
        setLocalDocuments(updatedDocs);

        toast.success(`${typeConfig.label} uploaded successfully`);
        if (onUploadSuccess) {
          onUploadSuccess(updatedDocs);
        }
        // Clear file input
        if (fileInputRefs.current[type]) {
          fileInputRefs.current[type]!.value = "";
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to upload document");
      } finally {
        setUploading((prev) => ({ ...prev, [type]: false }));
      }
    },
    [applicationId, localDocuments, onUploadSuccess]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: ExaminerDocumentType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleUpload(file, type);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent, type: ExaminerDocumentType) => {
      e.preventDefault();
      setDragging(null);
      const file = e.dataTransfer.files[0];
      if (file) {
        handleUpload(file, type);
      }
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent, type: ExaminerDocumentType) => {
    e.preventDefault();
    if (canUploadMore(type)) {
      setDragging(type);
    }
  }, [documents]);

  const handleDragLeave = useCallback(() => {
    setDragging(null);
  }, []);

  const handleDelete = async (documentId: string, type: ExaminerDocumentType) => {
    try {
      await deleteDocument(applicationId, documentId);

      // Update local documents immediately
      const updatedDocs = localDocuments.filter((d) => d.id !== documentId);
      setLocalDocuments(updatedDocs);

      toast.success("Document deleted successfully");
      if (onUploadSuccess) {
        onUploadSuccess(updatedDocs);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete document");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {documentTypes.map((typeConfig) => {
        const typeDocs = getDocumentsByType(typeConfig.value);
        const canUpload = canUploadMore(typeConfig.value);
        const isUploading = uploading[typeConfig.value];

        return (
          <Card key={typeConfig.value} className="w-full">
            <CardHeader>
              <CardTitle className="text-lg">
                {typeConfig.label}
                {typeConfig.required && (
                  <span className="text-destructive font-normal ml-1">
                    {typeConfig.requiredHint ?? "(required)"}
                  </span>
                )}
              </CardTitle>
              <CardDescription className="text-sm">
                {typeConfig.value === "PHOTOGRAPH"
                  ? "Upload one photograph (JPEG, PNG). New upload will replace existing."
                  : `Upload up to ${typeConfig.maxFiles} ${typeConfig.label.toLowerCase()} file(s) (JPEG, PNG, or PDF).`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {typeConfig.value === "PHOTOGRAPH" ? (
                // Photo upload - display in place like registration portal
                <div className="space-y-3">
                  {typeDocs.length > 0 ? (
                    // Show uploaded photo
                    <div className="flex items-start gap-4">
                      <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-muted group shrink-0">
                        <img
                          src={`${API_BASE_URL}/api/v1/examiner/applications/${applicationId}/documents/${typeDocs[0].id}/download`}
                          alt={typeDocs[0].file_name}
                          className="w-full h-full object-cover"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                          onClick={() => handleDelete(typeDocs[0].id, typeConfig.value)}
                          disabled={isUploading}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">{typeDocs[0].file_name}</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          {(typeDocs[0].file_size / 1024 / 1024).toFixed(2)} MB
                        </p>
                        <div
                          className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                            dragging === typeConfig.value
                              ? "border-primary bg-primary/5"
                              : "border-muted-foreground/25 hover:border-muted-foreground/50"
                          }`}
                          onDrop={(e) => handleDrop(e, typeConfig.value)}
                          onDragOver={(e) => handleDragOver(e, typeConfig.value)}
                          onDragLeave={handleDragLeave}
                        >
                          <input
                            ref={(el) => {
                              fileInputRefs.current[typeConfig.value] = el;
                            }}
                            type="file"
                            accept={typeConfig.accept}
                            onChange={(e) => handleFileSelect(e, typeConfig.value)}
                            disabled={isUploading}
                            className="hidden"
                            id={`file-input-${typeConfig.value}`}
                          />
                          <label
                            htmlFor={`file-input-${typeConfig.value}`}
                            className="cursor-pointer flex flex-col items-center gap-2"
                          >
                            <Upload className="h-6 w-6 text-muted-foreground" />
                            <div className="text-sm">
                              <span className="text-primary font-medium">Replace photo</span> or drag and drop
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {typeConfig.accept} (Max 10MB)
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Show upload area when no photo
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        dragging === typeConfig.value
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-muted-foreground/50"
                      }`}
                      onDrop={(e) => handleDrop(e, typeConfig.value)}
                      onDragOver={(e) => handleDragOver(e, typeConfig.value)}
                      onDragLeave={handleDragLeave}
                    >
                      <input
                        ref={(el) => {
                              fileInputRefs.current[typeConfig.value] = el;
                            }}
                        type="file"
                        accept={typeConfig.accept}
                        onChange={(e) => handleFileSelect(e, typeConfig.value)}
                        disabled={isUploading}
                        className="hidden"
                        id={`file-input-${typeConfig.value}`}
                      />
                      <label
                        htmlFor={`file-input-${typeConfig.value}`}
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <div className="text-sm">
                          <span className="text-primary font-medium">Click to upload</span> or drag and drop
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {typeConfig.accept} (Max 10MB)
                        </div>
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                // Certificate/Transcript - standard upload and list
                <>
                  {/* Upload Area */}
                  {canUpload && (
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        dragging === typeConfig.value
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-muted-foreground/50"
                      }`}
                      onDrop={(e) => handleDrop(e, typeConfig.value)}
                      onDragOver={(e) => handleDragOver(e, typeConfig.value)}
                      onDragLeave={handleDragLeave}
                    >
                      <input
                        ref={(el) => {
                              fileInputRefs.current[typeConfig.value] = el;
                            }}
                        type="file"
                        accept={typeConfig.accept}
                        onChange={(e) => handleFileSelect(e, typeConfig.value)}
                        disabled={isUploading}
                        className="hidden"
                        id={`file-input-${typeConfig.value}`}
                      />
                      <label
                        htmlFor={`file-input-${typeConfig.value}`}
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <div className="text-sm">
                          <span className="text-primary font-medium">Click to upload</span> or drag and drop
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {typeConfig.accept} (Max 10MB)
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Uploaded Documents */}
                  {typeDocs.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">Uploaded {typeConfig.label}</Label>
                      <div className="space-y-2">
                        {typeDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-3 border rounded-lg bg-card"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="text-sm truncate">{doc.file_name}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                ({(doc.file_size / 1024 / 1024).toFixed(2)} MB)
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => handleDelete(doc.id, doc.document_type)}
                              disabled={isUploading}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Upload Status */}
              {isUploading && (
                <div className="text-sm text-muted-foreground text-center">
                  Uploading {typeConfig.label.toLowerCase()}...
                </div>
              )}

              {/* Max Files Reached */}
              {!canUpload && typeDocs.length > 0 && (
                <div className="text-sm text-muted-foreground text-center">
                  Maximum {typeConfig.maxFiles} file(s) uploaded. Delete existing to upload more.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
