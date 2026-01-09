"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Upload, FileText, Loader2, AlertCircle, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  uploadConfirmationResponse,
  generateConfirmationResponse,
  type CertificateConfirmationRequestResponse,
} from "@/lib/api";

interface ResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmationRequest: CertificateConfirmationRequestResponse;
  onSuccess: () => void;
}

export function ResponseDialog({
  open,
  onOpenChange,
  confirmationRequest,
  onSuccess,
}: ResponseDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadNotes, setUploadNotes] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Template generation fields
  const [letterBody, setLetterBody] = useState("");
  // Response reference number (separate from request_number) - defaults to request_number if not provided
  const [responseReferenceNumber, setResponseReferenceNumber] = useState(
    confirmationRequest.response_reference_number || confirmationRequest.request_number
  );

  // Reset response reference number when dialog opens or request changes
  useEffect(() => {
    if (open) {
      setResponseReferenceNumber(
        confirmationRequest.response_reference_number || confirmationRequest.request_number
      );
    }
  }, [open, confirmationRequest.response_reference_number, confirmationRequest.request_number]);

  // Auto-detect single vs bulk
  const isBulk = useMemo(() => {
    return confirmationRequest.certificate_details?.length > 1;
  }, [confirmationRequest.certificate_details]);

  // Check if response already exists
  const hasExistingResponse = !!confirmationRequest.response_file_path;
  // Check if response is signed
  const isSigned = confirmationRequest.response_signed || false;

  const validateAndSetFile = (file: File) => {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error("Unsupported file type. Please upload a PDF, image, or document file.");
      return;
    }

    // Validate file size (50MB max)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
      return;
    }

    setSelectedFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    validateAndSetFile(droppedFile);
  };

  const handleDropZoneClick = () => {
    const fileInput = document.getElementById("file-upload") as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    const fileInput = document.getElementById("file-upload") as HTMLInputElement;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error("Please select a file to upload");
      return;
    }

    if (hasExistingResponse) {
      const confirmed = window.confirm(
        "A response already exists for this request. Uploading a new file will replace it. Continue?"
      );
      if (!confirmed) return;
    }

    setUploading(true);
    try {
      await uploadConfirmationResponse(confirmationRequest.id, selectedFile, uploadNotes || undefined);
      toast.success("Response uploaded successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setSelectedFile(null);
      setUploadNotes("");
    } catch (error: any) {
      toast.error(error.message || "Failed to upload response");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerate = async () => {
    if (hasExistingResponse) {
      const confirmed = window.confirm(
        "A response already exists for this request. Generating a new response will replace it. Continue?"
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    try {
      const payload: {
        letter?: {
          body?: string;
        };
        reference_number?: string;
      } = {};

      // Build letter payload
      if (letterBody) {
        payload.letter = {
          body: letterBody,
        };
      }

      // Add response reference number (separate from request_number)
      // If provided, use it; backend will default to request_number if empty
      if (responseReferenceNumber && responseReferenceNumber.trim()) {
        payload.reference_number = responseReferenceNumber.trim();
      }

      await generateConfirmationResponse(confirmationRequest.id, payload);
      toast.success("Response generated successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setLetterBody("");
      setResponseReferenceNumber(
        confirmationRequest.response_reference_number || confirmationRequest.request_number
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to generate response");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-5xl min-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Respond to Certificate {confirmationRequest.request_type === "confirmation" ? "Confirmation" : "Verification"} Request</DialogTitle>
          <DialogDescription>
            Request Number: {confirmationRequest.request_number}
          </DialogDescription>
          <div className="flex items-center gap-2 mt-2">
            {isBulk && (
              <Badge variant="outline">
                Bulk Request ({confirmationRequest.certificate_details.length} certificates)
              </Badge>
            )}
            {!isBulk && (
              <Badge variant="outline">
                Single Request
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {isSigned && (
            <Alert className="h-24 flex items-center py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Response is signed and locked.</strong> This response cannot be modified.
                {confirmationRequest.response_signed_at && (
                  <> Signed on {new Date(confirmationRequest.response_signed_at).toLocaleString()}</>
                )}
              </AlertDescription>
            </Alert>
          )}
          {hasExistingResponse && !isSigned && (
            <Alert className="h-24 flex items-center py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                A response already exists: <strong>{confirmationRequest.response_file_name}</strong>
                {confirmationRequest.responded_at && (
                  <> (uploaded on {new Date(confirmationRequest.responded_at).toLocaleString()})</>
                )}
                . Uploading or generating a new response will replace it.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Tabs defaultValue="upload" className="w-full flex flex-col h-[80%]">
          <TabsList className="grid w-full grid-cols-2 shrink-0">
            <TabsTrigger value="upload" disabled={isSigned}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </TabsTrigger>
            <TabsTrigger value="template" disabled={isSigned}>
              <FileText className="mr-2 h-4 w-4" />
              Generate from Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4 mt-4 flex-1 overflow-y-auto min-h-0">
            {isSigned && (
              <div className="p-4 border rounded-md bg-muted text-center text-muted-foreground">
                Response is signed and locked. Modification is not allowed.
              </div>
            )}
            <div className="space-y-2">
              <Label>Response Document</Label>
              {!selectedFile ? (
                <div
                  onClick={handleDropZoneClick}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isSigned}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <div
                      className={cn(
                        "rounded-full p-3 transition-colors",
                        isDragging ? "bg-primary/10" : "bg-muted"
                      )}
                    >
                      <Upload
                        className={cn(
                          "h-6 w-6 transition-colors",
                          isDragging ? "text-primary" : "text-muted-foreground"
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {isDragging ? "Drop file here" : "Click to upload or drag and drop"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, Word documents, images, or text files (Max 50MB)
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="shrink-0 rounded-lg bg-primary/10 p-2">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                      </div>
                      <div className="shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={removeFile}
                      disabled={isSigned}
                      className="h-8 w-8 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="upload-notes" className="text-sm">Notes (Optional)</Label>
              <Textarea
                id="upload-notes"
                placeholder="Add any notes about this response..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                rows={2}
                className="text-sm"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpload} disabled={!selectedFile || uploading || isSigned}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload Response
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="template" className="space-y-3 mt-4 flex-1 overflow-y-auto min-h-0">
            {isSigned && (
              <div className="p-3 border rounded-md bg-muted text-center text-muted-foreground text-sm">
                Response is signed and locked. Modification is not allowed.
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Template Type</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {isBulk ? "Bulk Request Template" : "Single Request Template"}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="response-reference-number" className="text-sm">Response Reference Number</Label>
                <Input
                  id="response-reference-number"
                  value={responseReferenceNumber}
                  onChange={(e) => setResponseReferenceNumber(e.target.value)}
                  placeholder={confirmationRequest.request_number}
                  disabled={isSigned}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Separate from request reference ({confirmationRequest.request_number}). Defaults to request reference if not provided.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="letter-body" className="text-sm">Response Content</Label>
                <RichTextEditor
                  content={letterBody}
                  onChange={(html) => setLetterBody(html)}
                  placeholder="Enter the response content..."
                  disabled={isSigned}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={generating || !letterBody || isSigned}>
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate Response PDF
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
