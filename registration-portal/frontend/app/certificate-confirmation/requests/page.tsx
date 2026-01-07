"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  listMyCertificateRequests,
  getCertificateRequestStatus,
  initializePayment,
  getBulkCertificateConfirmation,
  downloadBulkConfirmationPDFPublic,
  type CertificateRequestResponse,
  type CertificateRequestListResponse,
  type BulkCertificateConfirmationResponse,
} from "@/lib/api";
import { toast } from "sonner";
import { Search, Eye, FileText, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
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

export default function MyCertificateRequestsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    const requestParam = searchParams.get("request");
    if (requestParam) {
      loadRequestByNumber(requestParam);
    } else {
      loadRequests();
    }
  }, [page, requestTypeFilter, statusFilter, searchParams]);

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
                  <p>{bulkRequest.individual_requests?.length || 0}</p>
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
                {bulkRequest.pdf_file_path && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Certificate Confirmation PDF</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const blob = await downloadBulkConfirmationPDFPublic(bulkRequest.bulk_request_number);
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `bulk_confirmation_${bulkRequest.bulk_request_number}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                          toast.success("PDF downloaded successfully");
                        } catch (error: any) {
                          toast.error(error.message || "Failed to download PDF");
                        }
                      }}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Created At</p>
                  <p>{new Date(bulkRequest.created_at).toLocaleString()}</p>
                </div>
              </div>

              {/* Individual Requests Table */}
              {bulkRequest.individual_requests && bulkRequest.individual_requests.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Individual Requests ({bulkRequest.individual_requests.length})</h3>
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
                      {bulkRequest.individual_requests.map((req: any) => (
                        <TableRow key={req.id}>
                          <TableCell className="font-mono text-sm">{req.request_number}</TableCell>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Certificate Requests</h1>
        <p className="text-muted-foreground">View and manage your confirmation and verification requests</p>
      </div>

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
                              Bulk ({bulkRequest.individual_requests?.length || 0})
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
                              {bulkRequest?.individual_requests?.length || 0} requests
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
                            {isBulk && bulkRequest?.pdf_file_path && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const blob = await downloadBulkConfirmationPDFPublic(requestNumber);
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `bulk_confirmation_${requestNumber}.pdf`;
                                    document.body.appendChild(a);
                                    a.click();
                                    window.URL.revokeObjectURL(url);
                                    document.body.removeChild(a);
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to download PDF");
                                  }
                                }}
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
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
  );
}
