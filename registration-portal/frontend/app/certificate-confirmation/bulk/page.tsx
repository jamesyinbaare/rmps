"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import {
  submitBulkCertificateRequest,
  listExaminationCentersPublic,
  type BulkCertificateRequestCreate,
  type BulkCertificateRequestItem,
  type ExaminationCenter,
} from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Upload, Plus, X, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type RequestType = "confirmation" | "verification";

export default function BulkCertificateConfirmationPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    bulk_request_number?: string;
    bulk_request_id?: number;
    total_amount?: number;
    invoice_number?: string | null;
    success: number;
    failed: number;
    individual_requests?: Array<{ index: number; request_number: string; request_id: number }>;
    requests?: any[]; // For backward compatibility
    errors: Array<{ index: number; error: string }>;
  } | null>(null);

  // Form data
  const [requestType, setRequestType] = useState<RequestType>("confirmation");
  const [serviceType, setServiceType] = useState<"standard" | "express">("standard");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [requests, setRequests] = useState<BulkCertificateRequestItem[]>([
    {
      candidate_name: "",
      candidate_index_number: "",
      completion_year: new Date().getFullYear(),
      school_name: "",
      programme_name: "",
      request_details: "",
      certificate_file: undefined,
      candidate_photo_file: undefined,
    },
  ]);

  const addRequest = () => {
    setRequests([
      ...requests,
      {
        candidate_name: "",
        candidate_index_number: "",
        completion_year: new Date().getFullYear(),
        school_name: "",
        programme_name: "",
        request_details: "",
        certificate_file: undefined,
        candidate_photo_file: undefined,
      },
    ]);
  };

  const removeRequest = (index: number) => {
    if (requests.length > 1) {
      setRequests(requests.filter((_, i) => i !== index));
    }
  };

  const updateRequest = (index: number, field: keyof BulkCertificateRequestItem, value: any) => {
    const updated = [...requests];
    updated[index] = { ...updated[index], [field]: value };
    setRequests(updated);
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").filter((line) => line.trim());

      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes("candidate") ? 1 : 0;
      const parsed: BulkCertificateRequestItem[] = [];

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(",").map((p) => p.trim());
        // CSV format: candidate_name, candidate_index_number, completion_year, school_name, programme_name, request_details (optional)
        if (parts.length >= 5) {
          const [candidate_name, candidate_index_number, completion_year, school_name, programme_name, request_details] = parts;

          parsed.push({
            candidate_name: candidate_name || "",
            candidate_index_number: candidate_index_number || "",
            completion_year: parseInt(completion_year) || new Date().getFullYear(),
            school_name: school_name || "",
            programme_name: programme_name || "",
            request_details: request_details || "",
          });
        }
      }

      if (parsed.length > 0) {
        setRequests(parsed);
        toast.success(`Loaded ${parsed.length} requests from CSV`);
      } else {
        toast.error("No valid requests found in CSV file");
      }
    };
    reader.readAsText(file);
  };

  const validateForm = (): boolean => {
    if (!contactPhone.trim()) {
      toast.error("Please enter your contact phone number");
      return false;
    }

    if (requests.length === 0) {
      toast.error("Please add at least one request");
      return false;
    }

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      if (!req.candidate_name?.trim()) {
        toast.error(`Request ${i + 1}: Candidate name is required`);
        return false;
      }
      if (!req.candidate_index_number?.trim() && !req.index_number?.trim()) {
        toast.error(`Request ${i + 1}: Candidate index number is required`);
        return false;
      }
      const year = req.completion_year || req.exam_year;
      if (!year || year < 2000 || year > new Date().getFullYear()) {
        toast.error(`Request ${i + 1}: Invalid completion year`);
        return false;
      }
      if (!req.school_name?.trim()) {
        toast.error(`Request ${i + 1}: School name is required`);
        return false;
      }
      if (!req.programme_name?.trim()) {
        toast.error(`Request ${i + 1}: Programme name is required`);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const requestData: BulkCertificateRequestCreate = {
        request_type: requestType,
        requests: requests.map((r) => ({
          candidate_name: r.candidate_name || "",
          candidate_index_number: r.candidate_index_number || r.index_number || "",
          completion_year: r.completion_year || r.exam_year || new Date().getFullYear(),
          school_name: r.school_name || "",
          programme_name: r.programme_name || "",
          request_details: r.request_details || "",
          certificate_file: r.certificate_file,
          candidate_photo_file: r.candidate_photo_file,
        })),
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim() || undefined,
        service_type: serviceType,
      };

      const result = await submitBulkCertificateRequest(requestData);
      setSubmissionResult(result);
      setSubmitted(true);

      if (result.success > 0) {
        toast.success(`Successfully submitted ${result.success} request(s)`);
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} request(s) failed`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit bulk request");
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && submissionResult) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Bulk Certificate Confirmation/Verification Request</h1>
          <p className="text-muted-foreground">Submit multiple confirmation or verification requests at once</p>
        </div>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Bulk Request Submitted</CardTitle>
            <CardDescription className="mt-2">
              {submissionResult.success} request(s) submitted successfully
              {submissionResult.failed > 0 && `, ${submissionResult.failed} failed`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {submissionResult.bulk_request_number && (
              <div className="space-y-2">
                <h3 className="font-semibold">Bulk Request Number:</h3>
                <div className="rounded-lg border p-4">
                  <span className="font-mono text-lg font-bold">{submissionResult.bulk_request_number}</span>
                </div>
                {submissionResult.total_amount !== undefined && (
                  <div className="text-sm text-muted-foreground">
                    Total Amount: GHS {submissionResult.total_amount.toFixed(2)}
                  </div>
                )}
                {submissionResult.invoice_number && (
                  <div className="text-sm text-muted-foreground">
                    Invoice Number: {submissionResult.invoice_number}
                  </div>
                )}
              </div>
            )}
            {(submissionResult.individual_requests && submissionResult.individual_requests.length > 0) ||
             (submissionResult.requests && submissionResult.requests.length > 0) ? (
              <div className="space-y-2">
                <h3 className="font-semibold">Individual Request Numbers:</h3>
                <div className="rounded-lg border p-4 max-h-60 overflow-y-auto">
                  {(submissionResult.individual_requests || submissionResult.requests || []).map((req: any, idx: number) => (
                    <div key={idx} className="py-1">
                      <span className="font-mono text-sm">{req.request_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {submissionResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-2">Errors:</div>
                  <ul className="list-disc list-inside space-y-1">
                    {submissionResult.errors.map((err, idx) => (
                      <li key={idx} className="text-sm">
                        Request {err.index + 1}: {err.error}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2 flex-wrap">
              {submissionResult.bulk_request_number && (
                <Button
                  onClick={() => {
                    router.push(`/certificate-confirmation/requests?request=${submissionResult.bulk_request_number}`);
                  }}
                  variant="default"
                >
                  View Request Status
                </Button>
              )}
              <Button
                onClick={() => {
                  setSubmitted(false);
                  setSubmissionResult(null);
                  setRequests([{
                    candidate_name: "",
                    candidate_index_number: "",
                    completion_year: new Date().getFullYear(),
                    school_name: "",
                    programme_name: "",
                    request_details: "",
                    certificate_file: undefined,
                    candidate_photo_file: undefined,
                  }]);
                }}
                variant="outline"
              >
                Submit Another Request
              </Button>
              <Button
                onClick={() => router.push("/certificate-confirmation")}
                variant="outline"
              >
                Back to Single Request
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bulk Certificate Confirmation/Verification Request</h1>
          <p className="text-muted-foreground">
            Submit multiple confirmation or verification requests at once
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push("/certificate-confirmation")}
        >
          Single Request
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Request Form</CardTitle>
          <CardDescription>
            Enter multiple certificate confirmation/verification requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Request Type and Contact Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Request Type *</Label>
              <Select value={requestType} onValueChange={(value) => setRequestType(value as RequestType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmation">Confirmation</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type</Label>
              <Select value={serviceType} onValueChange={(value) => setServiceType(value as "standard" | "express")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="express">Express (50% surcharge)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="contactPhone">Contact Phone *</Label>
              <Input
                id="contactPhone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>
            <div>
              <Label htmlFor="contactEmail">Contact Email (Optional)</Label>
              <Input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Enter your email address"
              />
            </div>
          </div>

          {/* CSV Upload */}
          <div className="border rounded-lg p-4">
            <Label className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="h-4 w-4" />
              Upload CSV File (Optional)
            </Label>
            <p className="text-sm text-muted-foreground mb-2">
              CSV format: candidate_name, candidate_index_number, completion_year, school_name, programme_name, request_details (optional)
            </p>
            <Input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="cursor-pointer"
            />
          </div>

          {/* Requests List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Requests ({requests.length})</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRequest}>
                <Plus className="h-4 w-4 mr-2" />
                Add Request
              </Button>
            </div>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {requests.map((req, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-medium">Request {index + 1}</span>
                    {requests.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRequest(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Candidate Name *</Label>
                      <Input
                        value={req.candidate_name || ""}
                        onChange={(e) => updateRequest(index, "candidate_name", e.target.value)}
                        placeholder="Candidate name"
                      />
                    </div>
                    <div>
                      <Label>Candidate Index Number *</Label>
                      <Input
                        value={req.candidate_index_number || req.index_number || ""}
                        onChange={(e) => updateRequest(index, "candidate_index_number", e.target.value)}
                        placeholder="Index number"
                      />
                    </div>
                    <div>
                      <Label>Completion Year *</Label>
                      <Input
                        type="number"
                        value={req.completion_year || req.exam_year || new Date().getFullYear()}
                        onChange={(e) => updateRequest(index, "completion_year", parseInt(e.target.value) || new Date().getFullYear())}
                        placeholder="Year"
                        min="2000"
                        max={new Date().getFullYear()}
                      />
                    </div>
                    <div>
                      <Label>School Name *</Label>
                      <Input
                        value={req.school_name || ""}
                        onChange={(e) => updateRequest(index, "school_name", e.target.value)}
                        placeholder="School name"
                      />
                    </div>
                    <div>
                      <Label>Programme Name *</Label>
                      <Input
                        value={req.programme_name || ""}
                        onChange={(e) => updateRequest(index, "programme_name", e.target.value)}
                        placeholder="Programme name"
                      />
                    </div>
                    <div>
                      <Label>Request Details (Optional)</Label>
                      <textarea
                        className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={req.request_details || ""}
                        onChange={(e) => updateRequest(index, "request_details", e.target.value)}
                        placeholder="Additional details"
                      />
                    </div>
                    <div>
                      <Label>Certificate Scan (Optional)</Label>
                      <Input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          updateRequest(index, "certificate_file", file || undefined);
                        }}
                        className="cursor-pointer"
                      />
                      {req.certificate_file && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Selected: {req.certificate_file.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Candidate Photo (Optional)</Label>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          updateRequest(index, "candidate_photo_file", file || undefined);
                        }}
                        className="cursor-pointer"
                      />
                      {req.candidate_photo_file && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Selected: {req.candidate_photo_file.name}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => router.push("/certificate-confirmation")}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting..." : `Submit ${requests.length} Request(s)`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
