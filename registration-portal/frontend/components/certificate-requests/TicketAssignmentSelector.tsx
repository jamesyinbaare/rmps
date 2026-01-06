"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { User, UserX } from "lucide-react";
import { getCurrentUser, type User as UserType } from "@/lib/api";
import { toast } from "sonner";

interface TicketAssignmentSelectorProps {
  value?: string | null;
  onValueChange: (value: string | null) => void;
  label?: string;
  className?: string;
  showUnassign?: boolean;
}

export function TicketAssignmentSelector({
  value,
  onValueChange,
  label = "Assign To",
  className,
  showUnassign = true,
}: TicketAssignmentSelectorProps) {
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCurrentUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load current user:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCurrentUser();
  }, []);

  // For now, we'll use a simple approach where we can assign to "me" (current user)
  // In a full implementation, you'd fetch a list of all staff users
  const handleUnassign = () => {
    onValueChange(null);
    toast.success("Ticket unassigned");
  };

  const handleAssignToMe = () => {
    if (currentUser) {
      onValueChange(currentUser.id);
      toast.success("Ticket assigned to you");
    }
  };

  return (
    <div className={className}>
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={value || undefined} onValueChange={onValueChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select user...">
              {value === currentUser?.id
                ? `Me (${currentUser.full_name || currentUser.email})`
                : value
                ? `User ID: ${value.substring(0, 8)}...`
                : "Unassigned"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {currentUser && (
              <SelectItem value={currentUser.id}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Me ({currentUser.full_name || currentUser.email})</span>
                </div>
              </SelectItem>
            )}
            {/* In a full implementation, you'd map through a list of users here */}
          </SelectContent>
        </Select>
        {currentUser && !value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAssignToMe}
            title="Assign to me"
          >
            <User className="h-4 w-4" />
          </Button>
        )}
        {showUnassign && value && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleUnassign}
            title="Unassign"
          >
            <UserX className="h-4 w-4" />
          </Button>
        )}
      </div>
      {value && (
        <p className="text-xs text-muted-foreground mt-1">
          {value === currentUser?.id
            ? "Assigned to you"
            : `Assigned to user: ${value.substring(0, 8)}...`}
        </p>
      )}
    </div>
  );
}
