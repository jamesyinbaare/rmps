"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import {
  getSchoolExamExpectations,
  updateSchoolExamExpectations,
} from "@/lib/api";
import type { SchoolExamExpectations } from "@/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpectationsEditDialog } from "@/components/school/ExpectationsEditDialog";
import { ExpectationsProgressDetail } from "@/components/school/ExpectationsProgressDetail";
import { cn } from "@/lib/utils";

interface RegistrationExpectationsPanelProps {
  examId: number;
  onUpdated?: (data: SchoolExamExpectations) => void;
  className?: string;
}

export function RegistrationExpectationsPanel({
  examId,
  onUpdated,
  className,
}: RegistrationExpectationsPanelProps) {
  const [data, setData] = useState<SchoolExamExpectations | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await getSchoolExamExpectations(examId);
        if (cancelled) return;
        setData(result);
        onUpdated?.(result);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        toast.error("Failed to load expected registration counts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // Intentionally omit onUpdated — parents often pass an inline callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const handleSave = async (payload: {
    expected_total: number | null;
    programmes: { programme_id: number; expected_count: number }[];
  }) => {
    setSaving(true);
    try {
      const result = await updateSchoolExamExpectations(examId, payload);
      setData(result);
      onUpdated?.(result);
      setDialogOpen(false);
      toast.success(
        result.has_declaration
          ? "Expected numbers saved"
          : "Expected numbers cleared"
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save expected numbers"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      const result = await updateSchoolExamExpectations(examId, {
        expected_total: null,
        programmes: [],
      });
      setData(result);
      onUpdated?.(result);
      setDialogOpen(false);
      toast.success("Expected numbers cleared");
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to clear expected numbers"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className={cn("h-36 w-full rounded-lg", className)} />;
  }

  if (!data) return null;

  return (
    <>
      {data.has_declaration ? (
        <ExpectationsProgressDetail
          data={data}
          canEdit={data.can_edit}
          onEdit={() => setDialogOpen(true)}
          className={className}
        />
      ) : (
        <div
          className={cn(
            "rounded-lg border border-border bg-card p-5 shadow-none md:p-6",
            className
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-xl space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Target className="h-4 w-4 text-muted-foreground" />
                Expected registrations
              </div>
              <p className="text-sm text-muted-foreground">
                Optionally declare how many candidates you expect to register—
                overall and per programme—so you can track progress and spot
                mismatches early.
              </p>
            </div>
            {data.can_edit && (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                Set expected numbers
              </Button>
            )}
          </div>
        </div>
      )}

      <ExpectationsEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        data={data}
        saving={saving}
        onSave={handleSave}
        onClear={handleClear}
      />
    </>
  );
}
