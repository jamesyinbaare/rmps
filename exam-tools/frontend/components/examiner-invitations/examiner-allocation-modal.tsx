"use client";

import { useEffect, useState } from "react";

import { AdminUserModalShell } from "@/components/admin-user-modal-shell";
import { ExaminerScriptsAllocationBlocks } from "@/components/examiner-invitation/examiner-scripts-allocation-blocks";
import {
  getSubjectOfficerExaminerScriptsAllocation,
  type ExaminerPublicScriptsAllocationBlock,
} from "@/lib/api";

type Props = {
  open: boolean;
  onClose: () => void;
  examinationId: number | null;
  subjectId: number | null;
  examinerId: string | null;
  examinerName: string;
};

export function ExaminerAllocationModal({
  open,
  onClose,
  examinationId,
  subjectId,
  examinerId,
  examinerName,
}: Props) {
  const [blocks, setBlocks] = useState<ExaminerPublicScriptsAllocationBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || examinationId == null || subjectId == null || examinerId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getSubjectOfficerExaminerScriptsAllocation(examinationId, examinerId, subjectId)
      .then((data) => {
        if (!cancelled) setBlocks(data.blocks);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load allocation");
          setBlocks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, examinationId, subjectId, examinerId]);

  return (
    <AdminUserModalShell
      open={open}
      onClose={onClose}
      title="Scripts allocation"
      description={`Allocation summary for ${examinerName}.`}
    >
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error && blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published allocation yet.</p>
      ) : null}
      {blocks.length > 0 ? <ExaminerScriptsAllocationBlocks blocks={blocks} /> : null}
    </AdminUserModalShell>
  );
}
