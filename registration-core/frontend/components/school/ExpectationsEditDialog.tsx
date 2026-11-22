"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type {
  ProgrammeExpectationProgress,
  SchoolExamExpectations,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type CountFilter = "all" | "with" | "empty";

interface ExpectationsEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: SchoolExamExpectations;
  saving: boolean;
  onSave: (payload: {
    expected_total: number | null;
    programmes: { programme_id: number; expected_count: number }[];
  }) => Promise<void>;
  onClear: () => Promise<void>;
}

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function ExpectationsEditDialog({
  open,
  onOpenChange,
  data,
  saving,
  onSave,
  onClear,
}: ExpectationsEditDialogProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [totalInput, setTotalInput] = useState("");
  const [programmeInputs, setProgrammeInputs] = useState<Record<number, string>>(
    {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [countFilter, setCountFilter] = useState<CountFilter>("all");

  useEffect(() => {
    if (!open) return;
    setTotalInput(
      data.expected_total != null ? String(data.expected_total) : ""
    );
    const next: Record<number, string> = {};
    for (const p of data.programmes) {
      next[p.programme_id] =
        p.expected_count != null ? String(p.expected_count) : "";
    }
    setProgrammeInputs(next);
    setSearchQuery("");
    setCountFilter("all");
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open, data]);

  const programmeSum = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    for (const value of Object.values(programmeInputs)) {
      const n = parsePositiveInt(value);
      if (n == null) continue;
      hasAny = true;
      sum += n;
    }
    return hasAny ? sum : null;
  }, [programmeInputs]);

  const parsedTotal = useMemo(
    () => parsePositiveInt(totalInput),
    [totalInput]
  );

  const setCount = useMemo(
    () =>
      Object.values(programmeInputs).filter((v) => parsePositiveInt(v) != null)
        .length,
    [programmeInputs]
  );

  const sumMismatch =
    parsedTotal != null &&
    programmeSum != null &&
    parsedTotal !== programmeSum;

  const filteredProgrammes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.programmes.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const hasCount =
        parsePositiveInt(programmeInputs[p.programme_id] ?? "") != null;
      if (countFilter === "with") return hasCount;
      if (countFilter === "empty") return !hasCount;
      return true;
    });
  }, [data.programmes, searchQuery, countFilter, programmeInputs]);

  const handleSave = async () => {
    if (sumMismatch) return;
    if (totalInput.trim() && parsedTotal == null) return;

    const programmes = Object.entries(programmeInputs)
      .map(([id, value]) => {
        const n = parsePositiveInt(value);
        if (n == null) return null;
        return { programme_id: parseInt(id, 10), expected_count: n };
      })
      .filter(
        (row): row is { programme_id: number; expected_count: number } =>
          Boolean(row)
      );

    await onSave({
      expected_total: parsedTotal,
      programmes,
    });
  };

  const chips: { value: CountFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "with", label: "With counts" },
    { value: "empty", label: "Empty" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-6 py-5 text-left">
          <DialogTitle>Expected registration numbers</DialogTitle>
          <DialogDescription>
            Optional. Search programmes and set counts to track progress. Does
            not block registration.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="expected-total">Overall expected total</Label>
              <Input
                id="expected-total"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="e.g. 120"
                value={totalInput}
                onChange={(e) => setTotalInput(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={programmeSum == null}
              onClick={() => {
                if (programmeSum != null) setTotalInput(String(programmeSum));
              }}
            >
              Use programme sum
            </Button>
          </div>

          {data.programmes.length > 0 && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search programmes by name or code…"
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {chips.map((chip) => (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => setCountFilter(chip.value)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-xs transition-colors",
                        countFilter === chip.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                {filteredProgrammes.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    No programmes match your search or filter.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {filteredProgrammes.map((p: ProgrammeExpectationProgress) => (
                      <li
                        key={p.programme_id}
                        className="grid grid-cols-[1fr_96px] items-center gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {p.name}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {p.code}
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          placeholder="—"
                          aria-label={`Expected count for ${p.code}`}
                          value={programmeInputs[p.programme_id] ?? ""}
                          onChange={(e) =>
                            setProgrammeInputs((prev) => ({
                              ...prev,
                              [p.programme_id]: e.target.value,
                            }))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-border bg-muted/20 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="font-mono font-medium text-foreground">
                {setCount}
              </span>{" "}
              programme{setCount === 1 ? "" : "s"} set
            </span>
            <span className="text-border">·</span>
            <span>
              Sum{" "}
              <span className="font-mono font-medium text-foreground">
                {programmeSum?.toLocaleString() ?? "—"}
              </span>
              {" / "}
              total{" "}
              <span className="font-mono font-medium text-foreground">
                {parsedTotal?.toLocaleString() ?? "—"}
              </span>
            </span>
            {sumMismatch && (
              <span className="text-amber-700 dark:text-amber-300">
                Sum must equal overall total
              </span>
            )}
            {totalInput.trim() && parsedTotal == null && (
              <span className="text-amber-700 dark:text-amber-300">
                Total must be a whole number ≥ 1
              </span>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="ghost"
              disabled={saving || !data.has_declaration}
              onClick={() => onClear()}
            >
              Clear
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  saving ||
                  sumMismatch ||
                  Boolean(totalInput.trim() && parsedTotal == null)
                }
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
