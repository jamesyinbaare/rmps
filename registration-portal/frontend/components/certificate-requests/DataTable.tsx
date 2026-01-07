"use client";

import * as React from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronDown, MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Filter, User, Zap, Clock } from "lucide-react";
import type { CertificateRequestResponse, BulkCertificateConfirmationResponse, CertificateConfirmationRequestResponse } from "@/lib/api";
import { PriorityBadge } from "./PrioritySelector";
import { QuickActions } from "./QuickActions";

interface DataTableProps {
  data: (CertificateRequestResponse | CertificateConfirmationRequestResponse | BulkCertificateConfirmationResponse)[];
  loading?: boolean;
  onViewDetails: (requestId: number, requestObject?: CertificateRequestResponse | CertificateConfirmationRequestResponse) => void;
  onBeginProcess: (requestId: number) => void;
  onSendToDispatch: (requestId: number) => void;
  onUpdateNotes: (request: CertificateRequestResponse | CertificateConfirmationRequestResponse | BulkCertificateConfirmationResponse) => void;
  onDownloadPDF: (requestId: number, isBulkConfirmation?: boolean) => void;
  requestTypeFilters: Set<string>;
  onRequestTypeFilterChange: (type: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  assignedToFilter?: string;
  priorityFilter?: string;
  serviceTypeFilter?: string;
  myTicketsOnly?: boolean;
  onAssignedToFilterChange?: (value: string | undefined) => void;
  onPriorityFilterChange?: (value: string | undefined) => void;
  onServiceTypeFilterChange?: (value: string | undefined) => void;
  onMyTicketsOnlyChange?: (value: boolean) => void;
  currentUserId?: string;
  onAssign?: (requestId: number, userId: string) => void;
  onUnassign?: (requestId: number) => void;
  onPriorityChange?: (requestId: number, priority: "low" | "medium" | "high" | "urgent") => void;
  onComment?: (requestId: number, comment: string) => void;
  onRowClick?: (request: CertificateRequestResponse) => void;
}

const REQUEST_TYPE_OPTIONS = [
  { value: "certificate", label: "Certificate" },
  { value: "attestation", label: "Attestation" },
  { value: "confirmation", label: "Confirmation" },
  { value: "verification", label: "Verification" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const SERVICE_TYPE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
];

const getStatusBadgeVariant = (status: string | null | undefined) => {
  // Handle null/undefined status
  if (!status || typeof status !== "string") {
    return "secondary";
  }
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

export function DataTable({
  data,
  loading = false,
  onViewDetails,
  onBeginProcess,
  onSendToDispatch,
  onUpdateNotes,
  onDownloadPDF,
  requestTypeFilters,
  onRequestTypeFilterChange,
  searchQuery,
  onSearchChange,
  assignedToFilter,
  priorityFilter,
  serviceTypeFilter,
  myTicketsOnly,
  onAssignedToFilterChange,
  onPriorityFilterChange,
  onServiceTypeFilterChange,
  onMyTicketsOnlyChange,
  currentUserId,
  onAssign,
  onUnassign,
  onPriorityChange,
  onComment,
  onRowClick,
}: DataTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState({});

  // Helper functions to detect request types - using certificate_details as definitive field
  const isConfirmationRequest = (item: any): boolean => {
    // certificate_details is the definitive field that only exists on confirmation requests
    return "certificate_details" in item && Array.isArray(item.certificate_details);
  };

  const isBulkConfirmationRequest = (item: any): boolean => {
    if (!isConfirmationRequest(item)) return false;
    return item.certificate_details.length > 1;
  };

  const getConfirmationRequestCount = (item: any): number => {
    if (!isConfirmationRequest(item)) return 0;
    return item.certificate_details.length;
  };

  const getRequestNumber = (item: any): string => {
    if (isConfirmationRequest(item)) {
      // Confirmation requests use request_number (unified model)
      return item.request_number || "";
    }
    // Certificate/Attestation requests
    return (item as CertificateRequestResponse).request_number || "";
  };

  const columns: ColumnDef<any>[] = React.useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "request_number",
        header: "Request Number",
        cell: ({ row }) => {
          const item = row.original;
          const isConfirmation = isConfirmationRequest(item);
          const isBulk = isBulkConfirmationRequest(item);
          const requestNumber = getRequestNumber(item);

          if (isConfirmation) {
            // Confirmation request - show bulk badge if applicable
            const count = getConfirmationRequestCount(item);
            return (
              <div className="font-medium">
                {requestNumber}
                {isBulk && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Bulk ({count})
                  </Badge>
                )}
              </div>
            );
          }

          // Certificate/Attestation request
          return (
            <div className="font-medium">
              {requestNumber}
            </div>
          );
        },
      },
      {
        accessorKey: "request_type",
        header: () => {
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Type <Filter className="ml-2 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="start">
                <div className="p-2 space-y-2">
                  {REQUEST_TYPE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        checked={requestTypeFilters.has(option.value)}
                        onCheckedChange={() => onRequestTypeFilterChange(option.value)}
                      />
                      <Label className="text-sm font-normal cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        cell: ({ row }) => {
          const type = (row.getValue("request_type") as string | undefined)?.toLowerCase();
          const label =
            type === "certificate"
              ? "Certificate"
              : type === "attestation"
                ? "Attestation"
                : type === "confirmation"
                  ? "Confirmation"
                  : type === "verification"
                    ? "Verification"
                    : "Unknown";

          return <Badge variant="outline">{label}</Badge>;
        },
        filterFn: (row, id, value) => {
          if (requestTypeFilters.size === 0) return true;
          return requestTypeFilters.has(row.getValue(id));
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => {
          const item = row.original;
          const rawStatus = row.getValue("status");

          // Handle individual confirmation requests which don't have a status field
          // They inherit status from their parent bulk confirmation
          let status: string;
          if (item._type === "individual_confirmation") {
            // Individual confirmation requests don't have status - use parent bulk confirmation status or default
            const bulkConfirmationId = (item as any).bulk_certificate_confirmation_id;
            // For now, use a default status. In the future, we could fetch the bulk confirmation status
            status = "pending_payment"; // Default status for individual confirmations
          } else {
            // For regular requests and bulk confirmations, use the status field
            status = (rawStatus as string) || "pending_payment";
          }

          // Ensure status is a string and handle null/undefined
          if (!status || typeof status !== "string") {
            status = "pending_payment";
          }

          const getStatusIcon = (status: string) => {
            switch (status.toLowerCase()) {
              case "pending_payment":
                return "💳";
              case "paid":
                return "✅";
              case "in_process":
                return "⚙️";
              case "ready_for_dispatch":
                return "📦";
              case "dispatched":
                return "🚚";
              case "received":
                return "📬";
              case "completed":
                return "✔️";
              case "cancelled":
                return "❌";
              default:
                return "";
            }
          };
          return (
            <Badge variant={getStatusBadgeVariant(status)} className="flex items-center gap-1">
              <span>{getStatusIcon(status)}</span>
              <span>{status.replace(/_/g, " ").toUpperCase()}</span>
            </Badge>
          );
        },
      },
      {
        accessorKey: "priority",
        header: () => {
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Priority <Filter className="ml-2 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="start">
                <div className="p-2 space-y-2">
                  {PRIORITY_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        checked={priorityFilter === option.value}
                        onCheckedChange={() => onPriorityFilterChange?.(priorityFilter === option.value ? undefined : option.value)}
                      />
                      <Label className="text-sm font-normal cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                  {priorityFilter && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onPriorityFilterChange?.(undefined)}
                      >
                        Clear filter
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        cell: ({ row }) => {
          const priority = row.getValue("priority") as "low" | "medium" | "high" | "urgent";
          return <PriorityBadge priority={priority} />;
        },
      },
      {
        accessorKey: "service_type",
        header: () => {
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Service <Filter className="ml-2 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="start">
                <div className="p-2 space-y-2">
                  {SERVICE_TYPE_OPTIONS.map((option) => (
                    <div key={option.value} className="flex items-center space-x-2">
                      <Checkbox
                        checked={serviceTypeFilter === option.value}
                        onCheckedChange={() => onServiceTypeFilterChange?.(serviceTypeFilter === option.value ? undefined : option.value)}
                      />
                      <Label className="text-sm font-normal cursor-pointer">
                        {option.label}
                      </Label>
                    </div>
                  ))}
                  {serviceTypeFilter && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onServiceTypeFilterChange?.(undefined)}
                      >
                        Clear filter
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        cell: ({ row }) => {
          const serviceType = row.getValue("service_type") as "standard" | "express";
          return (
            <Badge variant={serviceType === "express" ? "default" : "outline"}>
              <div className="flex items-center gap-1">
                {serviceType === "express" ? (
                  <Zap className="h-3 w-3" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                <span className="capitalize">{serviceType}</span>
              </div>
            </Badge>
          );
        },
      },
      {
        accessorKey: "assigned_to_user_id",
        header: () => {
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2">
                  Assigned <Filter className="ml-2 h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start">
                <div className="p-2 space-y-2">
                  {onMyTicketsOnlyChange && currentUserId && (
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Checkbox
                        checked={myTicketsOnly}
                        onCheckedChange={(checked) => onMyTicketsOnlyChange(!!checked)}
                      />
                      <Label className="text-sm font-normal cursor-pointer">
                        My Tickets Only
                      </Label>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={assignedToFilter === "unassigned"}
                      onCheckedChange={() => onAssignedToFilterChange?.(assignedToFilter === "unassigned" ? undefined : "unassigned")}
                    />
                    <Label className="text-sm font-normal cursor-pointer">
                      Unassigned
                    </Label>
                  </div>
                  {assignedToFilter && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => onAssignedToFilterChange?.(undefined)}
                      >
                        Clear filter
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          );
        },
        cell: ({ row }) => {
          const assignedTo = row.getValue("assigned_to_user_id") as string | undefined;
          const isAssignedToMe = assignedTo === currentUserId;
          return (
            <div className="flex items-center gap-2">
              {assignedTo ? (
                <>
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {isAssignedToMe ? "Me" : `User ${assignedTo.substring(0, 8)}...`}
                  </span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ row }) => {
          const date = new Date(row.getValue("created_at"));
          return date.toLocaleDateString();
        },
      },
      {
        id: "quick_actions",
        header: "Quick Actions",
        cell: ({ row }) => {
          const request = row.original;
          return (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <QuickActions
                request={request}
                onAssign={onAssign}
                onUnassign={onUnassign}
                onPriorityChange={onPriorityChange}
                onComment={onComment}
                currentUserId={currentUserId}
              />
            </div>
          );
        },
        enableSorting: false,
      },
      {
        id: "actions",
        enableHiding: false,
        cell: ({ row }) => {
          const request = row.original;
          // Use helper functions to determine request type
          const isConfirmation = isConfirmationRequest(request);
          const isBulk = isBulkConfirmationRequest(request);
          const isRegular = !isConfirmation;

          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => {
                  // Pass the request object directly to ensure correct identification
                  onViewDetails(request.id, request);
                }}>
                  View Details
                </DropdownMenuItem>
                {/* Confirmation requests (bulk or single) may have PDFs */}
                {isConfirmation && (
                  <DropdownMenuItem onClick={() => onDownloadPDF(request.id, isBulk)}>
                    Download PDF
                  </DropdownMenuItem>
                )}
                {/* Regular certificate requests may have PDFs */}
                {isRegular && (
                  <DropdownMenuItem onClick={() => onDownloadPDF(request.id, false)}>
                    Download PDF
                  </DropdownMenuItem>
                )}
                {/* Individual confirmations don't have PDFs - they're part of bulk confirmation PDF */}
                {request.status === "paid" && (
                  <DropdownMenuItem onClick={() => onBeginProcess(request.id)}>
                    Begin Process
                  </DropdownMenuItem>
                )}
                {request.status === "in_process" && (
                  <DropdownMenuItem onClick={() => onSendToDispatch(request.id)}>
                    Send to Dispatch
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onUpdateNotes(request)}>
                  Update Notes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      requestTypeFilters,
      priorityFilter,
      serviceTypeFilter,
      assignedToFilter,
      myTicketsOnly,
      currentUserId,
      onRequestTypeFilterChange,
      onPriorityFilterChange,
      onServiceTypeFilterChange,
      onAssignedToFilterChange,
      onMyTicketsOnlyChange,
      onViewDetails,
      onDownloadPDF,
      onBeginProcess,
      onSendToDispatch,
      onUpdateNotes,
      onAssign,
      onUnassign,
      onPriorityChange,
      onComment,
      onRowClick,
    ]
  );

  // Filter data based on search and filters
  const filteredData = React.useMemo(() => {
    return data.filter((request) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        // Determine request type for search
        const anyReq = request as any;
        const isBulk = anyReq?._type === "bulk_confirmation" || !!anyReq?.bulk_request_number;
        const isIndividual = anyReq?._type === "individual_confirmation";

        let matchesSearch = false;

        if (isBulk) {
          const bulkRequest = request as BulkCertificateConfirmationResponse;
          matchesSearch =
            (bulkRequest.bulk_request_number?.toLowerCase().includes(query) ?? false) ||
            (bulkRequest.contact_phone?.toLowerCase().includes(query) ?? false) ||
            (bulkRequest.contact_email?.toLowerCase().includes(query) ?? false);
        } else if (isIndividual) {
          const individualRequest = request as any;
          matchesSearch =
            (individualRequest.request_number?.toLowerCase().includes(query) ?? false) ||
            (individualRequest.candidate_name?.toLowerCase().includes(query) ?? false) ||
            (individualRequest.candidate_index_number?.toLowerCase().includes(query) ?? false) ||
            (individualRequest.school_name?.toLowerCase().includes(query) ?? false);
        } else {
          // Regular certificate request
          const regularRequest = request as CertificateRequestResponse;
          matchesSearch =
            (regularRequest.request_number?.toLowerCase().includes(query) ?? false) ||
            (regularRequest.national_id_number?.toLowerCase().includes(query) ?? false);
        }

        if (!matchesSearch) return false;
      }

      // Request type filter
      if (requestTypeFilters.size > 0) {
        const requestType = (request as any).request_type;
        if (requestType && !requestTypeFilters.has(requestType)) {
          return false;
        }
      }

      return true;
    });
  }, [data, searchQuery, requestTypeFilters]);

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search by request number, index, ID... (Ctrl+K)"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="max-w-sm"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
              Columns <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                );
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="group cursor-pointer hover:bg-muted/50"
                  data-state={row.getIsSelected() && "selected"}
                  onClick={(e) => {
                    // Don't trigger row click if clicking on interactive elements
                    const target = e.target as HTMLElement;
                    if (
                      target.closest("button") ||
                      target.closest("input") ||
                      target.closest("[role='menuitem']") ||
                      target.closest("[role='option']")
                    ) {
                      return;
                    }
                    onRowClick?.(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getAllColumns().length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
