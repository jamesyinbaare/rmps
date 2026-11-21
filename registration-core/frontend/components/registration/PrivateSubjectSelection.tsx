"use client";

import { useState, useEffect, useRef } from "react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Loader2 } from "lucide-react";
import {
  listProgrammesForPrivate,
  getProgrammeSubjectsForPrivate,
  type ProgrammeListItem,
} from "@/lib/api";
import type { ProgrammeSubjectRequirements } from "@/types";
import { toast } from "sonner";
import { SubjectSelectionPanel } from "@/components/school/SubjectSelectionPanel";

interface PrivateSubjectSelectionProps {
  programmeId: number | null;
  onProgrammeChange: (programmeId: number | null) => void;
  selectedSubjectIds: number[];
  onSubjectIdsChange: (subjectIds: number[]) => void;
  /** @deprecated Ignored — private registration is always lenient */
  examSeries?: string;
  examId?: number | null;
}

export function PrivateSubjectSelection({
  programmeId,
  onProgrammeChange,
  selectedSubjectIds,
  onSubjectIdsChange,
  examId,
}: PrivateSubjectSelectionProps) {
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [programmeSubjects, setProgrammeSubjects] =
    useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingProgrammeSubjects, setLoadingProgrammeSubjects] = useState(false);
  const prevProgrammeIdRef = useRef<number | null>(programmeId);

  useEffect(() => {
    const loadProgrammes = async () => {
      setLoadingProgrammes(true);
      try {
        const programmesData = await listProgrammesForPrivate(examId ?? undefined);
        setProgrammes(programmesData);
        if (programmeId && !programmesData.some((p) => p.id === programmeId)) {
          onProgrammeChange(null);
        }
      } catch (error) {
        toast.error("Failed to load programmes");
        console.error(error);
      } finally {
        setLoadingProgrammes(false);
      }
    };
    void loadProgrammes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  useEffect(() => {
    if (
      prevProgrammeIdRef.current !== null &&
      prevProgrammeIdRef.current !== programmeId
    ) {
      onSubjectIdsChange([]);
    }
    prevProgrammeIdRef.current = programmeId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmeId]);

  useEffect(() => {
    if (!programmeId) {
      setProgrammeSubjects(null);
      return;
    }
    const load = async () => {
      setLoadingProgrammeSubjects(true);
      try {
        const subjects = await getProgrammeSubjectsForPrivate(programmeId);
        setProgrammeSubjects(subjects);
      } catch (error) {
        toast.error("Failed to load programme subjects");
        console.error(error);
      } finally {
        setLoadingProgrammeSubjects(false);
      }
    };
    void load();
  }, [programmeId]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Programme *</Label>
        {loadingProgrammes ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading programmes…
          </div>
        ) : (
          <SearchableSelect
            options={programmes.map((p) => ({
              value: String(p.id),
              label: `${p.code} — ${p.name}`,
            }))}
            value={programmeId ? String(programmeId) : undefined}
            onValueChange={(value) => {
              onProgrammeChange(value ? parseInt(value, 10) : null);
            }}
            placeholder="Search and select a programme…"
            searchPlaceholder="Search programmes…"
            emptyMessage="No programmes available for this examination."
          />
        )}
      </div>

      {programmeId ? (
        <SubjectSelectionPanel
          programmeSubjects={programmeSubjects}
          loading={loadingProgrammeSubjects}
          selectedSubjectIds={selectedSubjectIds}
          onChange={onSubjectIdsChange}
          registrationType="private"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Select a programme to choose subjects. At least one subject is required.
        </p>
      )}
    </div>
  );
}
