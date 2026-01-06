"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Eye, Download, User, Calendar, FileText } from "lucide-react";
import { PriorityBadge } from "./PrioritySelector";
import { WorkflowProgress } from "./WorkflowProgress";
import type { CertificateRequestResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

interface QuickPreviewProps {
  request: CertificateRequestResponse | null;
  onClose: () => void;
  onViewFull: (requestId: number) => void;
  onDownloadPDF?: (requestId: number) => void;
  currentUserId?: string;
}

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

export function QuickPreview({
  request,
  onClose,
  onViewFull,
  onDownloadPDF,
  currentUserId,
}: QuickPreviewProps) {
  if (!request) return null;

  const isAssignedToMe = request.assigned_to_user_id === currentUserId;

  return (
    <div
      className={cn(
        "fixed right-0 top-0 h-full w-96 shadow-2xl z-50 bg-background border-l transition-transform duration-300",
        request ? "translate-x-0" : "translate-x-full"
      )}
    >
      <Card className="h-full rounded-none border-0 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-lg">Quick Preview</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="overflow-y-auto h-[calc(100%-4rem)] space-y-4">
          {/* Request Number & Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Request #</span>
              <span className="font-mono text-sm">{request.request_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Status</span>
              <Badge variant={getStatusBadgeVariant(request.status)}>
                {request.status.replace(/_/g, " ").toUpperCase()}
              </Badge>
            </div>
          </div>

          {/* Workflow Progress */}
          <div className="pt-2 border-t">
            <WorkflowProgress currentStatus={request.status} />
          </div>

          {/* Priority & Service Type */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div>
              <span className="text-sm font-medium text-muted-foreground">Priority</span>
              <div className="mt-1">
                <PriorityBadge priority={request.priority} />
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-muted-foreground">Service Type</span>
              <div className="mt-1">
                <Badge variant={request.service_type === "express" ? "default" : "outline"}>
                  {request.service_type === "express" ? "Express" : "Standard"}
                </Badge>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Assigned To:</span>
              <span className="text-sm">
                {request.assigned_to_user_id
                  ? isAssignedToMe
                    ? "Me"
                    : `User ${request.assigned_to_user_id.substring(0, 8)}...`
                  : "Unassigned"}
              </span>
            </div>
          </div>

          {/* Request Details */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">Type:</span>
              <span className="capitalize">{request.request_type}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-muted-foreground">Index Number:</span>{" "}
              {request.index_number}
            </div>
            <div className="text-sm">
              <span className="font-medium text-muted-foreground">Exam Year:</span> {request.exam_year}
            </div>
            {request.examination_center_name && (
              <div className="text-sm">
                <span className="font-medium text-muted-foreground">Center:</span>{" "}
                {request.examination_center_name}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">Created:</span>
              <span>{new Date(request.created_at).toLocaleDateString()}</span>
            </div>
            <div className="text-sm">
              <span className="font-medium text-muted-foreground">Updated:</span>{" "}
              {new Date(request.updated_at).toLocaleDateString()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-4 border-t">
            <Button onClick={() => onViewFull(request.id)} className="w-full">
              <Eye className="mr-2 h-4 w-4" />
              View Full Details
            </Button>
            {onDownloadPDF && (
              <Button variant="outline" onClick={() => onDownloadPDF(request.id)} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
