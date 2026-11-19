"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Plus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { OpenLateRegistrationDialog } from "@/components/admin/OpenLateRegistrationDialog";
import { listLateRegistrationWindows, revokeLateRegistrationWindow } from "@/lib/api";
import type { LateRegistrationWindow } from "@/types";

interface LateRegistrationWindowsSectionProps {
  examId: number;
}

function formatUntil(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function windowStatus(window: LateRegistrationWindow): {
  label: string;
  className: string;
} {
  const now = new Date();
  const start = new Date(window.starts_at);
  const end = new Date(window.ends_at);
  if (!window.is_active) {
    return { label: "Revoked", className: "bg-muted text-muted-foreground" };
  }
  if (now < start) {
    return {
      label: "Upcoming",
      className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    };
  }
  if (now > end) {
    return { label: "Ended", className: "bg-muted text-muted-foreground" };
  }
  return {
    label: "Active",
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  };
}

export function LateRegistrationWindowsSection({ examId }: LateRegistrationWindowsSectionProps) {
  const [windows, setWindows] = useState<LateRegistrationWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listLateRegistrationWindows(examId);
      setWindows(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load late registration windows");
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (windowId: number) => {
    setRevokingId(windowId);
    try {
      await revokeLateRegistrationWindow(examId, windowId);
      toast.success("Late registration window revoked");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke window");
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="mt-6 border-t border-border pt-5">
      <SectionLabel
        action={
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Open late registration
          </Button>
        }
      >
        Late registration
      </SectionLabel>
      <p className="mb-3 text-sm text-muted-foreground">
        Temporary windows after the main period ends. Does not change the historical end date.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : windows.length === 0 ? (
        <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
          <div className="rounded-full bg-muted p-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No late registration windows</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Open one for all eligible schools or a selected subset.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {windows.map((window) => {
            const status = windowStatus(window);
            const scope = window.applies_to_all_eligible
              ? "All eligible schools"
              : `${window.school_count} school${window.school_count === 1 ? "" : "s"}`;
            return (
              <div
                key={window.id}
                className="flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">
                      {scope} · until {formatUntil(window.ends_at)}
                    </p>
                    <Badge variant="secondary" className={status.className}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starts {formatUntil(window.starts_at)}
                    {window.note ? ` · ${window.note}` : ""}
                  </p>
                  {!window.applies_to_all_eligible && window.schools.length > 0 ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {window.schools.map((s) => s.school_code).join(", ")}
                    </p>
                  ) : null}
                </div>
                {window.is_active && status.label !== "Ended" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={revokingId === window.id}
                    onClick={() => handleRevoke(window.id)}
                  >
                    {revokingId === window.id ? "Revoking…" : "Revoke"}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <OpenLateRegistrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        examId={examId}
        onSuccess={load}
      />
    </div>
  );
}
