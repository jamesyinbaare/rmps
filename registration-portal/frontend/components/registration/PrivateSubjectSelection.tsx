"use client";

import { useState, useEffect } from "react";
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
import { Loader2, Search, X } from "lucide-react";
import { listSubjectsForPrivate, type SubjectListItem, listProgrammesForPrivate, getProgrammeSubjectsForPrivate, type ProgrammeListItem } from "@/lib/api";
import type { ProgrammeSubjectRequirements, ProgrammeSubjectResponse } from "@/types";
import { toast } from "sonner";

interface PrivateSubjectSelectionProps {
  programmeId: number | null;
  onProgrammeChange: (programmeId: number | null) => void;
  selectedSubjectIds: number[];
  onSubjectIdsChange: (subjectIds: number[]) => void;
}

export function PrivateSubjectSelection({
  programmeId,
  onProgrammeChange,
  selectedSubjectIds,
  onSubjectIdsChange,
}: PrivateSubjectSelectionProps) {
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [programmeSubjects, setProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingProgrammeSubjects, setLoadingProgrammeSubjects] = useState(false);

  // Manual subject selection
  const [allSubjects, setAllSubjects] = useState<SubjectListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Load programmes on mount
  useEffect(() => {
    loadProgrammes();
  }, []);

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

      // Auto-select compulsory core subjects
      const autoSelectedIds: number[] = [];
      autoSelectedIds.push(...subjects.compulsory_core.map((s) => s.subject_id));

      // Update selected subjects, keeping any manually selected ones
      const newSelectedIds = [...new Set([...autoSelectedIds, ...selectedSubjectIds])];
      onSubjectIdsChange(newSelectedIds);
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

  const handleOptionalGroupChange = (groupSubjects: ProgrammeSubjectResponse[], selectedSubjectId: number) => {
    // Remove all subjects from this group first
    const groupSubjectIds = groupSubjects.map((s) => s.subject_id);
    const filteredIds = selectedSubjectIds.filter((id) => !groupSubjectIds.includes(id));

    // Add the newly selected subject
    onSubjectIdsChange([...filteredIds, selectedSubjectId]);
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>Programme (Optional)</Label>
        {loadingProgrammes ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading programmes...</span>
          </div>
        ) : (
          <SearchableSelect
            options={[
              { value: "none", label: "No Programme (Manual Selection)" },
              ...programmes.map((programme) => ({
                value: programme.id.toString(),
                label: `${programme.code} - ${programme.name}`,
              })),
            ]}
            value={programmeId?.toString() || "none"}
            onValueChange={(value) => {
              if (value === "none" || value === undefined) {
                handleProgrammeChange("none");
              } else {
                handleProgrammeChange(value);
              }
            }}
            placeholder="Select a programme (optional)"
            searchPlaceholder="Search programmes..."
            emptyMessage="No programmes found"
          />
        )}
      </div>

      {programmeId && programmeSubjects ? (
        <Card>
          <CardHeader>
            <CardTitle>Programme Subjects</CardTitle>
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
                  <div>
                    <Label className="font-semibold">Compulsory Core Subjects</Label>
                    <div className="mt-2 space-y-2">
                      {programmeSubjects.compulsory_core.map((subject) => (
                        <div key={subject.subject_id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedSubjectIds.includes(subject.subject_id)}
                            onCheckedChange={() => toggleSubject(subject.subject_id)}
                          />
                          <Label className="font-normal">
                            {subject.subject_code} - {subject.subject_name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {programmeSubjects.optional_core_groups.length > 0 && (
                  <div>
                    <Label className="font-semibold">Optional Core Subjects</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Select exactly one subject from each group
                    </p>
                    {programmeSubjects.optional_core_groups.map((group) => {
                      // Find which subject from this group is currently selected
                      const selectedInGroup = selectedSubjectIds.find((id) =>
                        group.subjects.some((s) => s.subject_id === id)
                      );
                      return (
                        <div key={group.choice_group_id} className="mt-4 space-y-2 pl-4 border-l-2">
                          <Label className="text-sm font-medium">Choice Group {group.choice_group_id}</Label>
                          <RadioGroup
                            value={selectedInGroup?.toString()}
                            onValueChange={(value) =>
                              handleOptionalGroupChange(group.subjects, parseInt(value))
                            }
                          >
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
                  </div>
                )}

                {programmeSubjects.electives.length > 0 && (
                  <div>
                    <Label className="font-semibold">Elective Subjects</Label>
                    <div className="mt-2 space-y-2">
                      {programmeSubjects.electives.map((subject) => (
                        <div key={subject.subject_id} className="flex items-center space-x-2">
                          <Checkbox
                            checked={selectedSubjectIds.includes(subject.subject_id)}
                            onCheckedChange={() => toggleSubject(subject.subject_id)}
                          />
                          <Label className="font-normal">
                            {subject.subject_code} - {subject.subject_name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
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
