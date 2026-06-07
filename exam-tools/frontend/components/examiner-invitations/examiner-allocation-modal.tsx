"use client";

import { useEffect, useState } from "react";

import { AdminUserModalShell } from "@/components/admin-user-modal-shell";
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

function blockTitle(block: ExaminerPublicScriptsAllocationBlock): string {
  const paper = block.paper_number != null ? `Paper ${block.paper_number}` : "Paper";
  return `${block.subject_code} — ${paper}`;
}

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
      <div className="space-y-4">
        {blocks.map((block) => (
          <div key={`${block.subject_code}-${block.paper_number}`} className="rounded-lg border border-border p-3">
            <h3 className="text-sm font-semibold">{blockTitle(block)}</h3>
            <p className="text-xs text-muted-foreground">{block.subject_name}</p>
            <ul className="mt-2 space-y-1 text-sm">
              {block.rows.map((row) => (
                <li key={`${row.school_code}-${row.booklet_count}`}>
                  {row.school_name} ({row.school_code}) — {row.booklet_count} booklets
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs font-medium">Total: {block.total_booklets}</p>
          </div>
        ))}
      </div>
    </AdminUserModalShell>
  );
}
