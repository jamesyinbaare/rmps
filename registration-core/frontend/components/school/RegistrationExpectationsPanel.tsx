"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getSchoolExamExpectations,
  updateSchoolExamExpectations,
} from "@/lib/api";
import type { SchoolExamExpectations } from "@/types";
import { Skeleton } from "@/components/ui/skeleton";
import { ExamRegistrationPulse } from "@/components/school/ExamRegistrationPulse";
import { ExpectationsEditDialog } from "@/components/school/ExpectationsEditDialog";
import { ExpectationsProgrammeWorkbench } from "@/components/school/ExpectationsProgrammeWorkbench";
import { cn } from "@/lib/utils";

interface RegistrationExpectationsPanelProps {
  examId: number;
  onUpdated?: (data: SchoolExamExpectations) => void;
  className?: string;
}

/** Standalone expectations block (pulse + programme table). Prefer ExamRegistrationWorkspace on the hub. */
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
    return <Skeleton className={cn("h-24 w-full rounded-lg", className)} />;
  }

  if (!data) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <ExamRegistrationPulse
        data={data}
        onEdit={data.can_edit ? () => setDialogOpen(true) : undefined}
      />
      <div className="rounded-lg border border-border bg-card">
        <ExpectationsProgrammeWorkbench
          data={data}
          onEdit={() => setDialogOpen(true)}
        />
      </div>
      <ExpectationsEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        data={data}
        saving={saving}
        onSave={handleSave}
        onClear={handleClear}
      />
    </div>
  );
}
