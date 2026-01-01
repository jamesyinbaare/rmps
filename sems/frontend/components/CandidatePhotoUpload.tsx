"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadCandidatePhoto } from "@/lib/api";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";

interface CandidatePhotoUploadProps {
  candidateId: number;
  candidateName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadSuccess?: () => void;
}

export function CandidatePhotoUpload({
  candidateId,
  candidateName,
  open,
  onOpenChange,
  onUploadSuccess,
}: CandidatePhotoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setError(null);
      setValidationErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [open]);

  // Clean up preview URL
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const validateFile = (selectedFile: File): string[] => {
    const errors: string[] = [];

    // Check file type
    if (selectedFile.type !== "image/jpeg") {
      errors.push("File must be JPEG format");
    }

    // Check file size (2MB limit)
    const maxSize = 2 * 1024 * 1024; // 2MB
    if (selectedFile.size > maxSize) {
      errors.push(`File size (${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB) exceeds 2MB limit`);
    }

    return errors;
  };

  const validateImageDimensions = async (file: File): Promise<string[]> => {
    return new Promise((resolve) => {
      const errors: string[] = [];
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const width = img.width;
        const height = img.height;

        // Check minimum dimensions (200x200)
        if (width < 200 || height < 200) {
          errors.push(
            `Image dimensions (${width}x${height}) are too small. Minimum required: 200x200 pixels`
          );
        }

        // Check maximum dimensions (600x600)
        if (width > 600 || height > 600) {
          errors.push(
            `Image dimensions (${width}x${height}) are too large. Maximum allowed: 600x600 pixels`
          );
        }

        resolve(errors);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        errors.push("Failed to read image dimensions");
        resolve(errors);
      };

      img.src = url;
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError(null);
    setValidationErrors([]);

    // Basic validation
    const basicErrors = validateFile(selectedFile);
    if (basicErrors.length > 0) {
      setValidationErrors(basicErrors);
      setFile(null);
      setPreview(null);
      return;
    }

    // Validate dimensions
    const dimensionErrors = await validateImageDimensions(selectedFile);
    if (dimensionErrors.length > 0) {
      setValidationErrors(dimensionErrors);
      setFile(null);
      setPreview(null);
      return;
    }

    // Create preview
    const previewUrl = URL.createObjectURL(selectedFile);
    setFile(selectedFile);
    setPreview(previewUrl);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFile = e.dataTransfer.files[0];
    if (!droppedFile) return;

    setError(null);
    setValidationErrors([]);

    // Basic validation
    const basicErrors = validateFile(droppedFile);
    if (basicErrors.length > 0) {
      setValidationErrors(basicErrors);
      setFile(null);
      setPreview(null);
      return;
    }

    // Validate dimensions
    const dimensionErrors = await validateImageDimensions(droppedFile);
    if (dimensionErrors.length > 0) {
      setValidationErrors(dimensionErrors);
      setFile(null);
      setPreview(null);
      return;
    }

    // Create preview
    const previewUrl = URL.createObjectURL(droppedFile);
    setFile(droppedFile);
    setPreview(previewUrl);
  };

  const removeFile = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setFile(null);
    setPreview(null);
    setError(null);
    setValidationErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a photo");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      await uploadCandidatePhoto(candidateId, file, true);
      onUploadSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Passport Photo</DialogTitle>
          <DialogDescription>
            Upload a passport photo for {candidateName}. Photo must be JPEG format, between 200x200 and
            600x600 pixels, and under 2MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {!file ? (
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Click to upload or drag and drop
              </p>
              <p className="mt-1 text-xs text-gray-500">JPEG only, 200x200 to 600x600 pixels, max 2MB</p>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative border rounded-lg overflow-hidden">
                <img
                  src={preview || ""}
                  alt="Preview"
                  className="w-full h-auto max-h-64 object-contain mx-auto"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={removeFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm text-gray-600">
                <p>File: {file.name}</p>
                <p>Size: {(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={!file || uploading || validationErrors.length > 0}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
