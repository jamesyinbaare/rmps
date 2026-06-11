"use client";

import { useMemo, useState } from "react";

import { Search } from "lucide-react";

import { CohortModalShell } from "@/components/cohorts/cohort-modal-shell";
import type { CohortListItem, MembershipExaminer } from "@/components/cohorts/types";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  entityLabel?: string;
  examiners: MembershipExaminer[];
  unassignedIds: Set<string>;
  cohorts: CohortListItem[];
  busy?: boolean;
  onCreateWithSelected: (examinerIds: string[]) => void;
  onAddToCohort: (cohortId: string, examinerIds: string[]) => void;
};

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

export function CohortUnassignedModal({
  open,
  onClose,
  entityLabel = "cohort",
  examiners,
  unassignedIds,
  cohorts,
  busy = false,
  onCreateWithSelected,
  onAddToCohort,
}: Props) {
  const unassigned = useMemo(
    () => examiners.filter((e) => unassignedIds.has(e.id)),
    [examiners, unassignedIds],
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [targetCohortId, setTargetCohortId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unassigned;
    return unassigned.filter((ex) => {
      const haystack = [
        ex.name,
        regionLabel(ex.region),
        EXAMINER_TYPE_LABELS[ex.examiner_type as ExaminerTypeApi],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [search, unassigned]);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((e) => selected[e.id]);

  function toggleAll(checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const ex of filtered) {
        next[ex.id] = checked;
      }
      return next;
    });
  }

  function handleAddToCohort() {
    if (!targetCohortId) {
      setError(`Choose a ${entityLabel} to add examiners to.`);
      return;
    }
    if (selectedIds.length === 0) {
      setError("Select at least one examiner.");
      return;
    }
    setError(null);
    onAddToCohort(targetCohortId, selectedIds);
  }

  function handleCreate() {
    if (selectedIds.length === 0) {
      setError("Select at least one examiner.");
      return;
    }
    setError(null);
    onCreateWithSelected(selectedIds);
  }

  return (
    <CohortModalShell
      open={open}
      onClose={onClose}
      title={`Unassigned examiners (${unassigned.length})`}
      description={`These examiners are not in any ${entityLabel}. Select them to assign or create a new ${entityLabel}.`}
      closeDisabled={busy}
      footer={
        <div className="space-y-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-end gap-3">
            {cohorts.length > 0 ? (
              <div className="min-w-48 flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Add to {entityLabel}
                </label>
                <select
                  className={cn(formInputClass, "h-9")}
                  value={targetCohortId}
                  onChange={(e) => setTargetCohortId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">Select {entityLabel}…</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.examiner_ids.length})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {cohorts.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || selectedIds.length === 0 || !targetCohortId}
                  onClick={handleAddToCohort}
                >
                  Add to {entityLabel}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={busy || selectedIds.length === 0}
                onClick={handleCreate}
              >
                Create {entityLabel} with selected
              </Button>
            </div>
          </div>
        </div>
      }
    >
      {unassigned.length === 0 ? (
        <p className="text-sm text-muted-foreground">All examiners are assigned to a {entityLabel}.</p>
      ) : (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              className={cn(formInputClass, "h-9 pl-9")}
              placeholder="Search examiners…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search unassigned examiners"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No examiners match your search.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
              <div className="max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-[1] bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all visible examiners"
                          checked={allFilteredSelected}
                          onChange={(e) => toggleAll(e.target.checked)}
                          disabled={busy}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Region</TableHead>
                      <TableHead className="hidden md:table-cell">Role</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((ex) => (
                      <TableRow key={ex.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            aria-label={`Select ${ex.name}`}
                            checked={selected[ex.id] ?? false}
                            disabled={busy}
                            onChange={(e) =>
                              setSelected((prev) => ({ ...prev, [ex.id]: e.target.checked }))
                            }
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{ex.name}</TableCell>
                        <TableCell className="hidden text-muted-foreground sm:table-cell">
                          {regionLabel(ex.region)}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {EXAMINER_TYPE_LABELS[ex.examiner_type as ExaminerTypeApi]}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <p className="shrink-0 text-xs text-muted-foreground">
            {selectedIds.length} selected · {filtered.length} shown
          </p>
        </div>
      )}
    </CohortModalShell>
  );
}
