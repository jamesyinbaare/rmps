"use client";

import { useState, useEffect, useMemo } from "react";
import { getTicketActivities, type TicketActivityResponse } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, User, ArrowRight, FileText, Settings, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return date.toLocaleDateString();
}

interface TicketActivityFeedProps {
  ticketId: number;
  limit?: number;
}

export function TicketActivityFeed({ ticketId, limit = 50 }: TicketActivityFeedProps) {
  const [activities, setActivities] = useState<TicketActivityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadActivities = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getTicketActivities(ticketId, limit);
        setActivities(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load activities");
        console.error("Error loading activities:", err);
      } finally {
        setLoading(false);
      }
    };

    loadActivities();
  }, [ticketId, limit]);

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "comment":
        return <MessageSquare className="h-4 w-4" />;
      case "assignment":
        return <User className="h-4 w-4" />;
      case "status_change":
        return <ArrowRight className="h-4 w-4" />;
      case "note":
        return <FileText className="h-4 w-4" />;
      case "system":
        return <Settings className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  const getActivityBadgeVariant = (type: string) => {
    switch (type) {
      case "comment":
        return "default";
      case "assignment":
        return "secondary";
      case "status_change":
        return "outline";
      case "note":
        return "default";
      case "system":
        return "secondary";
      default:
        return "default";
    }
  };

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter((activity) => {
      // Filter by type
      if (activityTypeFilter !== "all" && activity.activity_type !== activityTypeFilter) {
        return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          activity.comment?.toLowerCase().includes(query) ||
          activity.user_name?.toLowerCase().includes(query) ||
          activity.old_status?.toLowerCase().includes(query) ||
          activity.new_status?.toLowerCase().includes(query) ||
          activity.old_assigned_to?.toLowerCase().includes(query) ||
          activity.new_assigned_to?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [activities, activityTypeFilter, searchQuery]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Activity Feed</CardTitle>
            <CardDescription>Recent activity and comments for this ticket</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="comment">Comments</SelectItem>
              <SelectItem value="status_change">Status Changes</SelectItem>
              <SelectItem value="assignment">Assignments</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No activities yet
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No activities match your filters
          </div>
        ) : (
          <div className="space-y-4">
            {filteredActivities.map((activity) => (
              <div key={activity.id} className="flex gap-3 pb-4 border-b last:border-0">
                <div className="flex-shrink-0 mt-1">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getActivityBadgeVariant(activity.activity_type)}>
                          {activity.activity_type.replace(/_/g, " ")}
                        </Badge>
                        {activity.user_name && (
                          <span className="text-sm font-medium">{activity.user_name}</span>
                        )}
                        {!activity.user_name && activity.activity_type === "system" && (
                          <span className="text-sm text-muted-foreground">System</span>
                        )}
                      </div>
                      {activity.comment && (
                        <p className="text-sm text-foreground mt-1">{activity.comment}</p>
                      )}
                      {activity.activity_type === "status_change" && activity.old_status && activity.new_status && (
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <Badge variant="outline" className="text-xs">
                            {activity.old_status.replace(/_/g, " ")}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="default" className="text-xs">
                            {activity.new_status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      )}
                      {activity.activity_type === "assignment" && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          {activity.old_assigned_to && activity.new_assigned_to ? (
                            <>Reassigned to {activity.new_assigned_to}</>
                          ) : activity.new_assigned_to ? (
                            <>Assigned to {activity.new_assigned_to}</>
                          ) : (
                            <>Unassigned</>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(new Date(activity.created_at))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
