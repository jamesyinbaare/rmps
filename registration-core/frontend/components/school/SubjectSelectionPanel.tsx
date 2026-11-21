"use client";

import type { ProgrammeSubjectRequirements } from "@/types";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info } from "lucide-react";
import {
  isStructuredRegistrationType,
  primaryRegistrationType,
} from "@/lib/school-registration";

interface SubjectSelectionPanelProps {
  programmeSubjects: ProgrammeSubjectRequirements | null;
  loading?: boolean;
  selectedSubjectIds: number[];
  onChange: (ids: number[]) => void;
  registrationType: string | null;
  /** @deprecated Ignored — validation is by registration type, not series */
  examSeries?: string | null;
  allowsFreeTvet?: boolean | null;
}

export function SubjectSelectionPanel({
  programmeSubjects,
  loading,
  selectedSubjectIds,
  onChange,
  registrationType,
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

  const primary = primaryRegistrationType({ allows_free_tvet: allowsFreeTvet });
  const resolvedType = registrationType || primary;
  const isLenient =
    resolvedType === "referral" || resolvedType === "private";
  const isStructured = isStructuredRegistrationType(resolvedType);
  const lockStructured = isStructured;

  const toggleSubject = (subjectId: number, checked: boolean) => {
    if (checked) {
      onChange([...selectedSubjectIds, subjectId]);
    } else {
      onChange(selectedSubjectIds.filter((id) => id !== subjectId));
    }
  };

  const handleOptionalGroupChange = (
    groupSubjectIds: number[],
    selectedId: number | null
  ) => {
    const withoutGroup = selectedSubjectIds.filter(
      (id) => !groupSubjectIds.includes(id)
    );
    if (selectedId == null) {
      onChange(withoutGroup);
      return;
    }
    onChange([...withoutGroup, selectedId]);
  };

  return (
    <div className="space-y-4">
      {isLenient && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Pick any subjects you need — including every compulsory core and
            elective. You only need at least one subject overall. In each
            optional group, choose one subject. Leave an optional group
            unchecked if you do not want any of those subjects.
          </AlertDescription>
        </Alert>
      )}
      {isStructured && programmeSubjects.optional_core_groups.length > 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Compulsory cores and electives are already selected for you. For
            each optional group, choose exactly one subject.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
        {programmeSubjects.compulsory_core.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              {isLenient
                ? "Compulsory core (pick any)"
                : lockStructured
                  ? "Compulsory core (required)"
                  : "Compulsory core"}
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
              {isStructured
                ? "Optional groups (one per group — required)"
                : "Optional groups (one per group, or none)"}
            </Label>
            {programmeSubjects.optional_core_groups.map((group) => {
              const groupIds = group.subjects.map((s) => s.subject_id);
              return (
                <div
                  key={group.choice_group_id}
                  className="space-y-2 border-l-2 border-border pl-4"
                >
                  <Label className="text-sm text-muted-foreground">
                    Choose one
                  </Label>
                  <div className="space-y-2">
                    {group.subjects.map((subject) => {
                      const isChecked = selectedSubjectIds.includes(
                        subject.subject_id
                      );
                      return (
                        <div
                          key={subject.subject_id}
                          className="flex items-center gap-2"
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                handleOptionalGroupChange(
                                  groupIds,
                                  subject.subject_id
                                );
                                return;
                              }
                              if (isLenient) {
                                handleOptionalGroupChange(groupIds, null);
                              }
                            }}
                          />
                          <Label className="cursor-pointer font-normal">
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
              );
            })}
          </div>
        )}

        {programmeSubjects.electives.length > 0 && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold">
              {isLenient
                ? "Electives (pick any)"
                : lockStructured
                  ? "Electives (all required)"
                  : "Electives (select any)"}
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
