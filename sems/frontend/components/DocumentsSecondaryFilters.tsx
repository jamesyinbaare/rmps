"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllSubjects } from "@/lib/api";
import type {
  SheetReassignmentFilter,
  Subject,
  SubjectChangedSubjectScope,
} from "@/types/document";
import { cn } from "@/lib/utils";

interface DocumentsSecondaryFiltersProps {
  testType?: string;
  /** When set to paired/missing_*, Paper (test_type) is implied by the pair filter. */
  paperPair?: "paired" | "missing" | "missing_1" | "missing_2";
  sheetReassignment?: SheetReassignmentFilter;
  subjectChangedSubjectIds?: number[];
  subjectChangedSubjectScope?: SubjectChangedSubjectScope;
  recentActive: boolean;
  onTestTypeChange: (value: string | undefined) => void;
  onSheetReassignmentChange: (value: SheetReassignmentFilter | undefined) => void;
  onSubjectChangedSubjectIdsChange: (ids: number[]) => void;
  onSubjectChangedSubjectScopeChange: (scope: SubjectChangedSubjectScope) => void;
  onRecentToggle: () => void;
  onClear: () => void;
}

export function DocumentsSecondaryFilters({
  testType,
  paperPair,
  sheetReassignment,
  subjectChangedSubjectIds = [],
  subjectChangedSubjectScope = "either",
  recentActive,
  onTestTypeChange,
  onSheetReassignmentChange,
  onSubjectChangedSubjectIdsChange,
  onSubjectChangedSubjectScopeChange,
  onRecentToggle,
  onClear,
}: DocumentsSecondaryFiltersProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [subjectSearch, setSubjectSearch] = useState("");

  const paperImpliedByPair =
    paperPair === "paired" ||
    paperPair === "missing_1" ||
    paperPair === "missing_2";

  useEffect(() => {
    let cancelled = false;
    async function loadSubjects() {
      setSubjectsLoading(true);
      try {
        const allSubjects = await getAllSubjects();
        if (!cancelled) {
          setSubjects(allSubjects);
        }
      } catch (error) {
        console.error("Failed to load subjects:", error);
      } finally {
        if (!cancelled) {
          setSubjectsLoading(false);
        }
      }
    }
    void loadSubjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSubjects = useMemo(() => {
    if (!subjectSearch.trim()) return subjects;
    const query = subjectSearch.trim().toLowerCase();
    return subjects.filter(
      (subject) =>
        subject.name.toLowerCase().includes(query) ||
        subject.code.toLowerCase().includes(query)
    );
  }, [subjects, subjectSearch]);

  const subjectPickerLabel = useMemo(() => {
    if (subjectChangedSubjectIds.length === 0) {
      return "All subjects";
    }
    if (subjectChangedSubjectIds.length === 1) {
      const subject = subjects.find((item) => item.id === subjectChangedSubjectIds[0]);
      return subject ? `${subject.code} - ${subject.name}` : "1 subject";
    }
    return `${subjectChangedSubjectIds.length} subjects`;
  }, [subjectChangedSubjectIds, subjects]);

  const subjectScopeLabel = useMemo(() => {
    if (subjectChangedSubjectScope === "current") return "Current subject";
    if (subjectChangedSubjectScope === "prior") return "Prior subject";
    return "Current or prior";
  }, [subjectChangedSubjectScope]);

  const activeCount =
    (!paperImpliedByPair && testType ? 1 : 0) +
    (sheetReassignment ? 1 : 0) +
    (sheetReassignment === "subject" && subjectChangedSubjectIds.length > 0 ? 1 : 0) +
    (sheetReassignment === "subject" && subjectChangedSubjectScope !== "either" ? 1 : 0) +
    (recentActive ? 1 : 0);

  const toggleSubject = (subjectId: number, checked: boolean) => {
    if (checked) {
      if (subjectChangedSubjectIds.includes(subjectId)) return;
      onSubjectChangedSubjectIdsChange([...subjectChangedSubjectIds, subjectId]);
      return;
    }
    onSubjectChangedSubjectIdsChange(
      subjectChangedSubjectIds.filter((id) => id !== subjectId)
    );
  };

  const paperHint =
    paperPair === "paired"
      ? "Papers already limits to Objectives (one row per pair)."
      : paperPair === "missing_1"
        ? "Papers already shows Objectives-only sheets."
        : paperPair === "missing_2"
          ? "Papers already shows Essay-only sheets."
          : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={activeCount > 0 ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          aria-label={
            activeCount > 0
              ? `More filters, ${activeCount} active`
              : "More filters"
          }
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span
              className={cn(
                "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background"
              )}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">More filters</p>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onClear}
            >
              Clear
            </Button>
          )}
        </div>

        {paperImpliedByPair ? (
          <p className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
            {paperHint}
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="documents-paper-filter" className="text-xs text-muted-foreground">
              Paper
            </Label>
            <Select
              value={testType ?? "all"}
              onValueChange={(value) =>
                onTestTypeChange(value === "all" ? undefined : value)
              }
            >
              <SelectTrigger id="documents-paper-filter" size="sm" className="h-8 w-full">
                <SelectValue placeholder="Paper" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All papers</SelectItem>
                <SelectItem value="1">Objectives</SelectItem>
                <SelectItem value="2">Essay</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="documents-reassignment-filter" className="text-xs text-muted-foreground">
            Reassigned
          </Label>
          <Select
            value={sheetReassignment ?? "none"}
            onValueChange={(value) =>
              onSheetReassignmentChange(
                value === "none" ? undefined : (value as SheetReassignmentFilter)
              )
            }
          >
            <SelectTrigger id="documents-reassignment-filter" size="sm" className="h-8 w-full">
              <SelectValue placeholder="Reassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All sheets</SelectItem>
              <SelectItem value="all">All reassigned</SelectItem>
              <SelectItem value="subject">Subject changed</SelectItem>
              <SelectItem value="paper">Paper changed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sheetReassignment === "subject" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="documents-subject-changed-scope"
                className="text-xs text-muted-foreground"
              >
                Match subject as
              </Label>
              <Select
                value={subjectChangedSubjectScope}
                onValueChange={(value) =>
                  onSubjectChangedSubjectScopeChange(value as SubjectChangedSubjectScope)
                }
              >
                <SelectTrigger
                  id="documents-subject-changed-scope"
                  size="sm"
                  className="h-8 w-full"
                >
                  <SelectValue placeholder="Match subject as" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="either">Current or prior</SelectItem>
                  <SelectItem value="current">Current subject</SelectItem>
                  <SelectItem value="prior">Prior subject</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="documents-subject-changed-filter" className="text-xs text-muted-foreground">
                Subjects ({subjectScopeLabel.toLowerCase()})
              </Label>
            <Popover open={subjectPickerOpen} onOpenChange={setSubjectPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="documents-subject-changed-filter"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-between font-normal"
                  disabled={subjectsLoading}
                >
                  <span className="truncate">{subjectPickerLabel}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                <Input
                  value={subjectSearch}
                  onChange={(event) => setSubjectSearch(event.target.value)}
                  placeholder="Search subjects..."
                  className="mb-2 h-8"
                />
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {filteredSubjects.length === 0 ? (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No subjects found</p>
                  ) : (
                    filteredSubjects.map((subject) => {
                      const checked = subjectChangedSubjectIds.includes(subject.id);
                      return (
                        <label
                          key={subject.id}
                          className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) =>
                              toggleSubject(subject.id, value === true)
                            }
                          />
                          <span className="truncate">
                            {subject.code} - {subject.name}
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
                {subjectChangedSubjectIds.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-7 w-full text-xs"
                    onClick={() => onSubjectChangedSubjectIdsChange([])}
                  >
                    Clear subjects
                  </Button>
                ) : null}
              </PopoverContent>
            </Popover>
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Quick toggles</p>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant={recentActive ? "secondary" : "outline"}
              size="sm"
              className="h-8"
              onClick={onRecentToggle}
            >
              Recents
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
