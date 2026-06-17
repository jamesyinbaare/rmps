"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  SubjectOfficerWorkspacePicker,
  SubjectOfficerWorkspacePickerSkeleton,
} from "@/components/subject-officer/subject-officer-workspace-picker";
import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import {
  getSubjectOfficerAssignmentIdFromToken,
  selectSubjectOfficerWorkspace,
} from "@/lib/auth";
import { primaryButtonClass } from "@/lib/form-classes";
import { flattenSubjectOfficerWorkspaces } from "@/lib/subject-officer-exams";
import { subjectOfficerWorkspacePickerCopy } from "@/lib/subject-officer-workspace-ui";
import { cn } from "@/lib/utils";

function SubjectOfficerSelectWorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSwitch = searchParams.get("switch") === "1";
  const { assignments, loading, error } = useSubjectOfficerAssignments();
  const workspaces = useMemo(() => flattenSubjectOfficerWorkspaces(assignments), [assignments]);

  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;

    const jwtId = getSubjectOfficerAssignmentIdFromToken();
    if (jwtId && !isSwitch && workspaces.some((w) => w.assignmentId === jwtId)) {
      router.replace("/dashboard/subject-officer");
      return;
    }

    if (workspaces.length === 1 && !isSwitch) {
      void (async () => {
        setBusy(true);
        try {
          await selectSubjectOfficerWorkspace(workspaces[0]!.assignmentId);
          router.replace("/dashboard/subject-officer");
        } catch (e) {
          setActionError(e instanceof Error ? e.message : "Could not save workspace");
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

    setSelectedId((current) => {
      if (current && workspaces.some((w) => w.assignmentId === current)) {
        return current;
      }
      const jwtIdForInit = getSubjectOfficerAssignmentIdFromToken();
      if (jwtIdForInit && workspaces.some((w) => w.assignmentId === jwtIdForInit)) {
        return jwtIdForInit;
      }
      return workspaces[0]?.assignmentId ?? "";
    });
  }, [isSwitch, loading, router, workspaces]);

  const onConfirm = useCallback(async () => {
    if (!selectedId.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      await selectSubjectOfficerWorkspace(selectedId.trim());
      router.replace("/dashboard/subject-officer");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not save workspace");
    } finally {
      setBusy(false);
    }
  }, [router, selectedId]);

  const pageTitle = isSwitch
    ? subjectOfficerWorkspacePickerCopy.switchTitle
    : subjectOfficerWorkspacePickerCopy.selectTitle;
  const description = isSwitch
    ? subjectOfficerWorkspacePickerCopy.switchDescription
    : subjectOfficerWorkspacePickerCopy.selectDescription;

  return (
    <RoleGuard expectedRole="SUBJECT_OFFICER" loginHref="/login/admin">
      <DashboardShell title={pageTitle} staffRole="subject-officer">
        <div className="mx-auto max-w-lg px-0 pb-24 sm:pb-8">
          {loading ? (
            <SubjectOfficerWorkspacePickerSkeleton />
          ) : error && workspaces.length === 0 ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-muted-foreground">No examination assignments found for your account.</p>
          ) : workspaces.length > 1 || (isSwitch && workspaces.length >= 1) ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{description}</p>
              {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
              <SubjectOfficerWorkspacePicker
                workspaces={workspaces}
                selectedId={selectedId}
                onSelect={setSelectedId}
                disabled={busy}
                footer={
                  <button
                    type="button"
                    onClick={() => void onConfirm()}
                    disabled={busy || !selectedId}
                    className={cn(primaryButtonClass, "min-h-11 w-full")}
                  >
                    {busy
                      ? "Continuing…"
                      : isSwitch
                        ? subjectOfficerWorkspacePickerCopy.confirmSwitch
                        : subjectOfficerWorkspacePickerCopy.continue}
                  </button>
                }
              />
            </div>
          ) : busy ? (
            <p className="text-sm text-muted-foreground">Setting up your workspace…</p>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}

export default function SubjectOfficerSelectWorkspacePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <SubjectOfficerSelectWorkspaceContent />
    </Suspense>
  );
}
