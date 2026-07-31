"use client";

import { useEffect, useMemo, useState } from "react";

import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import { WorkforceAppointmentLettersPanel } from "@/components/workforce/workforce-appointment-letters-panel";
import { WorkforceCohortsPanel } from "@/components/workforce/workforce-cohorts-panel";
import { WorkforceRosterPanel } from "@/components/workforce/workforce-roster-panel";
import {
  listAdminWorkforceRoster,
  listWorkforceExerciseGroups,
  type Examination,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  officialAccountsCommandBarClass,
  officialAccountsCommandBarRowClass,
  officialAccountsPanelClass,
} from "@/lib/official-accounts-zone";
import { formatWorkforceExamLabel } from "@/lib/workforce-exam-utils";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";

type WorkforceHubTab = "roster" | "cohorts" | "appointment-letters";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
};

export function WorkforceAdminHub({ config, exams }: Props) {
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<WorkforceHubTab>("roster");
  const [rosterCount, setRosterCount] = useState(0);
  const [cohortCount, setCohortCount] = useState(0);

  const examId = selectedExamId ?? exams[0]?.id ?? null;

  useEffect(() => {
    if (examId == null) {
      setRosterCount(0);
      setCohortCount(0);
      return;
    }
    let cancelled = false;
    void Promise.all([
      listAdminWorkforceRoster(config.kind, examId).catch(() => []),
      listWorkforceExerciseGroups(config.kind, examId).catch(() => []),
    ]).then(([roster, groups]) => {
      if (cancelled) return;
      setRosterCount(roster.length);
      setCohortCount(groups.length);
    });
    return () => {
      cancelled = true;
    };
  }, [config.kind, examId]);

  const tabs = useMemo(
    () => [
      {
        key: "roster" as const,
        label: rosterCount > 0 ? `Roster (${rosterCount.toLocaleString()})` : "Roster",
      },
      {
        key: "cohorts" as const,
        label: cohortCount > 0 ? `Cohorts (${cohortCount.toLocaleString()})` : "Cohorts",
      },
      { key: "appointment-letters" as const, label: "Appointment letters" },
    ],
    [cohortCount, rosterCount],
  );

  return (
    <div className={officialAccountsPanelClass}>
      <div className="rounded-t-2xl border-b border-border/80 bg-linear-to-b from-muted/35 to-muted/10">
        <div className={officialAccountsCommandBarClass}>
          <div className={officialAccountsCommandBarRowClass}>
            <div className="min-w-[min(100%,22rem)] flex-1 sm:max-w-md">
              <label className={formLabelClass} htmlFor="workforce-hub-exam">
                Examination
              </label>
              <select
                id="workforce-hub-exam"
                className={formInputClass}
                value={examId ?? ""}
                onChange={(e) => {
                  setSelectedExamId(e.target.value ? Number(e.target.value) : null);
                  setRosterCount(0);
                  setCohortCount(0);
                }}
              >
                {exams.length === 0 ? <option value="">No examinations</option> : null}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {formatWorkforceExamLabel(ex)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <OfficialAccountsRoleTabs
          tabs={tabs}
          activeKey={activeTab}
          onChange={setActiveTab}
          ariaLabel={`${config.labelPlural} sections`}
          variant="compact"
          integratedPanel
        />
      </div>

      {examId == null ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">Select an examination</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Choose an examination above to manage the {config.labelPlural.toLowerCase()} roster, cohorts, and
            appointment letters.
          </p>
        </div>
      ) : activeTab === "roster" ? (
        <WorkforceRosterPanel
          config={config}
          exams={exams}
          examId={examId}
          onRosterCountChange={setRosterCount}
        />
      ) : activeTab === "cohorts" ? (
        <div className="px-3 py-4 sm:px-5 sm:py-5">
          <WorkforceCohortsPanel
            config={config}
            examId={examId}
            onCohortCountChange={setCohortCount}
          />
        </div>
      ) : (
        <div className="px-3 py-4 sm:px-5 sm:py-5">
          <WorkforceAppointmentLettersPanel config={config} examId={examId} />
        </div>
      )}
    </div>
  );
}
