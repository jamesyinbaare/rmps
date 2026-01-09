"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  listCertificateRequests,
  getCertificateRequestById,
  beginCertificateRequestProcess,
  beginCertificateConfirmationProcess,
  sendCertificateRequestToDispatch,
  sendCertificateConfirmationToDispatch,
  dispatchRequest,
  updateCertificateRequest,
  getCertificateRequestStatistics,
  downloadCertificateRequestPDF,
  assignTicket,
  unassignTicket,
  addTicketComment,
  markRequestReceived,
  completeRequest,
  cancelRequest,
  resendPaymentLink,
  getCurrentUser,
  getCertificateConfirmation,
  getBulkCertificateConfirmation,
  generateBulkConfirmationPDF,
  uploadBulkConfirmationPDF,
  downloadBulkConfirmationPDF,
  changeTicketStatusManual,
  downloadConfirmationResponse,
  downloadConfirmationRequestPDF,
  signConfirmationResponse,
  revokeConfirmationResponse,
  unrevokeConfirmationResponse,
  reconcilePayment,
  type CertificateRequestResponse,
  type CertificateRequestListResponse,
  type CertificateConfirmationRequestResponse,
} from "@/lib/api";
import { toast } from "sonner";
import { DataTable } from "@/components/certificate-requests/DataTable";
import { TicketActivityFeed } from "@/components/certificate-requests/TicketActivityFeed";
import { TicketAssignmentSelector } from "@/components/certificate-requests/TicketAssignmentSelector";
import { PrioritySelector, PriorityBadge } from "@/components/certificate-requests/PrioritySelector";
import { WorkflowProgress } from "@/components/certificate-requests/WorkflowProgress";
import { BulkActions } from "@/components/certificate-requests/BulkActions";
import { QuickPreview } from "@/components/certificate-requests/QuickPreview";
import { useKeyboardShortcuts } from "@/components/certificate-requests/KeyboardShortcuts";
import { ResponseDialog } from "@/components/certificate-requests/ResponseDialog";
import { PaymentReconciliationDialog } from "@/components/certificate-requests/PaymentReconciliationDialog";
import {
  FileText,
  Search,
  Eye,
  Play,
  Send,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Download,
  MoreVertical,
  Filter,
  CheckSquare,
  Square,
  MessageSquare,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Truck,
  Mail,
  Calendar,
  User,
  Hash,
  Upload,
  PenTool,
  RefreshCw,
} from "lucide-react";

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

const REQUEST_TYPE_OPTIONS = [
  { value: "certificate", label: "Certificate" },
  { value: "attestation", label: "Attestation" },
  { value: "confirmation", label: "Confirmation" },
  { value: "verification", label: "Verification" },
];

interface Statistics {
  total: number;
  pending_payment: number;
  completed: number;
}

