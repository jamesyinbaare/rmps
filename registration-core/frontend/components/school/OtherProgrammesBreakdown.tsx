"use client";

import { Info } from "lucide-react";
import type { ProgrammeExpectationProgress } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function programmesWithRegistrationsNoTarget(
  programmes: ProgrammeExpectationProgress[]
): ProgrammeExpectationProgress[] {
  return programmes
    .filter((p) => p.expected_count == null && p.actual_count > 0)
    .sort(
      (a, b) =>
        b.actual_count - a.actual_count ||
        a.name.localeCompare(b.name) ||
        a.code.localeCompare(b.code)
    );
}

interface OtherProgrammesBreakdownProps {
  programmes: ProgrammeExpectationProgress[];
  /** When true, copy frames this as “no target” under a declaration. */
  undeclaredMode?: boolean;
  canEdit?: boolean;
  onAddTargets?: () => void;
  className?: string;
}

export function OtherProgrammesBreakdown({
  programmes,
  undeclaredMode = true,
  canEdit = false,
  onAddTargets,
  className,
}: OtherProgrammesBreakdownProps) {
  if (programmes.length === 0) return null;

  const candidateTotal = programmes.reduce((sum, p) => sum + p.actual_count, 0);
  const title = undeclaredMode
    ? "Other programmes (no target)"
    : "Registered by programme";
  const callout = undeclaredMode
    ? `${candidateTotal.toLocaleString()} candidate${
        candidateTotal === 1 ? "" : "s"
      } on ${programmes.length} programme${
        programmes.length === 1 ? "" : "s"
      } without a target`
    : `${candidateTotal.toLocaleString()} registered across ${
        programmes.length
      } programme${programmes.length === 1 ? "" : "s"}`;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{callout}</span>
          </p>
        </div>
        {canEdit && onAddTargets && (
          <Button type="button" variant="ghost" size="sm" onClick={onAddTargets}>
            Add targets
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Programme</TableHead>
              <TableHead className="w-[120px] text-right">Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {programmes.map((p) => (
              <TableRow key={p.programme_id}>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {p.code}
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {p.actual_count.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
