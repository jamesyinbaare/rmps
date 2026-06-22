"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

import { ExaminerScriptsAllocationBlocks } from "@/components/examiner-invitation/examiner-scripts-allocation-blocks";
import { getPublicExaminerScriptsAllocation, type ExaminerPublicScriptsAllocationBlock } from "@/lib/api";

type Props = {
  token: string;
  pendingMessage?: string | null;
};

export function ExaminerScriptsAllocationSection({ token, pendingMessage }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ExaminerPublicScriptsAllocationBlock[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPublicExaminerScriptsAllocation(token);
      setBlocks(data.blocks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load script allocations");
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section
      className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm sm:p-5"
      aria-labelledby="examiner-scripts-allocation-title"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardList className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="examiner-scripts-allocation-title" className="text-base font-semibold text-foreground">
            Scripts allocation
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Your assigned schools and booklet counts for each paper.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-10 rounded-lg bg-muted" />
          <div className="h-24 rounded-lg bg-muted/80" />
        </div>
      ) : error ? (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : blocks.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-muted/10 px-3.5 py-6 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {pendingMessage ??
              "Allocations will appear here once the exam office publishes your script assignments."}
          </p>
        </div>
      ) : (
        <ExaminerScriptsAllocationBlocks blocks={blocks} className="mt-4" />
      )}
    </section>
  );
}
