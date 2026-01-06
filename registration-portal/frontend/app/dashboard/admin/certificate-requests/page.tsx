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
  sendCertificateRequestToDispatch,
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
  type CertificateRequestResponse,
  type CertificateRequestListResponse,
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
];

interface Statistics {
  total: number;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
}

export default function CertificateRequestsPage() {
  const [requests, setRequests] = useState<CertificateRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<CertificateRequestResponse | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [comment, setComment] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<CertificateRequestResponse | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filters
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [requestTypeFilters, setRequestTypeFilters] = useState<Set<string>>(new Set());
  const [assignedToFilter, setAssignedToFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string | undefined>(undefined);
  const [myTicketsOnly, setMyTicketsOnly] = useState(false);
  const [currentUser, setCurrentUser] = useState<Awaited<ReturnType<typeof getCurrentUser>> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadRequests = async () => {
    setLoading(true);
    try {
      // Use first filter if multiple selected, or empty string for all
      const statusFilter = statusFilters.size === 1 ? Array.from(statusFilters)[0] : statusFilters.size > 1 ? "" : undefined;
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

      const data: CertificateRequestListResponse = await listCertificateRequests(
        statusFilter,
        requestTypeFilter,
        assignedTo,
        priorityFilter,
        serviceTypeFilter,
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

  const loadStatistics = async () => {
    try {
      const stats = await getCertificateRequestStatistics();
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
  }, [page, statusFilters, requestTypeFilters, assignedToFilter, priorityFilter, serviceTypeFilter, myTicketsOnly]);

  const handleViewDetails = async (requestId: number) => {
    try {
      const request = await getCertificateRequestById(requestId);
      setSelectedRequest(request);
      setDetailDialogOpen(true);
    } catch (error) {
      toast.error("Failed to load request details");
      console.error("Error loading request:", error);
    }
  };

  const handleBeginProcess = async (requestId: number) => {
    try {
      await beginCertificateRequestProcess(requestId);
      toast.success("Request processing started");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to begin processing");
      console.error("Error beginning process:", error);
    }
  };

  const handleSendToDispatch = async (requestId: number) => {
    try {
      await sendCertificateRequestToDispatch(requestId);
      toast.success("Request sent to dispatch");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to send to dispatch");
      console.error("Error sending to dispatch:", error);
    }
  };

  const handleDispatch = async (requestId: number) => {
    try {
      await dispatchRequest(requestId, trackingNumber.trim() || undefined);
      toast.success("Request dispatched successfully");
      setDispatchDialogOpen(false);
      setTrackingNumber("");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to dispatch request");
      console.error("Error dispatching request:", error);
    }
  };

  const handleDownloadPDF = async (requestId: number) => {
    try {
      const blob = await downloadCertificateRequestPDF(requestId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate_request_${requestId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF downloaded successfully");
    } catch (error) {
      toast.error("Failed to download PDF");
      console.error("Error downloading PDF:", error);
    }
  };

  const handleUpdateNotes = async () => {
    if (!selectedRequest) return;
    setUpdating(true);
    try {
      await updateCertificateRequest(selectedRequest.id, { notes });
      toast.success("Notes updated");
      setNotesDialogOpen(false);
      setNotes("");
      loadRequests();
      const updated = await getCertificateRequestById(selectedRequest.id);
      setSelectedRequest(updated);
    } catch (error) {
      toast.error("Failed to update notes");
      console.error("Error updating notes:", error);
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignTicket = async (requestId: number, assignedToUserId: string) => {
    try {
      await assignTicket(requestId, { assigned_to_user_id: assignedToUserId });
      toast.success("Ticket assigned successfully");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to assign ticket");
      console.error("Error assigning ticket:", error);
    }
  };

  const handleUnassignTicket = async (requestId: number) => {
    try {
      await unassignTicket(requestId);
      toast.success("Ticket unassigned successfully");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to unassign ticket");
      console.error("Error unassigning ticket:", error);
    }
  };

  const handleUpdatePriority = async (requestId: number, priority: "low" | "medium" | "high" | "urgent") => {
    try {
      await updateCertificateRequest(requestId, { priority });
      toast.success("Priority updated");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to update priority");
      console.error("Error updating priority:", error);
    }
  };

  const handleAddComment = async (requestId: number, comment: string) => {
    try {
      await addTicketComment(requestId, { comment });
      toast.success("Comment added");
      loadRequests();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error) {
      toast.error("Failed to add comment");
      console.error("Error adding comment:", error);
    }
  };

  const openNotesDialog = async (request: CertificateRequestResponse) => {
    setSelectedRequest(request);
    // Fetch full details to get notes
    try {
      const fullRequest = await getCertificateRequestById(request.id);
      setNotes((fullRequest as any).notes || "");
    } catch {
      setNotes("");
    }
    setNotesDialogOpen(true);
  };

  const handleMarkReceived = async (requestId: number) => {
    try {
      await markRequestReceived(requestId);
      toast.success("Request marked as received");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to mark as received");
      console.error("Error marking as received:", error);
    }
  };

  const handleComplete = async (requestId: number) => {
    try {
      await completeRequest(requestId);
      toast.success("Request marked as completed");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to complete request");
      console.error("Error completing request:", error);
    }
  };

  const handleCancel = async (requestId: number) => {
    try {
      await cancelRequest(requestId, cancelReason.trim() || undefined);
      toast.success("Request cancelled");
      setCancelDialogOpen(false);
      setCancelReason("");
      loadRequests();
      loadStatistics();
      if (selectedRequest?.id === requestId) {
        const updated = await getCertificateRequestById(requestId);
        setSelectedRequest(updated);
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
        const matchesSearch =
          req.request_number.toLowerCase().includes(query) ||
          req.index_number.toLowerCase().includes(query) ||
          req.national_id_number.toLowerCase().includes(query) ||
          req.examination_center_name?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter (client-side for multiple selection)
      if (statusFilters.size > 0 && !statusFilters.has(req.status)) {
        return false;
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
  }, [requests, searchQuery, statusFilters, requestTypeFilters, assignedToFilter, myTicketsOnly, currentUser]);

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

  const toggleStatusFilter = (status: string) => {
    const newFilters = new Set(statusFilters);
    if (newFilters.has(status)) {
      newFilters.delete(status);
    } else {
      newFilters.add(status);
    }
    setStatusFilters(newFilters);
    setPage(1);
  };

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
      <div>
        <h1 className="text-3xl font-bold">Certificate Requests</h1>
        <p className="text-muted-foreground">Manage certificate and attestation requests</p>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <div className="text-2xl font-bold">{statistics.by_status.pending_payment || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.by_status.paid || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics.by_status.completed || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}


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
            onUpdateNotes={openNotesDialog}
            onDownloadPDF={handleDownloadPDF}
            statusFilters={statusFilters}
            requestTypeFilters={requestTypeFilters}
            onStatusFilterChange={toggleStatusFilter}
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
                          {selectedRequest.request_number}
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-base">
                          Certificate Request Details
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
                        <PriorityBadge priority={selectedRequest.priority} />
                        <Badge variant={selectedRequest.service_type === "express" ? "default" : "outline"}>
                          {selectedRequest.service_type === "express" ? "⚡ Express" : "Standard"}
                        </Badge>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <p className="capitalize">{selectedRequest.request_type}</p>
                </div>
                <div>
                  <Label>Index Number</Label>
                  <p>{selectedRequest.index_number}</p>
                </div>
                <div>
                  <Label>Examination Year</Label>
                  <p>{selectedRequest.exam_year}</p>
                </div>
                <div>
                  <Label>Examination Center</Label>
                  <p>{selectedRequest.examination_center_name || "N/A"}</p>
                </div>
                <div>
                  <Label>National ID Number</Label>
                  <p>{selectedRequest.national_id_number}</p>
                </div>
                <div>
                  <Label>Delivery Method</Label>
                  <p className="capitalize">{selectedRequest.delivery_method}</p>
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
                    value={selectedRequest.priority}
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

              {/* Activity Feed */}
              <div className="pt-4">
                <TicketActivityFeed ticketId={selectedRequest.id} />
              </div>

              <div className="flex gap-2 pt-4 flex-wrap">
                <Button onClick={() => handleDownloadPDF(selectedRequest.id)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
                {selectedRequest.status === "pending_payment" && (
                  <Button onClick={() => handleResendPaymentLink(selectedRequest.id)} variant="default">
                    <Mail className="mr-2 h-4 w-4" />
                    Resend Payment Link
                  </Button>
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

      {/* Quick Preview */}
      <QuickPreview
        request={previewRequest}
        onClose={() => setPreviewRequest(null)}
        onViewFull={(requestId) => {
          setPreviewRequest(null);
          handleViewDetails(requestId);
        }}
        onDownloadPDF={handleDownloadPDF}
        currentUserId={currentUser?.id}
      />
    </div>
  );
}
