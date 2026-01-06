"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  User,
  MessageSquare,
  Flag,
  MoreVertical,
  Send,
  X,
} from "lucide-react";
import { PrioritySelector } from "./PrioritySelector";
import { TicketAssignmentSelector } from "./TicketAssignmentSelector";
import type { CertificateRequestResponse } from "@/lib/api";

interface QuickActionsProps {
  request: CertificateRequestResponse;
  onAssign?: (requestId: number, userId: string) => void;
  onUnassign?: (requestId: number) => void;
  onPriorityChange?: (requestId: number, priority: "low" | "medium" | "high" | "urgent") => void;
  onComment?: (requestId: number, comment: string) => void;
  currentUserId?: string;
}

export function QuickActions({
  request,
  onAssign,
  onUnassign,
  onPriorityChange,
  onComment,
  currentUserId,
}: QuickActionsProps) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");

  const handleCommentSubmit = () => {
    if (comment.trim() && onComment) {
      onComment(request.id, comment.trim());
      setComment("");
      setCommentOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Quick Assign */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Quick Assign"
          >
            <User className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="start">
          <div className="space-y-2">
            <Label>Assign Ticket</Label>
            <TicketAssignmentSelector
              value={request.assigned_to_user_id || null}
              onValueChange={(value) => {
                if (value && onAssign) {
                  onAssign(request.id, value);
                } else if (!value && onUnassign) {
                  onUnassign(request.id);
                }
              }}
              label=""
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick Priority */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Change Priority"
          >
            <Flag className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48" align="start">
          <div className="space-y-2">
            <Label>Priority</Label>
            <PrioritySelector
              value={request.priority}
              onValueChange={(value) => {
                if (onPriorityChange) {
                  onPriorityChange(request.id, value);
                }
              }}
              label=""
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Quick Comment */}
      <Popover open={commentOpen} onOpenChange={setCommentOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Add Comment"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Add Comment</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setCommentOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter your comment..."
              rows={4}
              className="resize-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setComment("");
                  setCommentOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCommentSubmit}
                disabled={!comment.trim()}
              >
                <Send className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* More Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="More Actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Quick Actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {/* Additional quick actions can be added here */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
