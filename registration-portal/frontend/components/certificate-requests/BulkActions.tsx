"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, MessageSquare, Flag, X } from "lucide-react";
import { PrioritySelector } from "./PrioritySelector";
import { TicketAssignmentSelector } from "./TicketAssignmentSelector";

interface BulkActionsProps {
  selectedCount: number;
  onBulkAssign?: (userIds: string[]) => void;
  onBulkPriorityChange?: (priority: "low" | "medium" | "high" | "urgent") => void;
  onBulkComment?: (comment: string) => void;
  onClearSelection?: () => void;
}

export function BulkActions({
  selectedCount,
  onBulkAssign,
  onBulkPriorityChange,
  onBulkComment,
  onClearSelection,
}: BulkActionsProps) {
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [commentDialogOpen, setCommentDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<"low" | "medium" | "high" | "urgent" | null>(null);
  const [comment, setComment] = useState("");

  if (selectedCount === 0) return null;

  const handleBulkAssign = () => {
    if (selectedUserId && onBulkAssign) {
      onBulkAssign([selectedUserId]);
      setAssignDialogOpen(false);
      setSelectedUserId(null);
    }
  };

  const handleBulkPriority = () => {
    if (selectedPriority && onBulkPriorityChange) {
      onBulkPriorityChange(selectedPriority);
      setPriorityDialogOpen(false);
      setSelectedPriority(null);
    }
  };

  const handleBulkComment = () => {
    if (comment.trim() && onBulkComment) {
      onBulkComment(comment.trim());
      setCommentDialogOpen(false);
      setComment("");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between p-3 bg-muted rounded-md border">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{selectedCount} selected</Badge>
          <span className="text-sm text-muted-foreground">
            Select an action to apply to all selected tickets
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssignDialogOpen(true)}
          >
            <User className="mr-2 h-4 w-4" />
            Assign
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPriorityDialogOpen(true)}
          >
            <Flag className="mr-2 h-4 w-4" />
            Priority
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCommentDialogOpen(true)}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Comment
          </Button>
          {onClearSelection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
            >
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Assign Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Assign Tickets</DialogTitle>
            <DialogDescription>
              Assign {selectedCount} selected ticket(s) to a user
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Assign To</Label>
              <TicketAssignmentSelector
                value={selectedUserId}
                onValueChange={setSelectedUserId}
                label=""
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkAssign} disabled={!selectedUserId}>
              Assign {selectedCount} Ticket(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Priority Dialog */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Update Priority</DialogTitle>
            <DialogDescription>
              Update priority for {selectedCount} selected ticket(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Priority</Label>
              <PrioritySelector
                value={selectedPriority || "medium"}
                onValueChange={(value) => setSelectedPriority(value)}
                label=""
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriorityDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkPriority} disabled={!selectedPriority}>
              Update {selectedCount} Ticket(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Comment Dialog */}
      <Dialog open={commentDialogOpen} onOpenChange={setCommentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Add Comment</DialogTitle>
            <DialogDescription>
              Add a comment to {selectedCount} selected ticket(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Comment</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter comment to add to all selected tickets..."
                rows={6}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkComment} disabled={!comment.trim()}>
              Add to {selectedCount} Ticket(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
