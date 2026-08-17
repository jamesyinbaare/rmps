"use client";

import { Suspense } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { SO_MASTER_DETAIL_PAGE_CLASS } from "@/components/examiners/constants";
import { ManualAllocationView } from "@/components/scripts-allocation/manual-allocation-view";
import { SubjectOfficerAllocationsShell } from "@/components/subject-officer/subject-officer-allocations-shell";
import { useSubjectOfficerAllocationsUrl } from "@/components/subject-officer/use-subject-officer-allocations-url";
import { useSubjectOfficerWorkspace } from "@/components/subject-officer/subject-officer-workspace-context";
import { RoleGuard } from "@/components/role-guard";
import { cn } from "@/lib/utils";

function AllocationsTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SubjectOfficerAllocationsContent() {
  const { examId, subjectId, workspaceLabel, loading, mustPickWorkspace } = useSubjectOfficerWorkspace();
  const { examinerId, setExaminerId, tab, setTab } = useSubjectOfficerAllocationsUrl();

  return (
    <DashboardShell title="Allocations" staffRole="subject-officer">
      {loading || mustPickWorkspace ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : examId == null || subjectId == null ? (
        <p className="text-sm text-muted-foreground">Choose a workspace to manage allocations.</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div
            role="tablist"
            aria-label="Allocation views"
            className="flex w-fit flex-wrap gap-1 rounded-xl bg-muted/50 p-1"
          >
            <AllocationsTabButton active={tab === "figures"} onClick={() => setTab("figures")}>
              Enter figures
            </AllocationsTabButton>
            <AllocationsTabButton active={tab === "examiner"} onClick={() => setTab("examiner")}>
              By examiner
            </AllocationsTabButton>
          </div>

          {tab === "figures" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <ManualAllocationView
                mode="subject-officer"
                lockedExamId={examId}
                lockedSubjectId={subjectId}
                workspaceLabel={workspaceLabel ?? undefined}
                embedded
              />
            </div>
          ) : (
            <div className={SO_MASTER_DETAIL_PAGE_CLASS}>
              <SubjectOfficerAllocationsShell
                examId={examId}
                subjectId={subjectId}
                workspaceLabel={workspaceLabel ?? ""}
                examinerId={examinerId}
                onExaminerChange={setExaminerId}
              />
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

export default function SubjectOfficerAllocationsPage() {
  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
        <SubjectOfficerAllocationsContent />
      </Suspense>
    </RoleGuard>
  );
}