export default function CertificateRequestsPage() {
  const [requests, setRequests] = useState<(CertificateRequestResponse | CertificateConfirmationRequestResponse)[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CertificateRequestResponse | CertificateConfirmationRequestResponse | null>(null);
  const [selectedConfirmationRequest, setSelectedConfirmationRequest] = useState<CertificateConfirmationRequestResponse | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [reconciliationDialogOpen, setReconciliationDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<CertificateRequestResponse | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [requestTypeFilters, setRequestTypeFilters] = useState<Set<string>>(new Set());
  const [assignedToFilter, setAssignedToFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string | undefined>(undefined);
  const [myTicketsOnly, setMyTicketsOnly] = useState(false);
  const [currentUser, setCurrentUser] = useState<Awaited<ReturnType<typeof getCurrentUser>> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Statistics period
  const [statisticsPeriod, setStatisticsPeriod] = useState<"last_week" | "last_month" | "last_year" | "custom" | undefined>(undefined);
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [viewTab, setViewTab] = useState<"active" | "completed" | "cancelled" | "all" | "my_tickets">("active");
  const [changeStatusDialogOpen, setChangeStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<"in_process" | "ready_for_dispatch" | "dispatched" | "received" | "completed">("ready_for_dispatch");
  const [changeReason, setChangeReason] = useState("");
  const [responseDialogOpen, setResponseDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revocationReason, setRevocationReason] = useState("");
  const [revokeConfirmationId, setRevokeConfirmationId] = useState<number | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const requestTypeFilter = requestTypeFilters.size === 1 ? Array.from(requestTypeFilters)[0] : requestTypeFilters.size > 1 ? "" : undefined;

      // Determine assigned_to filter
      // Note: "unassigned" and "my_tickets" are handled client-side, not sent to API
      // The backend only accepts valid UUIDs for assigned_to
      let assignedTo: string | undefined;
      if (myTicketsOnly && currentUser) {
        // "my_tickets" is handled client-side, don't send to API
        assignedTo = undefined;
      } else if (assignedToFilter && assignedToFilter !== "unassigned") {
        // Only send valid UUIDs to the API
        assignedTo = assignedToFilter;
      } else {
        assignedTo = undefined;
      }

      // Always include bulk confirmations and individual confirmation requests to show both
      // CertificateRequest and CertificateConfirmationRequest models in a unified list
      // The backend will return both types when include_bulk_confirmations=true
      const includeBulk = true;

      const data: CertificateRequestListResponse = await listCertificateRequests(
        undefined,
        undefined,
        requestTypeFilter,
        assignedTo,
        priorityFilter,
        serviceTypeFilter,
        viewTab,
        includeBulk,  // Include bulk confirmations
        page,
        pageSize
      );

      setRequests(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (error) {
      toast.error("Failed to load certificate requests");
      console.error("Error loading requests:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRequestType = (req: any): "certificate" | "confirmation" => {
    if (!req) return "certificate";
    if ((req as any)._type === "bulk_confirmation" || (req as any)._type === "certificate_confirmation") return "confirmation";
    if ((req as any).request_type === "confirmation" || (req as any).request_type === "verification") return "confirmation";
    return "certificate";
  };

  const getAllowedManualStatuses = (status: string): Array<"in_process" | "ready_for_dispatch" | "dispatched" | "received" | "completed"> => {
    switch (status) {
      case "in_process":
        return ["ready_for_dispatch"];
      case "ready_for_dispatch":
        return ["in_process", "dispatched"];
      case "dispatched":
        return ["received"];
      case "received":
        return ["dispatched", "completed"];
      default:
        return [];
    }
  };

  const loadStatistics = async () => {
    try {
      const options: {
        period?: "last_week" | "last_month" | "last_year" | "custom";
        startDate?: string;
        endDate?: string;
      } = {};

      if (statisticsPeriod) {
        options.period = statisticsPeriod;
        if (statisticsPeriod === "custom") {
          if (customStartDate) options.startDate = customStartDate;
          if (customEndDate) options.endDate = customEndDate;
        }
      }

      const stats = await getCertificateRequestStatistics(options);
      setStatistics(stats);
    } catch (error) {
      console.error("Error loading statistics:", error);
    }
  };

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load current user:", error);
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    loadRequests();
    loadStatistics();
  }, [page, requestTypeFilters, assignedToFilter, priorityFilter, serviceTypeFilter, myTicketsOnly, viewTab]);

  // (deduped) getRequestType defined earlier

  // Helper to check if confirmation request is bulk (multiple certificate_details)
  const isBulkConfirmation = (request: CertificateConfirmationRequestResponse): boolean => {
    if (!request || !request.certificate_details) return false;
    return Array.isArray(request.certificate_details) && request.certificate_details.length > 1;
  };

  // Helper to check if a request is a confirmation request (for type checking)
  const isConfirmationRequest = (request: any): boolean => {
    return getRequestType(request) === "confirmation";
  };

  const handleViewDetails = async (requestId: number, requestObject?: CertificateRequestResponse | CertificateConfirmationRequestResponse) => {
    try {
      // Use the passed request object if available, otherwise find it in the list
      const requestInList = requestObject || requests.find(r => r.id === requestId);

      if (!requestInList) {
        toast.error("Request not found in current list");
        console.error(`Request with ID ${requestId} not found in requests list`);
        return;
      }

      // Determine type from request object - this is the most reliable method
      const requestType = getRequestType(requestInList);

      // Verify the request ID matches what we're about to fetch
      if (requestInList.id !== requestId) {
        console.warn(`Request ID mismatch: expected ${requestId}, got ${requestInList.id}. Using request from list.`);
        // Use the ID from the request object instead
        const actualId = requestInList.id;

        if (requestType === "confirmation") {
          const confirmationRequest = await getCertificateConfirmation(actualId);
          const confirmationWithType = {
            ...confirmationRequest,
            _type: confirmationRequest.certificate_details && confirmationRequest.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation"
          };
          setSelectedConfirmationRequest(confirmationWithType);
          setSelectedRequest(confirmationWithType as any);
          setDetailDialogOpen(true);
        } else {
          const request = await getCertificateRequestById(actualId);
          setSelectedRequest(request);
          setSelectedConfirmationRequest(null);
          setDetailDialogOpen(true);
        }
        return;
      }

      if (requestType === "confirmation") {
        // Unified confirmation request (single or bulk based on certificate_details length)
        const confirmationRequest = await getCertificateConfirmation(requestId);
        // Ensure _type is set for proper rendering
        const confirmationWithType = {
          ...confirmationRequest,
          _type: confirmationRequest.certificate_details && confirmationRequest.certificate_details.length > 1
            ? "bulk_confirmation"
            : "certificate_confirmation"
        };
        setSelectedConfirmationRequest(confirmationWithType);
        setSelectedRequest(confirmationWithType as any);
        setDetailDialogOpen(true);
      } else {
        // Regular certificate/attestation request
        const request = await getCertificateRequestById(requestId);
        setSelectedRequest(request);
        setSelectedConfirmationRequest(null);
        setDetailDialogOpen(true);
      }
    } catch (error) {
      toast.error("Failed to load request details");
      console.error("Error loading request:", error);
    }
  };

  const handleBeginProcess = async (requestId: number) => {
    try {
      // Determine type from current list so we hit the correct backend endpoint
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      if (requestType === "confirmation") {
        await beginCertificateConfirmationProcess(requestId);
      } else {
        await beginCertificateRequestProcess(requestId);
      }
      toast.success("Request processing started");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to begin processing");
      console.error("Error beginning process:", error);
    }
  };

  const handleSendToDispatch = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      if (requestType === "confirmation") {
        await sendCertificateConfirmationToDispatch(requestId);
      } else {
        await sendCertificateRequestToDispatch(requestId);
      }
      toast.success("Request sent to dispatch");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to send to dispatch");
      console.error("Error sending to dispatch:", error);
    }
  };

  const handleDispatch = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await dispatchRequest(requestId, trackingNumber.trim() || undefined);
      toast.success("Request dispatched successfully");
      setDispatchDialogOpen(false);
      setTrackingNumber("");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to dispatch request");
      console.error("Error dispatching request:", error);
    }
  };

  const handleDownloadPDF = async (requestId: number, isBulkConfirmation: boolean = false) => {
    try {
      // Find the request in the current list to determine its type
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : (isBulkConfirmation ? "confirmation" : "certificate");

      let blob: Blob;
      let filename: string;

      if (requestType === "confirmation") {
        // Confirmation requests (single or bulk) have PDFs
        blob = await downloadBulkConfirmationPDF(requestId);
        const confirmationRequest = requestInList as CertificateConfirmationRequestResponse;
        const isBulk = confirmationRequest?.certificate_details && confirmationRequest.certificate_details.length > 1;
        filename = isBulk ? `bulk_confirmation_${requestId}.pdf` : `confirmation_${requestId}.pdf`;
      } else {
        // Regular certificate request - may or may not have PDF
        try {
          blob = await downloadCertificateRequestPDF(requestId);
          filename = `certificate_request_${requestId}.pdf`;
        } catch (pdfError: any) {
          if (pdfError.message?.includes("404") || pdfError.message?.includes("not found")) {
            toast.error("PDF not available for this certificate request");
          } else {
            throw pdfError;
          }
          return;
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF downloaded successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to download PDF");
      console.error("Error downloading PDF:", error);
    }
  };

  const handleGenerateBulkConfirmationPDF = async (confirmationId: number) => {
    try {
      await generateBulkConfirmationPDF(confirmationId);
      toast.success("PDF generated successfully");
      loadRequests();
      if (selectedConfirmationRequest?.id === confirmationId) {
        const updated = await getCertificateConfirmation(confirmationId);
        setSelectedConfirmationRequest(updated);
        setSelectedRequest(updated as any);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate PDF");
      console.error("Error generating PDF:", error);
    }
  };

  const handleUploadBulkConfirmationPDF = async (confirmationId: number, file: File) => {
    try {
      await uploadBulkConfirmationPDF(confirmationId, file);
      toast.success("PDF uploaded successfully");
      loadRequests();
      if (selectedConfirmationRequest?.id === confirmationId) {
        const updated = await getCertificateConfirmation(confirmationId);
        setSelectedConfirmationRequest(updated);
        setSelectedRequest(updated as any);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to upload PDF");
      console.error("Error uploading PDF:", error);
    }
  };

  const handleDownloadResponsePDF = async (confirmationId: number) => {
    try {
      const blob = await downloadConfirmationResponse(confirmationId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `confirmation_response_${confirmationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Response PDF downloaded successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to download response PDF");
      console.error("Error downloading response PDF:", error);
    }
  };

  const handleDownloadRequestPDF = async (confirmationId: number) => {
    try {
      const blob = await downloadConfirmationRequestPDF(confirmationId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `confirmation_request_${confirmationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Request PDF downloaded successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to download request PDF");
      console.error("Error downloading request PDF:", error);
    }
  };

  const handleResponseSuccess = async () => {
    loadRequests();
    if (selectedConfirmationRequest) {
      const updated = await getCertificateConfirmation(selectedConfirmationRequest.id);
      setSelectedConfirmationRequest(updated);
      setSelectedRequest(updated as any);
    }
  };

  const handleSignResponse = async (confirmationId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to sign this response? Once signed, it cannot be modified."
    );
    if (!confirmed) return;

    try {
      await signConfirmationResponse(confirmationId);
      toast.success("Response signed successfully");
      loadRequests();
      if (selectedConfirmationRequest?.id === confirmationId) {
        const updated = await getCertificateConfirmation(confirmationId);
        setSelectedConfirmationRequest(updated);
        setSelectedRequest(updated as any);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sign response");
      console.error("Error signing response:", error);
    }
  };

  const handleRevokeResponse = (confirmationId: number) => {
    setRevokeConfirmationId(confirmationId);
    setRevocationReason("");
    setRevokeDialogOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!revokeConfirmationId) return;
    if (!revocationReason.trim()) {
      toast.error("Please provide a reason for revoking the response");
      return;
    }

    try {
      await revokeConfirmationResponse(revokeConfirmationId, revocationReason.trim());
      toast.success("Response revoked successfully");
      setRevokeDialogOpen(false);
      setRevocationReason("");
      setRevokeConfirmationId(null);
      loadRequests();
      if (selectedConfirmationRequest?.id === revokeConfirmationId) {
        const updated = await getCertificateConfirmation(revokeConfirmationId);
        setSelectedConfirmationRequest(updated);
        setSelectedRequest(updated as any);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to revoke response");
      console.error("Error revoking response:", error);
    }
  };

  const handleUnrevokeResponse = async (confirmationId: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to unrevoke this response? The response can then be signed again after corrections are made."
    );
    if (!confirmed) return;

    try {
      await unrevokeConfirmationResponse(confirmationId);
      toast.success("Response unrevoked successfully");
      loadRequests();
      if (selectedConfirmationRequest?.id === confirmationId) {
        const updated = await getCertificateConfirmation(confirmationId);
        setSelectedConfirmationRequest(updated);
        setSelectedRequest(updated as any);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to unrevoke response");
      console.error("Error unrevoking response:", error);
    }
  };

  const handleUpdateNotes = async () => {
    if (!selectedRequest) return;
    setUpdating(true);
    try {
      const requestType = getRequestType(selectedRequest);
      await updateCertificateRequest(selectedRequest.id, { notes });
      toast.success("Notes updated");
      setNotesDialogOpen(false);
      setNotes("");
      loadRequests();
      if (requestType === "confirmation") {
        const updated = await getCertificateConfirmation(selectedRequest.id);
        const updatedWithType = {
          ...updated,
          _type: updated.certificate_details && updated.certificate_details.length > 1
            ? "bulk_confirmation"
            : "certificate_confirmation",
        };
        setSelectedConfirmationRequest(updatedWithType);
        setSelectedRequest(updatedWithType as any);
      } else {
        const updated = await getCertificateRequestById(selectedRequest.id);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to update notes");
      console.error("Error updating notes:", error);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignTicket = async (requestId: number, assignedToUserId: string) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await assignTicket(requestId, { assigned_to_user_id: assignedToUserId });
      toast.success("Ticket assigned successfully");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to assign ticket");
      console.error("Error assigning ticket:", error);
    }
  };

  const handleUnassignTicket = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await unassignTicket(requestId);
      toast.success("Ticket unassigned successfully");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to unassign ticket");
      console.error("Error unassigning ticket:", error);
    }
  };

  const handleUpdatePriority = async (requestId: number, priority: "low" | "medium" | "high" | "urgent") => {
    try {
      // Determine type from current list or selected request
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await updateCertificateRequest(requestId, { priority });
      toast.success("Priority updated");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to update priority");
      console.error("Error updating priority:", error);
    }
  };

  const handleAddComment = async (requestId: number, comment: string) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await addTicketComment(requestId, { comment });
      toast.success("Comment added");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error) {
      toast.error("Failed to add comment");
      console.error("Error adding comment:", error);
    }
  };

  const openNotesDialog = async (request: CertificateRequestResponse | CertificateConfirmationRequestResponse) => {
    setSelectedRequest(request);
    // Fetch full details to get notes
    const isBulk = (request as any)._type === "bulk_confirmation" || !!(request as any).bulk_request_number;
    try {
      if (isBulk) {
        const fullRequest = await getBulkCertificateConfirmation(request.id);
        setNotes((fullRequest as any).notes || "");
      } else {
        const fullRequest = await getCertificateRequestById(request.id);
        setNotes((fullRequest as any).notes || "");
      }
    } catch {
      setNotes("");
    }
    setNotesDialogOpen(true);
  };

  const handleMarkReceived = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await markRequestReceived(requestId);
      toast.success("Request marked as received");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to mark as received");
      console.error("Error marking as received:", error);
    }
  };

  const handleComplete = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await completeRequest(requestId);
      toast.success("Request marked as completed");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to complete request");
      console.error("Error completing request:", error);
    }
  };

  const handleCancel = async (requestId: number) => {
    try {
      const requestInList = requests.find(r => r.id === requestId);
      const requestType = requestInList ? getRequestType(requestInList) : getRequestType(selectedRequest);

      await cancelRequest(requestId, cancelReason.trim() || undefined);
      toast.success("Request cancelled");
      setCancelDialogOpen(false);
      setCancelReason("");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        if (requestType === "confirmation") {
          const updated = await getCertificateConfirmation(requestId);
          const updatedWithType = {
            ...updated,
            _type: updated.certificate_details && updated.certificate_details.length > 1
              ? "bulk_confirmation"
              : "certificate_confirmation",
          };
          setSelectedConfirmationRequest(updatedWithType);
          setSelectedRequest(updatedWithType as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel request");
      console.error("Error cancelling request:", error);
    }
  };

  const handleResendPaymentLink = async (requestId: number) => {
    try {
      const result = await resendPaymentLink(requestId);
      toast.success("Payment link generated successfully");

      // Copy link to clipboard
      if (result.authorization_url) {
        await navigator.clipboard.writeText(result.authorization_url);
        toast.success("Payment link copied to clipboard");
      }

      // Optionally open the link in a new tab
      if (result.authorization_url && confirm("Payment link generated. Open in new tab?")) {
        window.open(result.authorization_url, "_blank");
      }

      loadRequests();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to resend payment link");
      console.error("Error resending payment link:", error);
    }
  };

  const handleReconcilePayment = async (requestId: number) => {
    try {
      let paymentId: number | null = null;

      // Check if it's a confirmation request
      const confirmation = await getCertificateConfirmation(requestId).catch(() => null);
      if (confirmation && (confirmation as any).payment_id) {
        paymentId = (confirmation as any).payment_id;
      } else {
        // Try as certificate request
        const request = await getCertificateRequestById(requestId).catch(() => null);
        if (request && (request as any).payment_id) {
          paymentId = (request as any).payment_id;
        }
      }

      if (!paymentId) {
        toast.error("No payment found for this request");
        return;
      }

      const result = await reconcilePayment(paymentId);
      toast.success(result.message || "Payment reconciled successfully");

      // Refresh requests and selected request
      loadRequests();
      if (selectedRequest?.id === requestId) {
        // Refresh based on request type
        if (selectedConfirmationRequest) {
          const updated = await getCertificateConfirmation(requestId);
          setSelectedConfirmationRequest(updated);
          setSelectedRequest(updated as any);
        } else {
          const updated = await getCertificateRequestById(requestId);
          setSelectedRequest(updated);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to reconcile payment");
      console.error("Error reconciling payment:", error);
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

  // Filter requests based on search and filters
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const isBulk = (req as any)._type === "bulk_confirmation" || (req as any).bulk_request_number;
        const matchesSearch = isBulk
          ? ((req as any).bulk_request_number?.toLowerCase().includes(query) || false)
          : (
              (req as CertificateRequestResponse).request_number?.toLowerCase().includes(query) ||
              (req as CertificateRequestResponse).index_number?.toLowerCase().includes(query) ||
              (req as CertificateRequestResponse).national_id_number?.toLowerCase().includes(query) ||
              (req as CertificateRequestResponse).examination_center_name?.toLowerCase().includes(query) ||
              false
            );
        if (!matchesSearch) return false;
      }

      // Request type filter (client-side for multiple selection)
      if (requestTypeFilters.size > 0 && !requestTypeFilters.has(req.request_type)) {
        return false;
      }

      // Assigned filter - handle "unassigned" and "my_tickets" client-side
      if (assignedToFilter === "unassigned") {
        if (req.assigned_to_user_id) {
          return false;
        }
      }

      // Handle "my_tickets" filter client-side
      if (myTicketsOnly && currentUser) {
        if (req.assigned_to_user_id !== currentUser.id) {
          return false;
        }
      }

      return true;
    });
  }, [requests, searchQuery, requestTypeFilters, assignedToFilter, myTicketsOnly, currentUser]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(new Set(filteredRequests.map((r) => r.id)));
    } else {
      setSelectedRows(new Set());
    }
  };

  const handleSelectRow = (requestId: number, checked: boolean) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(requestId);
    } else {
      newSelected.delete(requestId);
    }
    setSelectedRows(newSelected);
  };

  const allSelected = filteredRequests.length > 0 && selectedRows.size === filteredRequests.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < filteredRequests.length;

  const toggleRequestTypeFilter = (type: string) => {
    const newFilters = new Set(requestTypeFilters);
    if (newFilters.has(type)) {
      newFilters.delete(type);
    } else {
      newFilters.add(type);
    }
    setRequestTypeFilters(newFilters);
    setPage(1);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearchFocus: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
    onCloseDialog: () => {
      if (detailDialogOpen) setDetailDialogOpen(false);
      if (previewRequest) setPreviewRequest(null);
    },
    enabled: true,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Requests</h1>
          <p className="text-muted-foreground">Manage certificate requests and confirmation requests</p>
        </div>
        <Button
          onClick={() => setReconciliationDialogOpen(true)}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Payment Reconciliation
        </Button>
      </div>

      {/* Statistics Cards */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Statistics</CardTitle>
            <div className="flex items-center gap-2">
              <Select
                value={statisticsPeriod || "all"}
                onValueChange={(value) => {
                  if (value === "all") {
                    setStatisticsPeriod(undefined);
                  } else {
                    setStatisticsPeriod(value as "last_week" | "last_month" | "last_year" | "custom");
                  }
                  loadStatistics();
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="last_year">Last Year</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              {statisticsPeriod === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    placeholder="Start Date"
                    value={customStartDate}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      if (e.target.value && customEndDate) {
                        loadStatistics();
                      }
                    }}
                    className="w-[150px]"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    placeholder="End Date"
                    value={customEndDate}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      if (customStartDate && e.target.value) {
                        loadStatistics();
                      }
                    }}
                    className="w-[150px]"
                  />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {statistics && (
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending Payment</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.pending_payment}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Completed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{statistics.completed}</div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Focused View Tabs */}
      <div className="flex items-center gap-2">
        {(["active","completed","cancelled","my_tickets","all"] as const).map(tab => (
          <Button
            key={tab}
            size="sm"
            variant={viewTab === tab ? "default" : "outline"}
            onClick={() => {
              setViewTab(tab);
              setPage(1);
              loadRequests();
            }}
          >
            {tab === "my_tickets" ? "My Tickets" : tab[0].toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>


      {/* DataTable */}
      <Card>
        <CardHeader>
          <CardTitle>Requests ({total})</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={requests}
            loading={loading}
            onViewDetails={handleViewDetails}
            onBeginProcess={handleBeginProcess}
            onSendToDispatch={handleSendToDispatch}
            onUpdateNotes={(request) => {
              setNotes((request as any).notes || "");
              setSelectedRequest(request as any);
              setNotesDialogOpen(true);
            }}
            onDownloadPDF={handleDownloadPDF}
            requestTypeFilters={requestTypeFilters}
            onRequestTypeFilterChange={toggleRequestTypeFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            assignedToFilter={assignedToFilter}
            priorityFilter={priorityFilter}
            serviceTypeFilter={serviceTypeFilter}
            myTicketsOnly={myTicketsOnly}
            onAssignedToFilterChange={setAssignedToFilter}
            onPriorityFilterChange={setPriorityFilter}
            onServiceTypeFilterChange={setServiceTypeFilter}
            onMyTicketsOnlyChange={setMyTicketsOnly}
            currentUserId={currentUser?.id}
            onAssign={handleAssignTicket}
            onUnassign={handleUnassignTicket}
            onPriorityChange={handleUpdatePriority}
            onComment={handleAddComment}
            onRowClick={(request) => setPreviewRequest(request)}
          />
        </CardContent>
      </Card>

      {/* Bulk Actions Toolbar */}
      {selectedRows.size > 0 && (
        <BulkActions
          selectedCount={selectedRows.size}
          onBulkAssign={async (userIds) => {
            for (const id of Array.from(selectedRows)) {
              await handleAssignTicket(id, userIds[0]);
            }
            setSelectedRows(new Set());
            loadRequests();
          }}
          onBulkPriorityChange={async (priority) => {
            for (const id of Array.from(selectedRows)) {
              await handleUpdatePriority(id, priority);
            }
            setSelectedRows(new Set());
            loadRequests();
          }}
          onBulkComment={async (comment) => {
            for (const id of Array.from(selectedRows)) {
              await handleAddComment(id, comment);
            }
            setSelectedRows(new Set());
            loadRequests();
          }}
          onClearSelection={() => setSelectedRows(new Set())}
        />
      )}

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto p-0">
          {selectedRequest && (
            <>
              {/* Enhanced Header */}
              <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background border-b px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                          <Hash className="h-5 w-5 text-muted-foreground" />
                          {isConfirmationRequest(selectedRequest)
                            ? (selectedRequest as CertificateConfirmationRequestResponse).request_number
                            : (selectedRequest as CertificateRequestResponse).request_number || "N/A"}
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-base">
                          {isConfirmationRequest(selectedRequest)
                            ? (isBulkConfirmation(selectedRequest as CertificateConfirmationRequestResponse)
                                ? "Bulk Certificate Confirmation Details"
                                : "Certificate Confirmation Details")
                            : "Certificate Request Details"}
                        </DialogDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={getStatusBadgeVariant(selectedRequest.status)}
                          className="text-sm px-3 py-1"
                        >
                          {selectedRequest.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                        <PriorityBadge priority={selectedRequest.priority as any} />
                        <Badge variant={selectedRequest.service_type === "express" ? "default" : "outline"}>
                          {selectedRequest.service_type === "express" ? "⚡ Express" : "Standard"}
                        </Badge>
                    {/* Change Status (manual) */}
                    {["in_process","ready_for_dispatch","dispatched","received"].includes(selectedRequest.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const allowed = getAllowedManualStatuses(selectedRequest.status);
                          setNewStatus(allowed[0] || "ready_for_dispatch");
                          setChangeReason("");
                          setChangeStatusDialogOpen(true);
                        }}
                      >
                        Change Status
                      </Button>
                    )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          <span>Created {new Date(selectedRequest.created_at).toLocaleDateString()}</span>
                        </div>
                        {selectedRequest.assigned_to_user_id && (
                          <div className="flex items-center gap-1.5">
                            <User className="h-4 w-4" />
                            <span>
                              {selectedRequest.assigned_to_user_id === currentUser?.id
                                ? "Assigned to Me"
                                : `Assigned to User ${selectedRequest.assigned_to_user_id.substring(0, 8)}...`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 space-y-4">
              {/* Separate rendering for confirmation/verification requests vs certificate/attestation requests */}
              {isConfirmationRequest(selectedRequest) ? (
                // Certificate Confirmation Request Details (unified model)
                (() => {
                  const confirmationRequest = selectedRequest as CertificateConfirmationRequestResponse;
                  const isBulk = isBulkConfirmation(confirmationRequest);
                  const totalAmount = confirmationRequest.invoice?.amount ? Number(confirmationRequest.invoice.amount).toFixed(2) : "0.00";

                  return (
                    <>
                      {/* Section Header for Confirmation/Verification Requests */}
                      <div className="border-b pb-3 mb-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-sm px-3 py-1">
                            {confirmationRequest.request_type === "confirmation" ? "Confirmation" : "Verification"}
                            {isBulk && " (Bulk)"}
                          </Badge>
                          <h3 className="text-lg font-semibold">Certificate Confirmation Request Information</h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Request Number</Label>
                          <p className="font-mono">{confirmationRequest.request_number}</p>
                        </div>
                        <div>
                          <Label>Type</Label>
                          <p className="capitalize">
                            {confirmationRequest.request_type}
                            {isBulk && " (Bulk)"}
                          </p>
                        </div>
                        <div>
                          <Label>Total Amount</Label>
                          <p>GHS {totalAmount}</p>
                        </div>
                        <div>
                          <Label>Service Type</Label>
                          <p className="capitalize">{confirmationRequest.service_type}</p>
                        </div>
                        <div>
                          <Label>Contact Phone</Label>
                          <p>{confirmationRequest.contact_phone}</p>
                        </div>
                        {confirmationRequest.contact_email && (
                          <div>
                            <Label>Contact Email</Label>
                            <p>{confirmationRequest.contact_email}</p>
                          </div>
                        )}
                        <div>
                          <Label>Total Certificates</Label>
                          <p>{confirmationRequest.certificate_details?.length || 0} certificate(s)</p>
                        </div>
                        {confirmationRequest.invoice?.invoice_number && (
                          <div>
                            <Label>Invoice Number</Label>
                            <p>{confirmationRequest.invoice.invoice_number}</p>
                          </div>
                        )}
                        {confirmationRequest.tracking_number && (
                          <div>
                            <Label>Tracking Number</Label>
                            <p>{confirmationRequest.tracking_number}</p>
                          </div>
                        )}
                        <div>
                          <Label>Created At</Label>
                          <p>{new Date(confirmationRequest.created_at).toLocaleString()}</p>
                        </div>
                        <div>
                          <Label>Updated At</Label>
                          <p>{new Date(confirmationRequest.updated_at).toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Certificate Details - Always use table format for both single and bulk */}
                      {confirmationRequest.certificate_details && confirmationRequest.certificate_details.length > 0 && (
                        <div className="pt-4 border-t">
                          <h3 className="font-semibold mb-4">
                            Certificate Details ({confirmationRequest.certificate_details.length})
                          </h3>
                          <div className="border rounded-lg overflow-hidden">
                            <div className="max-h-96 overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Candidate Name</TableHead>
                                    <TableHead>Index Number</TableHead>
                                    <TableHead>School Name</TableHead>
                                    <TableHead>Programme Name</TableHead>
                                    <TableHead>Completion Year</TableHead>
                                    <TableHead>Request Details</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {confirmationRequest.certificate_details.map((cert: any, idx: number) => (
                                    <TableRow key={idx}>
                                      <TableCell className="font-medium">{cert.candidate_name}</TableCell>
                                      <TableCell>{cert.candidate_index_number || "N/A"}</TableCell>
                                      <TableCell>{cert.school_name}</TableCell>
                                      <TableCell>{cert.programme_name}</TableCell>
                                      <TableCell>{cert.completion_year}</TableCell>
                                      <TableCell className="max-w-xs truncate" title={cert.request_details || ""}>
                                        {cert.request_details || "—"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()
              ) : (
                // Regular Certificate/Attestation Request Details
                <>
                  {/* Section Header for Certificate/Attestation Requests */}
                  <div className="border-b pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        {(selectedRequest as CertificateRequestResponse).request_type === "certificate" ? "Certificate" : "Attestation"}
                      </Badge>
                      <h3 className="text-lg font-semibold">Certificate Request Information</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Type</Label>
                      <p className="capitalize">{selectedRequest.request_type}</p>
                    </div>
                  <div>
                    <Label>Index Number</Label>
                    <p>{(selectedRequest as CertificateRequestResponse).index_number || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Examination Year</Label>
                    <p>{(selectedRequest as CertificateRequestResponse).exam_year || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Examination Series</Label>
                    <p>{(selectedRequest as CertificateRequestResponse).examination_series || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Examination Center</Label>
                    <p>{(selectedRequest as CertificateRequestResponse).examination_center_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label>National ID Number</Label>
                    <p>{(selectedRequest as CertificateRequestResponse).national_id_number || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Delivery Method</Label>
                    <p className="capitalize">{(selectedRequest as CertificateRequestResponse).delivery_method || "N/A"}</p>
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <p>{selectedRequest.contact_phone}</p>
                  </div>
                  {selectedRequest.contact_email && (
                    <div>
                      <Label>Contact Email</Label>
                      <p>{selectedRequest.contact_email}</p>
                    </div>
                  )}
                  {selectedRequest.tracking_number && (
                    <div>
                      <Label>Tracking Number</Label>
                      <p>{selectedRequest.tracking_number}</p>
                    </div>
                  )}
                  <div>
                    <Label>Created At</Label>
                    <p>{new Date(selectedRequest.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label>Updated At</Label>
                    <p>{new Date(selectedRequest.updated_at).toLocaleString()}</p>
                  </div>
                </div>
                </>
              )}

              {/* Workflow Progress */}
              <div className="pt-4 border-t">
                <WorkflowProgress currentStatus={selectedRequest.status} />
              </div>

              {/* Ticket Management Section */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="font-semibold">Ticket Management</h3>
                <div className="grid grid-cols-2 gap-4">
                  <TicketAssignmentSelector
                    value={selectedRequest.assigned_to_user_id || null}
                    onValueChange={(value) => {
                      if (value) {
                        handleAssignTicket(selectedRequest.id, value);
                      } else {
                        handleUnassignTicket(selectedRequest.id);
                      }
                    }}
                    label="Assigned To"
                  />
                  <PrioritySelector
                    value={selectedRequest.priority as any}
                    onValueChange={(value) => handleUpdatePriority(selectedRequest.id, value)}
                    label="Priority"
                  />
                </div>
                <div>
                  <Label>Service Type</Label>
                  <Badge variant={selectedRequest.service_type === "express" ? "default" : "outline"}>
                    {selectedRequest.service_type === "express" ? "Express" : "Standard"}
                  </Badge>
                </div>
              </div>

              {/* Response Section - for confirmation/verification requests */}
              {(() => {
                const requestType = getRequestType(selectedRequest);
                if (requestType === "confirmation") {
                  const confirmationRequest = selectedRequest as CertificateConfirmationRequestResponse;
                  return (
                    <div className="pt-4 border-t space-y-4">
                      <h3 className="font-semibold">Response Management</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Response Status</Label>
                          {confirmationRequest.response_file_path ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="default">Response Available</Badge>
                                {confirmationRequest.response_signed && (
                                  <Badge variant="default" className="bg-green-600">
                                    Signed & Locked
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {confirmationRequest.response_source === "upload" ? "Uploaded" : "Generated from Template"}
                              </p>
                              {confirmationRequest.response_file_name && (
                                <p className="text-sm text-muted-foreground">
                                  File: {confirmationRequest.response_file_name}
                                </p>
                              )}
                              {confirmationRequest.responded_at && (
                                <p className="text-sm text-muted-foreground">
                                  Responded: {new Date(confirmationRequest.responded_at).toLocaleString()}
                                </p>
                              )}
                              {confirmationRequest.response_signed && confirmationRequest.response_signed_at && (
                                <p className="text-sm text-muted-foreground">
                                  Signed: {new Date(confirmationRequest.response_signed_at).toLocaleString()}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline">No Response Yet</Badge>
                          )}
                        </div>
                        {confirmationRequest.response_notes && (
                          <div>
                            <Label>Response Notes</Label>
                            <p className="text-sm">{confirmationRequest.response_notes}</p>
                          </div>
                        )}
                        {confirmationRequest.response_revoked && confirmationRequest.response_revocation_reason && (
                          <div>
                            <Label className="text-red-600">Revocation Reason</Label>
                            <p className="text-sm text-red-600">{confirmationRequest.response_revocation_reason}</p>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          onClick={() => handleDownloadRequestPDF(confirmationRequest.id)}
                          variant="outline"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Request PDF
                        </Button>
                        {confirmationRequest.response_file_path ? (
                          <Button
                            onClick={() => handleDownloadResponsePDF(confirmationRequest.id)}
                            variant="outline"
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download Response PDF
                          </Button>
                        ) : null}
                        {confirmationRequest.status === "pending_payment" && (
                          <>
                            {(confirmationRequest as any).payment_id && (
                              <Button
                                onClick={() => handleReconcilePayment(confirmationRequest.id)}
                                variant="outline"
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Reconcile Payment
                              </Button>
                            )}
                          </>
                        )}
                        {confirmationRequest.status !== "pending_payment" && confirmationRequest.status !== "cancelled" && (
                          <Button
                            onClick={() => setResponseDialogOpen(true)}
                            variant="default"
                            disabled={confirmationRequest.response_signed}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            {confirmationRequest.response_file_path ? "Update Response" : "Respond"}
                          </Button>
                        )}
                        {confirmationRequest.response_file_path && !confirmationRequest.response_signed && (
                          <Button
                            onClick={() => handleSignResponse(confirmationRequest.id)}
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <PenTool className="mr-2 h-4 w-4" />
                            Sign Response
                          </Button>
                        )}
                        {confirmationRequest.response_file_path && confirmationRequest.response_signed && !confirmationRequest.response_revoked && (
                          <Button
                            onClick={() => handleRevokeResponse(confirmationRequest.id)}
                            variant="destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Revoke Response
                          </Button>
                        )}
                        {confirmationRequest.response_file_path && confirmationRequest.response_revoked && (
                          <Button
                            onClick={() => handleUnrevokeResponse(confirmationRequest.id)}
                            variant="default"
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Unrevoke Response
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Activity Feed */}
              <div className="pt-4 border-t">
                <TicketActivityFeed
                  ticketId={selectedRequest.id}
                  ticketType={
                    selectedConfirmationRequest !== null
                      ? "certificate_confirmation_request"
                      : "certificate_request"
                  }
                />
              </div>

              <div className="flex gap-2 pt-4 flex-wrap">
                {/* PDF Actions - for regular certificate requests only */}
                {(() => {
                  const requestType = getRequestType(selectedRequest);
                  if (requestType !== "confirmation") {
                    // Regular certificate request
                    return (
                      <Button onClick={() => handleDownloadPDF(selectedRequest.id, false)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                      </Button>
                    );
                  }
                  return null;
                })()}
                {selectedRequest.status === "pending_payment" && (
                  <>
                    <Button onClick={() => handleResendPaymentLink(selectedRequest.id)} variant="default">
                      <Mail className="mr-2 h-4 w-4" />
                      Resend Payment Link
                    </Button>
                    {(selectedRequest as any).payment_id && (
                      <Button
                        onClick={() => handleReconcilePayment(selectedRequest.id)}
                        variant="outline"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Reconcile Payment
                      </Button>
                    )}
                  </>
                )}
                {selectedRequest.status === "paid" && (
                  <Button onClick={() => handleBeginProcess(selectedRequest.id)}>
                    Begin Process
                  </Button>
                )}
                {selectedRequest.status === "in_process" && (
                  <Button onClick={() => handleSendToDispatch(selectedRequest.id)}>
                    Send to Dispatch
                  </Button>
                )}
                {selectedRequest.status === "ready_for_dispatch" && (
                  <Button onClick={() => {
                    setTrackingNumber("");
                    setDispatchDialogOpen(true);
                  }} variant="default">
                    <Truck className="mr-2 h-4 w-4" />
                    Dispatch Request
                  </Button>
                )}
                {selectedRequest.status === "dispatched" && (
                  <Button onClick={() => handleMarkReceived(selectedRequest.id)} variant="default">
                    <PackageCheck className="mr-2 h-4 w-4" />
                    Mark as Received
                  </Button>
                )}
                {selectedRequest.status === "received" && (
                  <Button onClick={() => handleComplete(selectedRequest.id)} variant="default">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Mark as Completed
                  </Button>
                )}
                {selectedRequest.status !== "completed" && selectedRequest.status !== "cancelled" && (
                  <Button
                    onClick={() => {
                      setCancelReason("");
                      setCancelDialogOpen(true);
                    }}
                    variant="destructive"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancel Request
                  </Button>
                )}
                <Button variant="outline" onClick={() => openNotesDialog(selectedRequest)}>
                  Update Notes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setComment("");
                    setCommentDialogOpen(true);
                  }}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Add Comment
                </Button>
              </div>
              </div>
            </>
          )}
          {!selectedRequest && (
            <div className="p-6 text-center text-muted-foreground">
              Loading request details...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Status Dialog */}
      <Dialog open={changeStatusDialogOpen} onOpenChange={setChangeStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>
              Manually change the status after processing has started. Provide a brief reason (required).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Status</Label>
              <Select
                value={newStatus}
                onValueChange={(v: any) => setNewStatus(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {selectedRequest &&
                    getAllowedManualStatuses(selectedRequest.status).map(s => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Provide a brief reason for this manual change"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setChangeStatusDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedRequest) return;
                if (!changeReason || changeReason.trim().length < 3) {
                  toast.error("Please provide a reason (min 3 characters)");
                  return;
                }
                try {
                  const reqType = getRequestType(selectedRequest);
                  await changeTicketStatusManual(
                    selectedRequest.id,
                    newStatus,
                    changeReason.trim(),
                    reqType === "confirmation" ? "certificate_confirmation_request" : "certificate_request"
                  );
                  toast.success("Status updated");
                  setChangeStatusDialogOpen(false);
                  loadRequests();
                  // refresh selected item
                  if (reqType === "confirmation") {
                    const updated = await getCertificateConfirmation(selectedRequest.id);
                    const updatedWithType = {
                      ...updated,
                      _type: updated.certificate_details && updated.certificate_details.length > 1
                        ? "bulk_confirmation"
                        : "certificate_confirmation",
                    };
                    setSelectedConfirmationRequest(updatedWithType);
                    setSelectedRequest(updatedWithType as any);
                  } else {
                    const updated = await getCertificateRequestById(selectedRequest.id);
                    setSelectedRequest(updated);
                  }
                } catch (err: any) {
                  toast.error(err?.message || "Failed to update status");
                }
              }}
            >
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comment Dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Comment</DialogTitle>
            <DialogDescription>
              Add a comment to this ticket
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="comment">Comment</Label>
              <Textarea
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter your comment..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest && comment.trim()) {
                  handleAddComment(selectedRequest.id, comment.trim());
                  setCommentDialogOpen(false);
                  setComment("");
                }
              }}
              disabled={!comment.trim() || !selectedRequest}
            >
              Add Comment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notes Dialog */}
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Notes</DialogTitle>
            <DialogDescription>
              Add or update internal notes for this request
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Enter internal notes..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateNotes} disabled={updating}>
              {updating ? "Updating..." : "Update Notes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispatch Request</DialogTitle>
            <DialogDescription>
              Mark this request as dispatched. You can optionally add a tracking number for courier deliveries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="trackingNumber">Tracking Number (Optional)</Label>
              <Input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Enter tracking number if applicable..."
              />
              <p className="text-sm text-muted-foreground mt-1">
                Leave blank if not applicable (e.g., for pickup requests)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDispatchDialogOpen(false);
              setTrackingNumber("");
            }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest) {
                  handleDispatch(selectedRequest.id);
                }
              }}
              disabled={!selectedRequest}
            >
              <Truck className="mr-2 h-4 w-4" />
              Dispatch Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Request Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this request? This action cannot be undone. You can optionally provide a reason for cancellation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cancelReason">Cancellation Reason (Optional)</Label>
              <Textarea
                id="cancelReason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                rows={4}
              />
              <p className="text-sm text-muted-foreground mt-1">
                This reason will be recorded in the ticket activity history
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setCancelDialogOpen(false);
              setCancelReason("");
            }}>
              Keep Request
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequest) {
                  handleCancel(selectedRequest.id);
                }
              }}
              disabled={!selectedRequest}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Response Dialog - for confirmation/verification requests */}
      {selectedConfirmationRequest && (
        <ResponseDialog
          open={responseDialogOpen}
          onOpenChange={setResponseDialogOpen}
          confirmationRequest={selectedConfirmationRequest}
          onSuccess={handleResponseSuccess}
        />
      )}

      {/* Quick Preview */}
      <QuickPreview
        request={previewRequest}
        onClose={() => setPreviewRequest(null)}
        onViewFull={(requestId, requestObject) => {
          setPreviewRequest(null);
          handleViewDetails(requestId, requestObject);
        }}
        onDownloadPDF={handleDownloadPDF}
        currentUserId={currentUser?.id}
      />

      {/* Payment Reconciliation Dialog */}
      <PaymentReconciliationDialog
        open={reconciliationDialogOpen}
        onOpenChange={setReconciliationDialogOpen}
        onReconciled={loadRequests}
      />

      {/* Revoke Response Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Response</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this response? Once revoked, requesters will no longer be able to view or download it.
              A reason is required for revoking the response.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="revocation-reason">Reason for Revocation *</Label>
              <Textarea
                id="revocation-reason"
                placeholder="Enter the reason for revoking this response..."
                value={revocationReason}
                onChange={(e) => setRevocationReason(e.target.value)}
                rows={4}
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmRevoke} disabled={!revocationReason.trim()}>
              Revoke Response
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
