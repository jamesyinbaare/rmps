"use client";

import { useState, useMemo } from "react";
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
  const [letterSubject, setLetterSubject] = useState("");
  const [letterBody, setLetterBody] = useState("");
  const [signatory, setSignatory] = useState("");

  // Per-candidate outcomes (for bulk requests)
  const [outcomes, setOutcomes] = useState<Record<string, { status: string; remarks: string }>>({});

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
          subject?: string;
          body?: string;
          remarks?: string;
          signatory_name?: string;
          signatory_title?: string;
        };
        outcomes?: Record<string, { status?: string; remarks?: string }>;
      } = {};

      // Build letter payload
      if (letterSubject || letterBody || signatory) {
        payload.letter = {};
        if (letterSubject) payload.letter.subject = letterSubject;
        if (letterBody) {
          payload.letter.body = letterBody;
        } else if (!letterBody && letterSubject) {
          // If only subject is provided, use it as remarks
          payload.letter.remarks = letterSubject;
        }
        if (signatory) payload.letter.signatory = signatory;
      }

      // Build outcomes payload if there are any outcomes set
      const hasOutcomes = Object.keys(outcomes).some(
        (key) => outcomes[key].status || outcomes[key].remarks
      );
      if (hasOutcomes) {
        payload.outcomes = {};
        for (const [key, value] of Object.entries(outcomes)) {
          if (value.status || value.remarks) {
            payload.outcomes[key] = {
              status: value.status || undefined,
              remarks: value.remarks || undefined,
            };
          }
        }
      }

      await generateConfirmationResponse(confirmationRequest.id, payload);
      toast.success("Response generated successfully");
      onSuccess();
      onOpenChange(false);
      // Reset form
      setLetterSubject("");
      setLetterBody("");
      setSignatory("");
      setOutcomes({});
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
                <Label htmlFor="letter-subject">Subject (Optional)</Label>
                <Input
                  id="letter-subject"
                  placeholder="e.g., Certificate Verification Response"
                  value={letterSubject}
                  onChange={(e) => setLetterSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="letter-body">Body / Remarks</Label>
                <Textarea
                  id="letter-body"
                  placeholder="Enter the response content..."
                  value={letterBody}
                  onChange={(e) => setLetterBody(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signatory">Signatory (Optional)</Label>
                <Textarea
                  id="signatory"
                  placeholder="e.g., John Doe&#10;Director of Examinations"
                  value={signatory}
                  onChange={(e) => setSignatory(e.target.value)}
                  rows={3}
                  className="text-left"
                />
                <p className="text-sm text-muted-foreground">
                  Enter the signatory name and title (multi-line supported)
                </p>
              </div>

              {isBulk && confirmationRequest.certificate_details && (
                <div className="space-y-2">
                  <Label>Per-Candidate Outcomes (Optional)</Label>
                  <p className="text-sm text-muted-foreground">
                    You can specify outcomes for individual candidates. Leave blank to skip.
                  </p>
                  <div className="space-y-3 max-h-48 overflow-y-auto border rounded-md p-3">
                    {confirmationRequest.certificate_details.map((cert, index) => {
                      // Use stripped index number as key to match backend lookup
                      const indexNumber = (cert.candidate_index_number || "").trim() || `candidate_${index}`;
                      const currentOutcome = outcomes[indexNumber] || { status: "", remarks: "" };

                      return (
                        <div key={index} className="border-b pb-3 last:border-b-0">
                          <div className="font-medium text-sm mb-2">
                            {cert.candidate_name} ({cert.candidate_index_number || "N/A"})
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="Status (e.g., Verified, Not Found)"
                              value={currentOutcome.status}
                              onChange={(e) => {
                                setOutcomes({
                                  ...outcomes,
                                  [indexNumber]: {
                                    ...currentOutcome,
                                    status: e.target.value,
                                  },
                                });
                              }}
                              className="text-sm"
                            />
                            <Input
                              placeholder="Remarks"
                              value={currentOutcome.remarks}
                              onChange={(e) => {
                                setOutcomes({
                                  ...outcomes,
                                  [indexNumber]: {
                                    ...currentOutcome,
                                    remarks: e.target.value,
                                  },
                                });
                              }}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={generating || (!letterBody && !letterSubject) || isSigned}>
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
