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
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
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
    }
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

        {isSigned && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Response is signed and locked.</strong> This response cannot be modified.
              {confirmationRequest.response_signed_at && (
                <> Signed on {new Date(confirmationRequest.response_signed_at).toLocaleString()}</>
              )}
            </AlertDescription>
          </Alert>
        )}
        {hasExistingResponse && !isSigned && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A response already exists for this request: <strong>{confirmationRequest.response_file_name}</strong>
              {confirmationRequest.responded_at && (
                <> (uploaded on {new Date(confirmationRequest.responded_at).toLocaleString()})</>
              )}
              . Uploading or generating a new response will replace it.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" disabled={isSigned}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </TabsTrigger>
            <TabsTrigger value="template" disabled={isSigned}>
              <FileText className="mr-2 h-4 w-4" />
              Generate from Template
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            {isSigned && (
              <div className="p-4 border rounded-md bg-muted text-center text-muted-foreground">
                Response is signed and locked. Modification is not allowed.
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="file-upload">Response Document</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                onChange={handleFileSelect}
              />
              <p className="text-sm text-muted-foreground">
                Accepted formats: PDF, Word documents, images, text files (Max 50MB)
              </p>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  <span>{selectedFile.name}</span>
                  <span className="text-muted-foreground">
                    ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-notes">Notes (Optional)</Label>
              <Textarea
                id="upload-notes"
                placeholder="Add any notes about this response..."
                value={uploadNotes}
                onChange={(e) => setUploadNotes(e.target.value)}
                rows={3}
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

          <TabsContent value="template" className="space-y-4">
            {isSigned && (
              <div className="p-4 border rounded-md bg-muted text-center text-muted-foreground">
                Response is signed and locked. Modification is not allowed.
              </div>
            )}
            <div className="space-y-2">
              <Label>Template Type</Label>
              <Badge variant="outline">
                {isBulk ? "Bulk Request Template" : "Single Request Template"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                The system will automatically use the appropriate template based on request type.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="response-reference-number">Response Reference Number</Label>
                <Input
                  id="response-reference-number"
                  value={responseReferenceNumber}
                  onChange={(e) => setResponseReferenceNumber(e.target.value)}
                  placeholder={confirmationRequest.request_number}
                  disabled={isSigned}
                />
                <p className="text-sm text-muted-foreground">
                  Reference number for the response letter. This is separate from the request reference number ({confirmationRequest.request_number}) and may come from an external system. If not provided, it will default to the request reference number.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="letter-body">Response Content</Label>
                <p className="text-sm text-muted-foreground">
                  Enter the response content. You can use the rich text editor to format text, add tables, and include all necessary information.
                </p>
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
