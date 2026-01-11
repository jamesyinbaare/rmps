"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Search, X, ChevronDown, ChevronUp, CheckCircle2, Info } from "lucide-react";
import { listSubjectsForPrivate, type SubjectListItem, listProgrammesForPrivate, getProgrammeSubjectsForPrivate, type ProgrammeListItem } from "@/lib/api";
import type { ProgrammeSubjectRequirements, ProgrammeSubjectResponse } from "@/types";
import { toast } from "sonner";

interface PrivateSubjectSelectionProps {
  programmeId: number | null;
  onProgrammeChange: (programmeId: number | null) => void;
  selectedSubjectIds: number[];
  onSubjectIdsChange: (subjectIds: number[]) => void;
  examSeries?: string;
}

function normalizeExamSeries(examSeries: string | undefined): "NOV/DEC" | "MAY/JUNE" | null {
  if (!examSeries) return null;
  const normalized = examSeries.toUpperCase().replace(/[-\s]/g, "/");
  if (normalized === "NOV/DEC" || normalized.includes("NOVEMBER") || normalized.includes("DECEMBER")) {
    return "NOV/DEC";
  }
  if (normalized === "MAY/JUNE" || normalized.includes("MAY") || normalized.includes("JUNE")) {
    return "MAY/JUNE";
  }
  return null;
}

