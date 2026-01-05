"use client";

import { useState, useEffect, useMemo } from "react";
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
  updateCertificateRequest,
  getCertificateRequestStatistics,
  downloadCertificateRequestPDF,
  type CertificateRequestResponse,
  type CertificateRequestListResponse,
} from "@/lib/api";
import { toast } from "sonner";
import { DataTable } from "@/components/certificate-requests/DataTable";
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
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState(false);

  // Filters
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [requestTypeFilters, setRequestTypeFilters] = useState<Set<string>>(new Set());
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

      const data: CertificateRequestListResponse = await listCertificateRequests(
        statusFilter,
        requestTypeFilter,
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
    loadRequests();
    loadStatistics();
  }, [page, statusFilters, requestTypeFilters]);

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

  const openNotesDialog = (request: CertificateRequestResponse) => {
    setSelectedRequest(request);
    setNotes(request.notes || "");
    setNotesDialogOpen(true);
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

      return true;
    });
  }, [requests, searchQuery, statusFilters, requestTypeFilters]);

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
          />
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              View and manage certificate request details
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Request Number</Label>
                  <p className="font-medium">{selectedRequest.request_number}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge variant={getStatusBadgeVariant(selectedRequest.status)}>
                    {selectedRequest.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </div>
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

              <div className="flex gap-2 pt-4">
                <Button onClick={() => handleDownloadPDF(selectedRequest.id)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
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
                <Button variant="outline" onClick={() => openNotesDialog(selectedRequest)}>
                  Update Notes
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
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
    </div>
  );
}
