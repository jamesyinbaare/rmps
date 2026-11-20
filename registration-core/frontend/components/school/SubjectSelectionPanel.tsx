"use client";

import type { ProgrammeSubjectRequirements } from "@/types";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info } from "lucide-react";
import {
  isMayJuneSeries,
  isStructuredRegistrationType,
  primaryRegistrationType,
} from "@/lib/school-registration";

interface SubjectSelectionPanelProps {
  programmeSubjects: ProgrammeSubjectRequirements | null;
  loading?: boolean;
  selectedSubjectIds: number[];
  onChange: (ids: number[]) => void;
  registrationType: string | null;
  examSeries?: string | null;
  allowsFreeTvet?: boolean | null;
}

export function SubjectSelectionPanel({
  programmeSubjects,
  loading,
  selectedSubjectIds,
  onChange,
  registrationType,
  examSeries,
  allowsFreeTvet,
}: SubjectSelectionPanelProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading subjects...
      </div>
    );
  }

  if (!programmeSubjects) return null;

  const isMayJune = isMayJuneSeries(examSeries);
  const primary = primaryRegistrationType({ allows_free_tvet: allowsFreeTvet });
  const resolvedType = registrationType || primary;
  const isReferral = resolvedType === "referral";
  const isStructured = isStructuredRegistrationType(resolvedType);
  const lockStructured = isStructured && isMayJune;

  const toggleSubject = (subjectId: number, checked: boolean) => {
    if (checked) {
      onChange([...selectedSubjectIds, subjectId]);
    } else {
      onChange(selectedSubjectIds.filter((id) => id !== subjectId));
    }
  };

  const handleOptionalGroupChange = (
    groupSubjectIds: number[],
    selectedId: number
  ) => {
    const withoutGroup = selectedSubjectIds.filter(
      (id) => !groupSubjectIds.includes(id)
    );
    onChange([...withoutGroup, selectedId]);
  };

  return (
    <div className="space-y-4">
      {isReferral && isMayJune && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            For referral candidates in MAY/JUNE examinations, all subjects are
            optional. Select at least one subject.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
        {programmeSubjects.compulsory_core.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Compulsory core
              {isReferral && isMayJune
                ? " (optional — at least one subject total)"
                : lockStructured
                  ? " (required)"
                  : ""}
            </Label>
            <div className="space-y-2">
              {programmeSubjects.compulsory_core.map((subject) => {
                const isChecked = selectedSubjectIds.includes(subject.subject_id);
                return (
                  <div
                    key={subject.subject_id}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={lockStructured}
                      onCheckedChange={(checked) =>
                        toggleSubject(subject.subject_id, checked as boolean)
                      }
                    />
                    <Label
                      className={`font-normal ${lockStructured ? "" : "cursor-pointer"}`}
                    >
                      {subject.subject_code} — {subject.subject_name}
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      CORE
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {programmeSubjects.optional_core_groups.length > 0 && (
          <div className="space-y-4">
            <Label className="text-sm font-semibold">
              Optional core groups (select one per group)
            </Label>
            {programmeSubjects.optional_core_groups.map((group) => {
              const groupIds = group.subjects.map((s) => s.subject_id);
              const selectedInGroup = selectedSubjectIds.find((id) =>
                groupIds.includes(id)
              );
              return (
                <div
                  key={group.choice_group_id}
                  className="space-y-2 border-l-2 border-border pl-4"
                >
                  <Label className="text-sm text-muted-foreground">
                    Group {group.choice_group_id}
                  </Label>
                  <RadioGroup
                    value={selectedInGroup?.toString()}
                    onValueChange={(value) =>
                      handleOptionalGroupChange(groupIds, parseInt(value, 10))
                    }
                  >
                    {group.subjects.map((subject) => (
                      <div
                        key={subject.subject_id}
                        className="flex items-center gap-2"
                      >
                        <RadioGroupItem
                          value={subject.subject_id.toString()}
                          id={`group-${group.choice_group_id}-${subject.subject_id}`}
                        />
                        <Label
                          htmlFor={`group-${group.choice_group_id}-${subject.subject_id}`}
                          className="cursor-pointer font-normal"
                        >
                          {subject.subject_code} — {subject.subject_name}
                        </Label>
                        <Badge variant="secondary" className="text-xs">
                          CORE
                        </Badge>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              );
            })}
          </div>
        )}

        {programmeSubjects.electives.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              Electives
              {isReferral && isMayJune
                ? " (optional — at least one subject total)"
                : lockStructured
                  ? " (all required)"
                  : " (select any)"}
            </Label>
            <div className="space-y-2">
              {programmeSubjects.electives.map((subject) => {
                const isChecked = selectedSubjectIds.includes(subject.subject_id);
                return (
                  <div
                    key={subject.subject_id}
                    className="flex items-center gap-2"
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={lockStructured}
                      onCheckedChange={(checked) =>
                        toggleSubject(subject.subject_id, checked as boolean)
                      }
                    />
                    <Label
                      className={`font-normal ${lockStructured ? "" : "cursor-pointer"}`}
                    >
                      {subject.subject_code} — {subject.subject_name}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      ELECTIVE
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
