import type { ExaminerPublicScriptsAllocationBlock } from "@/lib/api";
import { cn } from "@/lib/utils";

function blockTitle(block: ExaminerPublicScriptsAllocationBlock): string {
  const code = block.subject_code.trim();
  const label = code ? `${code} — ${block.subject_name}` : block.subject_name;
  return `Paper ${block.paper_number}: ${label}`;
}

type Props = {
  blocks: ExaminerPublicScriptsAllocationBlock[];
  className?: string;
};

export function ExaminerScriptsAllocationBlocks({ blocks, className }: Props) {
  return (
    <div className={cn("space-y-5", className)}>
      {blocks.map((block) => (
        <div
          key={`${block.paper_number}-${block.subject_code}`}
          className="overflow-hidden rounded-xl border border-border/70"
        >
          <div className="border-b border-border/60 bg-muted/25 px-3 py-2.5 sm:px-4">
            <p className="text-sm font-semibold text-foreground">{blockTitle(block)}</p>
            <p className="text-xs text-muted-foreground">
              Total: {block.total_booklets.toLocaleString()} booklet{block.total_booklets === 1 ? "" : "s"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/15 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold sm:px-4">School</th>
                  <th className="px-3 py-2 text-right font-semibold sm:px-4">Env #</th>
                  <th className="px-3 py-2 text-right font-semibold sm:px-4">Series</th>
                  <th className="px-3 py-2 text-right font-semibold sm:px-4">Booklets</th>
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr
                    key={`${row.school_code}-${row.envelope_number}-${row.series_number}`}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-3 py-2.5 sm:px-4">
                      <span className="font-medium text-foreground">{row.school_code}</span>
                      <span className="text-muted-foreground"> — {row.school_name}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">{row.envelope_number}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">{row.series_number}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                      {row.booklet_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-muted/15 font-semibold text-foreground">
                  <td className="px-3 py-2.5 sm:px-4" colSpan={3}>
                    Total booklets
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                    {block.total_booklets.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
