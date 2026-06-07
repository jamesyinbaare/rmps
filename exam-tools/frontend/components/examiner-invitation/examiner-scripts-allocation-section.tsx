"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

import { getPublicExaminerScriptsAllocation, type ExaminerPublicScriptsAllocationBlock } from "@/lib/api";

type Props = {
  token: string;
};

function blockTitle(block: ExaminerPublicScriptsAllocationBlock): string {
  const code = block.subject_code.trim();
  const label = code ? `${code} — ${block.subject_name}` : block.subject_name;
  return `Paper ${block.paper_number}: ${label}`;
}

export function ExaminerScriptsAllocationSection({ token }: Props) {
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
            Allocations will appear here once the exam office publishes your script assignments.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {blocks.map((block) => (
            <div key={`${block.paper_number}-${block.subject_code}`} className="overflow-hidden rounded-xl border border-border/70">
              <div className="border-b border-border/60 bg-muted/25 px-3 py-2.5 sm:px-4">
                <p className="text-sm font-semibold text-foreground">{blockTitle(block)}</p>
                <p className="text-xs text-muted-foreground">
                  Total: {block.total_booklets.toLocaleString()} booklet{block.total_booklets === 1 ? "" : "s"}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[280px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/15 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold sm:px-4">School</th>
                      <th className="px-3 py-2 text-right font-semibold sm:px-4">Booklets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row) => (
                      <tr key={`${row.school_code}-${row.school_name}`} className="border-b border-border/40 last:border-0">
                        <td className="px-3 py-2.5 sm:px-4">
                          <span className="font-medium text-foreground">{row.school_code}</span>
                          <span className="text-muted-foreground"> — {row.school_name}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">{row.booklet_count.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