export function PrivateSubjectSelection({
  programmeId,
  onProgrammeChange,
  selectedSubjectIds,
  onSubjectIdsChange,
  examSeries,
}: PrivateSubjectSelectionProps) {
  const normalizedSeries = normalizeExamSeries(examSeries);
  const isNovDec = normalizedSeries === "NOV/DEC";
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [programmeSubjects, setProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingProgrammeSubjects, setLoadingProgrammeSubjects] = useState(false);

  // Manual subject selection
  const [allSubjects, setAllSubjects] = useState<SubjectListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Collapsible sections state (default to open)
  const [compulsoryCoreOpen, setCompulsoryCoreOpen] = useState(true);
  const [optionalCoreOpen, setOptionalCoreOpen] = useState(true);
  const [electivesOpen, setElectivesOpen] = useState(true);

  // Track previous programme ID to detect changes
  const prevProgrammeIdRef = useRef<number | null>(programmeId);

  // Load programmes on mount
  useEffect(() => {
    loadProgrammes();
  }, []);

  // Clear subjects when programme changes
  useEffect(() => {
    // Skip on initial mount (when prevProgrammeIdRef.current is the same as current)
    if (prevProgrammeIdRef.current !== null && prevProgrammeIdRef.current !== programmeId) {
      // Programme changed - clear all selected subjects
      onSubjectIdsChange([]);
    }
    prevProgrammeIdRef.current = programmeId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId]);

  // Load programme subjects when programme is selected
  useEffect(() => {
    if (programmeId) {
      loadProgrammeSubjects(programmeId);
    } else {
      setProgrammeSubjects(null);
    }
  }, [programmeId]);

  // Load all subjects for manual selection
  useEffect(() => {
    if (!programmeId) {
      loadAllSubjects();
    }
  }, [programmeId]);

  const loadProgrammes = async () => {
    setLoadingProgrammes(true);
    try {
      const programmesData = await listProgrammesForPrivate();
      setProgrammes(programmesData);
    } catch (error) {
      toast.error("Failed to load programmes");
      console.error(error);
    } finally {
      setLoadingProgrammes(false);
    }
  };

  const loadProgrammeSubjects = async (progId: number) => {
    setLoadingProgrammeSubjects(true);
    try {
      const subjects = await getProgrammeSubjectsForPrivate(progId);
      setProgrammeSubjects(subjects);

      // Auto-select compulsory core subjects only for MAY/JUNE
      if (!isNovDec) {
        const autoSelectedIds: number[] = [];
        autoSelectedIds.push(...subjects.compulsory_core.map((s) => s.subject_id));

        // Update selected subjects, keeping any manually selected ones
        const newSelectedIds = [...new Set([...autoSelectedIds, ...selectedSubjectIds])];
        onSubjectIdsChange(newSelectedIds);
      }
    } catch (error) {
      toast.error("Failed to load programme subjects");
      console.error(error);
    } finally {
      setLoadingProgrammeSubjects(false);
    }
  };

  const loadAllSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const subjects = await listSubjectsForPrivate();
      setAllSubjects(subjects);
    } catch (error) {
      toast.error("Failed to load subjects");
      console.error(error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSearchSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const subjects = await listSubjectsForPrivate(searchQuery);
      setAllSubjects(subjects);
    } catch (error) {
      toast.error("Failed to search subjects");
      console.error(error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleProgrammeChange = (value: string) => {
    if (value === "none") {
      onProgrammeChange(null);
      onSubjectIdsChange([]);
    } else {
      onProgrammeChange(parseInt(value));
    }
  };

  const toggleSubject = (subjectId: number) => {
    if (selectedSubjectIds.includes(subjectId)) {
      onSubjectIdsChange(selectedSubjectIds.filter((id) => id !== subjectId));
    } else {
      onSubjectIdsChange([...selectedSubjectIds, subjectId]);
    }
  };

  const handleOptionalGroupChange = (groupSubjects: ProgrammeSubjectResponse[], value: string) => {
    // Remove all subjects from this group first
    const groupSubjectIds = groupSubjects.map((s) => s.subject_id);
    const filteredIds = selectedSubjectIds.filter((id) => !groupSubjectIds.includes(id));

    // For NOV/DEC: allow "none" value to deselect
    if (value === "none") {
      onSubjectIdsChange(filteredIds);
    } else if (value) {
      // Add the newly selected subject
      const selectedSubjectId = parseInt(value);
      onSubjectIdsChange([...filteredIds, selectedSubjectId]);
    }
  };

  const removeSubject = (subjectId: number) => {
    onSubjectIdsChange(selectedSubjectIds.filter((id) => id !== subjectId));
  };

  const getSubjectById = (subjectId: number): SubjectListItem | undefined => {
    if (programmeSubjects) {
      const allProgSubjects = [
        ...programmeSubjects.compulsory_core,
        ...programmeSubjects.electives,
        ...programmeSubjects.optional_core_groups.flatMap((g) => g.subjects),
      ];
      const progSubject = allProgSubjects.find((s) => s.subject_id === subjectId);
      if (progSubject) {
        return {
          id: progSubject.subject_id,
          code: progSubject.subject_code,
          name: progSubject.subject_name,
          subject_type: progSubject.subject_type,
        };
      }
    }
    return allSubjects.find((s) => s.id === subjectId);
  };

  const filteredSubjects = allSubjects.filter((subject) => {
    const matchesSearch =
      !searchQuery ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    if (!programmeSubjects) {
      return null;
    }

    const selectedSet = new Set(selectedSubjectIds);

    const compulsoryCoreSelected = programmeSubjects.compulsory_core.filter((s) =>
      selectedSet.has(s.subject_id)
    ).length;

    const optionalCoreSelected = programmeSubjects.optional_core_groups.reduce((count, group) => {
      const hasSelection = group.subjects.some((s) => selectedSet.has(s.subject_id));
      return count + (hasSelection ? 1 : 0);
    }, 0);

    const electivesSelected = programmeSubjects.electives.filter((s) =>
      selectedSet.has(s.subject_id)
    ).length;

    return {
      compulsoryCore: {
        selected: compulsoryCoreSelected,
        total: programmeSubjects.compulsory_core.length,
      },
      optionalCore: {
        selected: optionalCoreSelected,
        total: programmeSubjects.optional_core_groups.length,
      },
      electives: {
        selected: electivesSelected,
        total: programmeSubjects.electives.length,
      },
      totalSelected: selectedSubjectIds.length,
    };
  }, [programmeSubjects, selectedSubjectIds]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>
          Programme {isNovDec && <span className="text-destructive">*</span>}
          {!isNovDec && " (Optional)"}
        </Label>
        {isNovDec && (
          <p className="text-sm text-muted-foreground">
            Programme selection is required to filter subjects for NOV/DEC exams
          </p>
        )}
        {loadingProgrammes ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading programmes...</span>
          </div>
        ) : (
          <SearchableSelect
            options={
              isNovDec
                ? programmes.map((programme) => ({
                    value: programme.id.toString(),
                    label: `${programme.code} - ${programme.name}`,
                  }))
                : [
                    { value: "none", label: "No Programme (Manual Selection)" },
                    ...programmes.map((programme) => ({
                      value: programme.id.toString(),
                      label: `${programme.code} - ${programme.name}`,
                    })),
                  ]
            }
            value={programmeId?.toString() || (isNovDec ? "" : "none")}
            onValueChange={(value) => {
              if (isNovDec) {
                if (value && value !== undefined) {
                  handleProgrammeChange(parseInt(value));
                }
              } else {
                if (value === "none" || value === undefined) {
                  handleProgrammeChange("none");
                } else {
                  handleProgrammeChange(value);
                }
              }
            }}
            placeholder={isNovDec ? "Select a programme *" : "Select a programme (optional)"}
            searchPlaceholder="Search programmes..."
            emptyMessage="No programmes found"
          />
        )}
      </div>

      {programmeId && programmeSubjects ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Programme Subjects</CardTitle>
              {selectionSummary && (
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Total Selected:</span>
                    <Badge variant="secondary" className="font-semibold">
                      {selectionSummary.totalSelected}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
            {selectionSummary && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                {selectionSummary.compulsoryCore.total > 0 && (
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Compulsory Core:</span>
                    <span className="font-semibold">
                      {selectionSummary.compulsoryCore.selected}/{selectionSummary.compulsoryCore.total}
                    </span>
                  </div>
                )}
                {selectionSummary.optionalCore.total > 0 && (
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Optional Groups:</span>
                    <span className="font-semibold">
                      {selectionSummary.optionalCore.selected}/{selectionSummary.optionalCore.total}
                    </span>
                  </div>
                )}
                {selectionSummary.electives.total > 0 && (
                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                    <span className="text-muted-foreground">Electives:</span>
                    <span className="font-semibold">
                      {selectionSummary.electives.selected}/{selectionSummary.electives.total}
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loadingProgrammeSubjects ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading subjects...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {programmeSubjects.compulsory_core.length > 0 && (
                  <Collapsible open={compulsoryCoreOpen} onOpenChange={setCompulsoryCoreOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Label className="font-semibold cursor-pointer">Compulsory Core Subjects</Label>
                        {selectionSummary && (
                          <Badge variant="outline" className="text-xs">
                            {selectionSummary.compulsoryCore.selected}/{selectionSummary.compulsoryCore.total}
                          </Badge>
                        )}
                      </div>
                      {compulsoryCoreOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2 pl-2">
                      {programmeSubjects.compulsory_core.map((subject) => (
                        <div key={subject.subject_id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedSubjectIds.includes(subject.subject_id)}
                            onCheckedChange={() => toggleSubject(subject.subject_id)}
                          />
                          <Label className="font-normal cursor-pointer">
                            {subject.subject_code} - {subject.subject_name}
                          </Label>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {programmeSubjects.optional_core_groups.length > 0 && (
                  <Collapsible open={optionalCoreOpen} onOpenChange={setOptionalCoreOpen}>
                    <div className="flex items-center gap-2">
                      <CollapsibleTrigger className="flex flex-1 items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <Label className="font-semibold cursor-pointer">Optional Core Subjects</Label>
                          {selectionSummary && (
                            <Badge variant="outline" className="text-xs">
                              {selectionSummary.optionalCore.selected}/{selectionSummary.optionalCore.total}
                            </Badge>
                          )}
                        </div>
                        {optionalCoreOpen ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </CollapsibleTrigger>
                      <Popover>
                        <PopoverTrigger
                          className="text-muted-foreground hover:text-foreground h-auto p-2 border-0 bg-transparent"
                          aria-label="Info about optional core subjects"
                        >
                          <Info className="h-4 w-4" />
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <p className="text-sm">
                            {isNovDec
                              ? "Optional: Select at most one subject from each group (or none). All subjects in optional groups are optional."
                              : "Select exactly one subject from each group. All groups must have a selection."}
                          </p>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <CollapsibleContent className="mt-3 space-y-4">
                      {programmeSubjects.optional_core_groups.map((group) => {
                      // Find which subject from this group is currently selected
                      const selectedInGroup = selectedSubjectIds.find((id) =>
                        group.subjects.some((s) => s.subject_id === id)
                      );
                      const currentValue = selectedInGroup?.toString() || (isNovDec ? "none" : "");
                      return (
                        <div key={group.choice_group_id} className="mt-4 space-y-2 pl-4 border-l-2">
                          <Label className="text-sm font-medium">Choice Group {group.choice_group_id}</Label>
                          <RadioGroup
                            value={currentValue}
                            onValueChange={(value) => {
                              handleOptionalGroupChange(group.subjects, value);
                            }}
                          >
                            {isNovDec && (
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="none" id={`optional-group-${group.choice_group_id}-none`} />
                                <Label
                                  htmlFor={`optional-group-${group.choice_group_id}-none`}
                                  className="font-normal cursor-pointer text-muted-foreground"
                                >
                                  None (No selection)
                                </Label>
                              </div>
                            )}
                            {group.subjects.map((subject) => (
                              <div key={subject.subject_id} className="flex items-center space-x-2">
                                <RadioGroupItem
                                  value={subject.subject_id.toString()}
                                  id={`optional-group-${group.choice_group_id}-${subject.subject_id}`}
                                />
                                <Label
                                  htmlFor={`optional-group-${group.choice_group_id}-${subject.subject_id}`}
                                  className="font-normal cursor-pointer"
                                >
                                  {subject.subject_code} - {subject.subject_name}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      );
                    })}
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {programmeSubjects.electives.length > 0 && (
                  <Collapsible open={electivesOpen} onOpenChange={setElectivesOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Label className="font-semibold cursor-pointer">Elective Subjects</Label>
                        {selectionSummary && (
                          <Badge variant="outline" className="text-xs">
                            {selectionSummary.electives.selected}/{selectionSummary.electives.total}
                          </Badge>
                        )}
                      </div>
                      {electivesOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2 pl-2">
                      {programmeSubjects.electives.map((subject) => (
                        <div key={subject.subject_id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedSubjectIds.includes(subject.subject_id)}
                            onCheckedChange={() => toggleSubject(subject.subject_id)}
                          />
                          <Label className="font-normal cursor-pointer">
                            {subject.subject_code} - {subject.subject_name}
                          </Label>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Manual Subject Selection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search subjects by code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearchSubjects();
                    }
                  }}
                />
                <Button type="button" onClick={handleSearchSubjects} disabled={loadingSubjects}>
                  {loadingSubjects ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {loadingSubjects ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading subjects...</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredSubjects.map((subject) => (
                    <div
                      key={subject.id}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={selectedSubjectIds.includes(subject.id)}
                          onCheckedChange={() => toggleSubject(subject.id)}
                        />
                        <Label className="font-normal">
                          {subject.code} - {subject.name}
                        </Label>
                        <Badge variant="outline">{subject.subject_type}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedSubjectIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Selected Subjects ({selectedSubjectIds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {selectedSubjectIds.map((subjectId) => {
                const subject = getSubjectById(subjectId);
                if (!subject) return null;
                return (
                  <Badge key={subjectId} variant="secondary" className="flex items-center gap-1">
                    {subject.code} - {subject.name}
                    <button
                      type="button"
                      onClick={() => removeSubject(subjectId)}
                      className="ml-1 hover:bg-destructive/20 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
