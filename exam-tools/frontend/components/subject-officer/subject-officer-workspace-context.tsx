"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useSubjectOfficerAssignments } from "@/hooks/use-subject-officer-assignments";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  getSubjectOfficerAssignmentIdFromToken,
  subjectOfficerMustPickWorkspace,
} from "@/lib/auth";
import type { Subject } from "@/lib/api";
import {
  countSubjectOfficerAssignments,
  findSubjectOfficerWorkspace,
  flattenSubjectOfficerWorkspaces,
  subjectsForExam,
  type SubjectOfficerWorkspaceOption,
} from "@/lib/subject-officer-exams";

export type SubjectOfficerWorkspaceState = {
  assignments: ReturnType<typeof useSubjectOfficerAssignments>["assignments"];
  workspaces: SubjectOfficerWorkspaceOption[];
  assignmentCount: number;
  assignmentId: string | null;
  examId: number | null;
  subjectId: number | null;
  workspace: SubjectOfficerWorkspaceOption | null;
  workspaceLabel: string | null;
  workspaceSubjects: Subject[];
  loading: boolean;
  error: string | null;
  mustPickWorkspace: boolean;
  refreshTokenClaim: () => void;
};

const SubjectOfficerWorkspaceContext = createContext<SubjectOfficerWorkspaceState | null>(null);

const SELECT_WORKSPACE_PREFIX = "/dashboard/subject-officer/select-workspace";

export function SubjectOfficerWorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { assignments, loading, error } = useSubjectOfficerAssignments();
  const [tokenAssignmentId, setTokenAssignmentId] = useState<string | null>(() =>
    getSubjectOfficerAssignmentIdFromToken(),
  );

  const refreshTokenClaim = useCallback(() => {
    setTokenAssignmentId(getSubjectOfficerAssignmentIdFromToken());
  }, []);

  useEffect(() => {
    refreshTokenClaim();
    const onTokenUpdated = () => refreshTokenClaim();
    window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, onTokenUpdated);
    return () => window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, onTokenUpdated);
  }, [refreshTokenClaim]);

  const workspaces = useMemo(() => flattenSubjectOfficerWorkspaces(assignments), [assignments]);
  const assignmentCount = workspaces.length;
  const workspace = useMemo(
    () => findSubjectOfficerWorkspace(assignments, tokenAssignmentId),
    [assignments, tokenAssignmentId],
  );
  const examId = workspace?.examinationId ?? null;
  const subjectId = workspace?.subjectId ?? null;
  const workspaceLabel = workspace
    ? `${workspace.examinationName} · ${workspace.subjectLabel}`
    : null;
  const workspaceSubjects = useMemo(() => {
    if (workspace == null) return [];
    return subjectsForExam(assignments, workspace.examinationId).filter(
      (s) => s.id === workspace.subjectId,
    );
  }, [assignments, workspace]);
  const mustPickWorkspace = !loading && subjectOfficerMustPickWorkspace(assignmentCount);

  useEffect(() => {
    if (loading || pathname.startsWith(SELECT_WORKSPACE_PREFIX)) return;
    if (assignmentCount === 0) return;
    if (mustPickWorkspace) {
      router.replace("/dashboard/subject-officer/select-workspace");
      return;
    }
    if (tokenAssignmentId && workspace == null && assignmentCount > 0) {
      router.replace("/dashboard/subject-officer/select-workspace?switch=1");
    }
  }, [
    assignmentCount,
    loading,
    mustPickWorkspace,
    pathname,
    router,
    tokenAssignmentId,
    workspace,
  ]);

  const value = useMemo(
    (): SubjectOfficerWorkspaceState => ({
      assignments,
      workspaces,
      assignmentCount,
      assignmentId: tokenAssignmentId,
      examId,
      subjectId,
      workspace,
      workspaceLabel,
      workspaceSubjects,
      loading,
      error,
      mustPickWorkspace,
      refreshTokenClaim,
    }),
    [
      assignments,
      workspaces,
      assignmentCount,
      tokenAssignmentId,
      examId,
      subjectId,
      workspace,
      workspaceLabel,
      workspaceSubjects,
      loading,
      error,
      mustPickWorkspace,
      refreshTokenClaim,
    ],
  );

  return (
    <SubjectOfficerWorkspaceContext.Provider value={value}>{children}</SubjectOfficerWorkspaceContext.Provider>
  );
}

export function useSubjectOfficerWorkspace(): SubjectOfficerWorkspaceState {
  const ctx = useContext(SubjectOfficerWorkspaceContext);
  if (ctx == null) {
    throw new Error("useSubjectOfficerWorkspace must be used within SubjectOfficerWorkspaceProvider");
  }
  return ctx;
}

/** Read-only workspace subjects for the active exam (all assigned on that exam). */
export function useSubjectOfficerExamSubjects(): Subject[] {
  const { assignments, examId } = useSubjectOfficerWorkspace();
  return useMemo(() => subjectsForExam(assignments, examId), [assignments, examId]);
}
