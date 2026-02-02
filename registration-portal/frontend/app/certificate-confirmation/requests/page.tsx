"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  listMyCertificateRequests,
  getCertificateRequestStatus,
  initializePayment,
  getBulkCertificateConfirmation,
  downloadBulkConfirmationPDFPublic,
  downloadConfirmationResponsePublic,
  previewConfirmationResponsePublic,
  submitBulkCertificateRequest,
  type CertificateRequestResponse,
  type CertificateRequestListResponse,
  type BulkCertificateConfirmationResponse,
  type BulkCertificateRequestCreate,
  type BulkCertificateRequestItem,
} from "@/lib/api";
import { toast } from "sonner";
import { Search, Eye, FileText, CheckCircle2, XCircle, Clock, Loader2, Plus, X, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const STATUS_OPTIONS = [
  { value: "pending_payment", label: "Pending Payment" },
  { value: "paid", label: "Paid" },
  { value: "in_process", label: "In Process" },
  { value: "ready_for_dispatch", label: "Ready for Dispatch" },
  { value: "dispatched", label: "Dispatched" },
  { value: "received", label: "Received" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const NEW_REQUEST_STEPS = [
  { number: 1, title: "Contact Information", description: "Enter your contact details" },
  { number: 2, title: "Add Requests", description: "Add one or more certificate requests" },
  { number: 3, title: "Review & Submit", description: "Review and submit your requests" },
];

export default function MyCertificateRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState("my-requests");

  // My Requests state
  const [requests, setRequests] = useState<(CertificateRequestResponse | BulkCertificateConfirmationResponse)[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<CertificateRequestResponse | BulkCertificateConfirmationResponse | null>(null);
  const [selectedBulkConfirmation, setSelectedBulkConfirmation] = useState<BulkCertificateConfirmationResponse | null>(null);
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // New Request state
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [requestType, setRequestType] = useState<"confirmation" | "verification">("confirmation");
  const [serviceType, setServiceType] = useState<"standard" | "express">("standard");
  const [newRequests, setNewRequests] = useState<BulkCertificateRequestItem[]>([
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

  useEffect(() => {
    const requestParam = searchParams.get("request") || searchParams.get("request_number");
    if (requestParam) {
      loadRequestByNumber(requestParam);
    } else {
      loadRequests();
    }
  }, [page, requestTypeFilter, statusFilter, searchParams]);

  // Handle return from Paystack: show success, refetch list, clear payment=success from URL
  useEffect(() => {
    const paymentSuccess = searchParams.get("payment") === "success";
    const requestNumber = searchParams.get("request_number");
    if (paymentSuccess) {
      toast.success("Payment successful. Your request has been paid.");
      loadRequests();
      if (requestNumber) {
        router.replace(`/certificate-confirmation/requests?request_number=${requestNumber}`);
      } else {
        router.replace("/certificate-confirmation/requests");
      }
    }
  }, [searchParams, router]);

  const loadRequestByNumber = async (requestNumber: string) => {
    try {
      // Check if it's a bulk request (starts with BULK-)
      if (requestNumber.toUpperCase().startsWith("BULK-")) {
        // For bulk requests, we need to fetch from the admin endpoint or create a public endpoint
        // For now, try to get it as a regular request first, then handle bulk separately
        try {
          const data = await getCertificateRequestStatus(requestNumber);
          setSelectedRequest(data);
          setSearchQuery(requestNumber);
        } catch {
          // If not found, try to find it in the list
          const data = await listMyCertificateRequests(undefined, undefined, 1, 100);
          const found = data.items.find((item: any) =>
            (item.request_number === requestNumber || item.bulk_request_number === requestNumber)
          ) as any;
          if (found) {
            if (found._type === "bulk_confirmation" || found.bulk_request_number) {
              setSelectedBulkConfirmation(found as BulkCertificateConfirmationResponse);
              setSelectedRequest(found);
            } else {
              setSelectedRequest(found as CertificateRequestResponse);
            }
            setSearchQuery(requestNumber);
          } else {
            toast.error("Request not found");
          }
        }
      } else {
        const data = await getCertificateRequestStatus(requestNumber);
        setSelectedRequest(data);
        setSearchQuery(requestNumber);
      }
    } catch (error) {
      toast.error("Request not found");
    }
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data: CertificateRequestListResponse = await listMyCertificateRequests(
        requestTypeFilter as "confirmation" | "verification" | undefined,
        statusFilter,
        page,
        pageSize
      );
      setRequests(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to load requests";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchQuery.trim()) {
      loadRequestByNumber(searchQuery.trim());
    } else {
      loadRequests();
    }
  };

  const handlePay = async (requestNumber: string) => {
    try {
      const paymentResponse = await initializePayment(requestNumber);
      window.location.href = paymentResponse.authorization_url;
    } catch (error: any) {
      toast.error(error.message || "Failed to initialize payment");
      console.error("Payment initialization error:", error);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending_payment":
        return "secondary";
      case "paid":
        return "default";
      case "in_process":
        return "default";
      case "ready_for_dispatch":
        return "default";
      case "dispatched":
        return "default";
      case "received":
        return "default";
      case "completed":
        return "default";
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  // New Request form functions
  const addRequest = () => {
    setNewRequests([
      ...newRequests,
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
    if (newRequests.length > 1) {
      setNewRequests(newRequests.filter((_, i) => i !== index));
    }
  };

  const updateRequest = (index: number, field: keyof BulkCertificateRequestItem, value: any) => {
    const updated = [...newRequests];
    updated[index] = { ...updated[index], [field]: value };
    setNewRequests(updated);
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
        setNewRequests(parsed);
        toast.success(`Loaded ${parsed.length} requests from CSV`);
      } else {
        toast.error("No valid requests found in CSV file");
      }
    };
    reader.readAsText(file);
  };

  const validateContactStep = (): boolean => {
    if (!contactPhone.trim()) {
      toast.error("Please enter your contact phone number");
      return false;
    }
    if (contactEmail && !contactEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return false;
    }
    return true;
  };

  const validateRequestsStep = (): boolean => {
    if (newRequests.length === 0) {
      toast.error("Please add at least one request");
      return false;
    }

    for (let i = 0; i < newRequests.length; i++) {
      const req = newRequests[i];
      if (!req.candidate_name?.trim()) {
        toast.error(`Request ${i + 1}: Candidate name is required`);
        return false;
      }
      if (!req.candidate_index_number?.trim()) {
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

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (validateContactStep()) {
        setCurrentStep(2);
      }
    } else if (currentStep === 2) {
      if (validateRequestsStep()) {
        setCurrentStep(3);
      }
    }
  };

  const handlePreviousStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleNewRequestSubmit = async () => {
    if (!validateContactStep() || !validateRequestsStep()) {
      return;
    }

    setSubmitting(true);
    try {
      const requestData: BulkCertificateRequestCreate = {
        request_type: requestType,
        requests: newRequests.map((r) => ({
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

      // Ensure we have a valid request number
      if (!result || result.success === 0) {
        console.error("Submission failed or no successful requests:", result);
        toast.error(result?.failed > 0
          ? `All requests failed. Errors: ${result.errors?.map(e => e.error).join(", ") || "Unknown error"}`
          : "Failed to submit request. Please check the console for details.");
        return;
      }

      // The bulk_request_number should always be present in a successful response
      const requestNumber = result.bulk_request_number;

      if (!requestNumber) {
        console.error("No bulk_request_number in response:", result);
        toast.error("Request submitted but no request number received. Please contact support.");
        return;
      }

      toast.success(`Successfully submitted ${result.success} request(s)! Redirecting to payment...`);

      // Initialize payment
      try {
        const paymentResponse = await initializePayment(requestNumber);
        // Redirect to Paystack payment page
        window.location.href = paymentResponse.authorization_url;
      } catch (error: any) {
        toast.error(error?.message || "Failed to initialize payment. Please try again.");
        console.error("Payment initialization error:", error);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request");
      console.error("Submit error:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (selectedRequest) {
    const isBulk = "_type" in selectedRequest && selectedRequest._type === "bulk_confirmation" || "bulk_request_number" in selectedRequest;
    const requestNumber = isBulk && "bulk_request_number" in selectedRequest
      ? (selectedRequest as BulkCertificateConfirmationResponse).bulk_request_number
      : (selectedRequest as CertificateRequestResponse).request_number;
    const bulkRequest = isBulk ? selectedRequest as BulkCertificateConfirmationResponse : null;
    const regularRequest = !isBulk ? selectedRequest as CertificateRequestResponse : null;

    // Render bulk confirmation details
    if (isBulk && bulkRequest) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Bulk Confirmation Request Details</h1>
              <p className="text-muted-foreground">View details for bulk request {bulkRequest.bulk_request_number}</p>
            </div>
            <Button variant="outline" onClick={() => {
              setSelectedRequest(null);
              setSelectedBulkConfirmation(null);
              setSearchQuery("");
              setActiveTab("my-requests");
              loadRequests();
            }}>
              Back to My Requests
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(bulkRequest.status)}
                    Bulk Request {bulkRequest.bulk_request_number}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {bulkRequest.request_type === "confirmation" ? "Confirmation" : "Verification"} Request (Bulk)
                  </CardDescription>
                </div>
                <Badge variant={getStatusBadgeVariant(bulkRequest.status)}>
                  {bulkRequest.status.replace(/_/g, " ").toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Request Type</p>
                  <p className="capitalize">{bulkRequest.request_type} (Bulk)</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Requests</p>
                  <p>{bulkRequest.certificate_details?.length || bulkRequest.individual_requests?.length || 0}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Amount</p>
                  <p className="font-semibold">
                    GHS{" "}
                    {bulkRequest.total_amount
                      ? Number(bulkRequest.total_amount).toFixed(2)
                      : "0.00"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Service Type</p>
                  <p className="capitalize">{bulkRequest.service_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contact Phone</p>
                  <p>{bulkRequest.contact_phone}</p>
                </div>
                {bulkRequest.contact_email && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Contact Email</p>
                    <p>{bulkRequest.contact_email}</p>
                  </div>
                )}
                {bulkRequest.invoice?.invoice_number && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Invoice Number</p>
                    <p>{bulkRequest.invoice.invoice_number}</p>
                  </div>
                )}
                {(bulkRequest.has_response || bulkRequest.response_file_path) && bulkRequest.response_signed && !bulkRequest.response_revoked && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const url = await previewConfirmationResponsePublic(bulkRequest.bulk_request_number);
                            window.open(url, "_blank");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to preview response");
                          }
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview Response
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const blob = await downloadConfirmationResponsePublic(bulkRequest.bulk_request_number);
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = bulkRequest.response_file_name || `response_${bulkRequest.bulk_request_number}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            document.body.removeChild(a);
                            toast.success("Response downloaded successfully");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to download response");
                          }
                        }}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Download Response
                      </Button>
                    </div>
                  </div>
                )}
                {(bulkRequest.has_response || bulkRequest.response_file_path) && !bulkRequest.response_signed && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                    <p className="text-sm text-muted-foreground">Response is pending signature</p>
                  </div>
                )}
                {(bulkRequest.has_response || bulkRequest.response_file_path) && bulkRequest.response_signed && bulkRequest.response_revoked && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                    <p className="text-sm text-red-600">Response has been revoked</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p>{new Date(bulkRequest.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Individual Requests Table */}
              {(bulkRequest.certificate_details || bulkRequest.individual_requests) && (bulkRequest.certificate_details?.length || bulkRequest.individual_requests?.length || 0) > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Individual Requests ({bulkRequest.certificate_details?.length || bulkRequest.individual_requests?.length || 0})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Request Number</TableHead>
                        <TableHead>Candidate Name</TableHead>
                        <TableHead>Index Number</TableHead>
                        <TableHead>School Name</TableHead>
                        <TableHead>Programme</TableHead>
                        <TableHead>Completion Year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bulkRequest.certificate_details || bulkRequest.individual_requests || []).map((req: any, index: number) => (
                        <TableRow key={req.id || index}>
                          <TableCell className="font-mono text-sm">{req.request_number || `#${index + 1}`}</TableCell>
                          <TableCell>{req.candidate_name}</TableCell>
                          <TableCell>{req.candidate_index_number || "N/A"}</TableCell>
                          <TableCell>{req.school_name}</TableCell>
                          <TableCell>{req.programme_name}</TableCell>
                          <TableCell>{req.completion_year}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {bulkRequest.status === "pending_payment" && (
                <Alert>
                  <AlertDescription className="flex items-center justify-between">
                    <span>Payment is required to process this bulk request</span>
                    <Button onClick={() => handlePay(bulkRequest.bulk_request_number)}>
                      Pay Now
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    // Render individual request details (existing code)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Request Details</h1>
            <p className="text-muted-foreground">View details for request {regularRequest?.request_number}</p>
          </div>
          <Button variant="outline" onClick={() => {
            setSelectedRequest(null);
            setSearchQuery("");
            setActiveTab("my-requests");
            loadRequests();
          }}>
            Back to My Requests
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {getStatusIcon(selectedRequest.status)}
                  Request {(selectedRequest as any).request_number ?? (selectedRequest as any).bulk_request_number}
                </CardTitle>
                <CardDescription className="mt-2">
                  {selectedRequest.request_type === "confirmation" ? "Confirmation" : "Verification"} Request
                </CardDescription>
              </div>
              <Badge variant={getStatusBadgeVariant(selectedRequest.status)}>
                {selectedRequest.status.replace(/_/g, " ").toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Request Type</p>
                <p className="capitalize">{regularRequest?.request_type}</p>
              </div>
              {regularRequest?.candidate_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Candidate Name</p>
                  <p>{regularRequest.candidate_name}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Index Number</p>
                <p>{regularRequest?.candidate_index_number || regularRequest?.index_number}</p>
              </div>
              {regularRequest?.completion_year && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Completion Year</p>
                  <p>{regularRequest.completion_year}</p>
                </div>
              )}
              {!regularRequest?.completion_year && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Examination Year</p>
                  <p>{regularRequest?.exam_year}</p>
                </div>
              )}
              {regularRequest?.school_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">School Name</p>
                  <p>{regularRequest.school_name}</p>
                </div>
              )}
              {regularRequest?.programme_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Programme Name</p>
                  <p>{regularRequest.programme_name}</p>
                </div>
              )}
              {regularRequest?.examination_center_name && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Examination Center</p>
                  <p>{regularRequest.examination_center_name}</p>
                </div>
              )}
              {regularRequest?.national_id_number && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">National ID Number</p>
                  <p>{regularRequest.national_id_number}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Contact Phone</p>
                <p>{regularRequest?.contact_phone}</p>
              </div>
              {regularRequest?.contact_email && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contact Email</p>
                  <p>{regularRequest.contact_email}</p>
                </div>
              )}
              {regularRequest?.request_details && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Request Details</p>
                  <p className="whitespace-pre-wrap">{regularRequest.request_details}</p>
                </div>
              )}
              {regularRequest?.certificate_file_path && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Certificate Scan</p>
                  <p className="text-sm text-blue-600">File uploaded</p>
                </div>
              )}
              {regularRequest?.candidate_photograph_file_path && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Candidate Photo</p>
                  <p className="text-sm text-blue-600">File uploaded</p>
                </div>
              )}
              {regularRequest?.tracking_number && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tracking Number</p>
                  <p>{regularRequest.tracking_number}</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created At</p>
                <p>{new Date(regularRequest?.created_at || "").toLocaleString()}</p>
              </div>
              {((regularRequest as any)?.has_response || (regularRequest as any)?.response_file_path) && (regularRequest as any)?.response_signed && !(regularRequest as any)?.response_revoked && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const url = await previewConfirmationResponsePublic(regularRequest?.request_number || "");
                          window.open(url, "_blank");
                        } catch (error: any) {
                          toast.error(error.message || "Failed to preview response");
                        }
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Preview Response
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const blob = await downloadConfirmationResponsePublic(regularRequest?.request_number || "");
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = (regularRequest as any).response_file_name || `response_${regularRequest?.request_number}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          toast.success("Response downloaded successfully");
                        } catch (error: any) {
                          toast.error(error.message || "Failed to download response");
                        }
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Download Response
                    </Button>
                  </div>
                </div>
              )}
              {((regularRequest as any)?.has_response || (regularRequest as any)?.response_file_path) && !(regularRequest as any)?.response_signed && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                  <p className="text-sm text-muted-foreground">Response is pending signature</p>
                </div>
              )}
              {((regularRequest as any)?.has_response || (regularRequest as any)?.response_file_path) && (regularRequest as any)?.response_signed && (regularRequest as any)?.response_revoked && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">Response Document</p>
                  <p className="text-sm text-red-600">Response has been revoked</p>
                </div>
              )}
            </div>

            {regularRequest?.status === "pending_payment" && (
              <Alert>
                <AlertDescription className="flex items-center justify-between">
                  <span>Payment is required to process this request</span>
                  <Button onClick={() => handlePay(regularRequest.request_number)}>
                    Pay Now
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render New Request tab content
  const renderNewRequestTab = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Certificate Confirmation Request</h1>
        <p className="text-muted-foreground">Submit a new confirmation or verification request</p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {NEW_REQUEST_STEPS.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                    currentStep >= step.number
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground text-muted-foreground"
                  }`}
                >
                  {currentStep > step.number ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span>{step.number}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {index < NEW_REQUEST_STEPS.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    currentStep > step.number ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Step {currentStep}: {NEW_REQUEST_STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{NEW_REQUEST_STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Contact Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Request Type *</Label>
                  <Select value={requestType} onValueChange={(value) => setRequestType(value as "confirmation" | "verification")}>
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
                  <Label>Service Type *</Label>
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
            </div>
          )}

          {/* Step 2: Add Requests */}
          {currentStep === 2 && (
            <div className="space-y-4">
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Requests ({newRequests.length})</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addRequest}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Request
                  </Button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {newRequests.map((req, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <span className="font-medium">Request {index + 1}</span>
                        {newRequests.length > 1 && (
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
            </div>
          )}

          {/* Step 3: Review & Submit */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Request Type:</span>
                  <span className="font-medium capitalize">{requestType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service Type:</span>
                  <span className="font-medium capitalize">{serviceType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Contact Phone:</span>
                  <span className="font-medium">{contactPhone}</span>
                </div>
                {contactEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Contact Email:</span>
                    <span className="font-medium">{contactEmail}</span>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold mb-3">Requests Summary ({newRequests.length})</h3>
                {newRequests.map((req, index) => (
                  <div key={index} className="border rounded p-3 space-y-2">
                    <div className="font-medium">Request {index + 1}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Candidate Name:</span>
                        <span className="ml-2 font-medium">{req.candidate_name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Index Number:</span>
                        <span className="ml-2 font-medium">{req.candidate_index_number || req.index_number}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Completion Year:</span>
                        <span className="ml-2 font-medium">{req.completion_year || req.exam_year}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">School:</span>
                        <span className="ml-2 font-medium">{req.school_name}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Programme:</span>
                        <span className="ml-2 font-medium">{req.programme_name}</span>
                      </div>
                      {(req.certificate_file || req.candidate_photo_file) && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Attachments:</span>
                          <span className="ml-2 text-xs">
                            {req.certificate_file && "Certificate "}
                            {req.candidate_photo_file && "Photo"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              disabled={currentStep === 1}
            >
              Previous
            </Button>
            {currentStep < NEW_REQUEST_STEPS.length ? (
              <Button onClick={handleNextStep}>Next</Button>
            ) : (
              <Button onClick={handleNewRequestSubmit} disabled={submitting}>
                {submitting ? "Submitting..." : `Submit ${newRequests.length} Request(s)`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Certificate Confirmation Requests</h1>
        <p className="text-muted-foreground">View and manage your confirmation and verification requests</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="new-request">New Request</TabsTrigger>
          <TabsTrigger value="my-requests">My Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="new-request">
          {renderNewRequestTab()}
        </TabsContent>

        <TabsContent value="my-requests">
          <div className="space-y-6">

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Search by request number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                />
                <Button onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Select value={requestTypeFilter || "all"} onValueChange={(value) => {
                setRequestTypeFilter(value === "all" ? undefined : value);
                setPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Request Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="confirmation">Confirmation</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={statusFilter || "all"} onValueChange={(value) => {
                setStatusFilter(value === "all" ? undefined : value);
                setPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Requests ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No requests found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Index Number</TableHead>
                    <TableHead>Exam Year</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => {
                    const isBulk = "_type" in request && request._type === "bulk_confirmation" || "bulk_request_number" in request;
                    const requestNumber = isBulk && "bulk_request_number" in request
                      ? (request as BulkCertificateConfirmationResponse).bulk_request_number
                      : (request as CertificateRequestResponse).request_number;
                    const bulkRequest = isBulk ? request as BulkCertificateConfirmationResponse : null;
                    const regularRequest = !isBulk ? request as CertificateRequestResponse : null;

                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-mono text-sm">
                          {requestNumber}
                          {isBulk && bulkRequest && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Bulk ({bulkRequest.certificate_details?.length || bulkRequest.individual_requests?.length || 0})
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">
                          {request.request_type}
                          {isBulk && " (Bulk)"}
                        </TableCell>
                        <TableCell>
                          {isBulk ? (
                            <span className="text-sm text-muted-foreground">
                              {bulkRequest?.certificate_details?.length || bulkRequest?.individual_requests?.length || 0} requests
                            </span>
                          ) : (
                            regularRequest?.index_number || regularRequest?.candidate_index_number || "N/A"
                          )}
                        </TableCell>
                        <TableCell>
                          {isBulk ? (
                            <span className="text-sm text-muted-foreground">-</span>
                          ) : (
                            regularRequest?.exam_year || regularRequest?.completion_year || "N/A"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(request.status)}>
                            {request.status.replace(/_/g, " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(request.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (isBulk) {
                                  setSelectedBulkConfirmation(bulkRequest!);
                                }
                                setSelectedRequest(request);
                                setSearchQuery(requestNumber);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {request.status === "pending_payment" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePay(requestNumber)}
                              >
                                Pay
                              </Button>
                            )}
                            {((isBulk && (bulkRequest?.has_response || bulkRequest?.response_file_path) && bulkRequest?.response_signed && !bulkRequest?.response_revoked) ||
                              (!isBulk && ((request as any).has_response || (request as any).response_file_path) && (request as any).response_signed && !(request as any).response_revoked)) && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const url = await previewConfirmationResponsePublic(requestNumber);
                                      window.open(url, "_blank");
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to preview response");
                                    }
                                  }}
                                  title="Preview Response"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const blob = await downloadConfirmationResponsePublic(requestNumber);
                                      const url = window.URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      const responseFileName = isBulk
                                        ? bulkRequest?.response_file_name
                                        : (request as any).response_file_name;
                                      a.download = responseFileName || `response_${requestNumber}.pdf`;
                                      document.body.appendChild(a);
                                      a.click();
                                      window.URL.revokeObjectURL(url);
                                      document.body.removeChild(a);
                                      toast.success("Response downloaded successfully");
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to download response");
                                    }
                                  }}
                                  title="Download Response"
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
