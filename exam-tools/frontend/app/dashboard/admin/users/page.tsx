"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CreateInspectorForm } from "@/components/admin-users/create-inspector-form";
import { DepotKeepersManageModal } from "@/components/admin-users/depot-keepers-manage-modal";
import { SubjectOfficersManageModal } from "@/components/admin-users/subject-officers-manage-modal";
import { RoleDirectoryCard } from "@/components/admin-users/role-directory-card";
import { StaffEmailManageModal } from "@/components/admin-users/staff-email-manage-modal";
import { useRoleAccountCounts } from "@/components/admin-users/use-role-account-counts";
import {
  AdminUserModalShell,
} from "@/components/admin-user-modal-shell";
import {
  adminCreateDepotKeeper,
  adminCreateSubjectOfficer,
  adminListDepotKeepers,
  adminListDepots,
  adminListExecutiveViewers,
  adminListFinanceOfficers,
  adminListSubjectOfficers,
  adminListTestAdminOfficers,
  adminResetDepotKeeperPassword,
  adminResetExecutiveViewerPassword,
  adminResetFinanceOfficerPassword,
  adminResetSubjectOfficerPassword,
  adminResetTestAdminOfficerPassword,
  apiJson,
  createExecutiveViewer,
  createFinanceOfficer,
  createTestAdminOfficer,
  inspectorSmsStatusMessage,
  type AdminDepotRow,
  type InspectorCreatePayload,
  type InspectorCreatedResponse,
} from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";

type RoleKey =
  | "test-admin-officer"
  | "finance-officer"
  | "executive-viewer"
  | "inspectors"
  | "depot-keepers"
  | "subject-officers";

type ModalState = {
  role: RoleKey;
  mode: "list" | "create";
} | null;

function parseHash(hash: string): ModalState {
  const base = hash.split("/")[0];
  const isCreate = hash.endsWith("/create");
  const roles: RoleKey[] = [
    "test-admin-officer",
    "finance-officer",
    "executive-viewer",
    "inspectors",
    "depot-keepers",
    "subject-officers",
  ];
  if (!roles.includes(base as RoleKey)) return null;
  return {
    role: base as RoleKey,
    mode: isCreate ? "create" : base === "inspectors" ? "create" : "list",
  };
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);
  const [depots, setDepots] = useState<AdminDepotRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modal, setModal] = useState<ModalState>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [inspectorError, setInspectorError] = useState<string | null>(null);
  const [inspectorSubmitting, setInspectorSubmitting] = useState(false);

  const { counts, loading: countsLoading, reload: reloadCounts } = useRoleAccountCounts(refreshKey);

  const bumpRefresh = useCallback(() => {
    setRefreshKey((n) => n + 1);
    void reloadCounts();
  }, [reloadCounts]);

  const loadDepots = useCallback(async () => {
    try {
      const data = await adminListDepots(0, 500);
      setDepots(data.items);
    } catch {
      setDepots([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setMe(user);
        if (user.role === "TEST_ADMIN_OFFICER") {
          router.replace("/dashboard/admin/monitoring");
        }
        if (user.role === "FINANCE_OFFICER") {
          router.replace("/dashboard/admin/exam-officials");
        }
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    void loadDepots();
  }, [loadDepots]);

  useEffect(() => {
    if (typeof window === "undefined" || me?.role !== "SUPER_ADMIN") return;
    const parsed = parseHash(window.location.hash.slice(1));
    if (parsed) setModal(parsed);
  }, [me?.role]);

  function openManage(role: RoleKey, mode: "list" | "create" = "list") {
    if (role === "inspectors" && mode === "list") return;
    setModal({ role, mode });
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        mode === "create" ? `#${role}/create` : `#${role}`,
      );
    }
  }

  function closeModal() {
    setModal(null);
    setInspectorError(null);
    if (typeof window !== "undefined" && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  function notify(message: string) {
    setPageMessage(message);
  }

  async function handleCreateInspector(payload: InspectorCreatePayload) {
    setInspectorError(null);
    const c = payload.core?.trim();
    const el = payload.elective?.trim();
    if (payload.examination_id != null && !c && !el) {
      setInspectorError(
        "When an examination is selected, provide at least one centre code (core or elective).",
      );
      return;
    }
    if ((c || el) && payload.examination_id == null) {
      setInspectorError("Select an examination when adding centre codes.");
      return;
    }
    setInspectorSubmitting(true);
    try {
      const created = await apiJson<InspectorCreatedResponse>("/inspectors", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const smsNote = inspectorSmsStatusMessage(created.sms_sent, created.sms_error);
      notify(smsNote ? `Inspector created. ${smsNote}` : "Inspector created.");
      bumpRefresh();
      closeModal();
    } catch (err) {
      setInspectorError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setInspectorSubmitting(false);
    }
  }

  if (me?.role === "TEST_ADMIN_OFFICER" || me?.role === "FINANCE_OFFICER") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Users</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Create and manage login accounts by role. Open a role to list users, reset passwords, or
          add new accounts.
        </p>
      </div>

      {pageMessage ? (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground"
          role="status"
        >
          <span>{pageMessage}</span>
          <button
            type="button"
            onClick={() => setPageMessage(null)}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {me?.role === "SUPER_ADMIN" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <RoleDirectoryCard
              id="test-admin-officer"
              title="Test admin officer"
              description="Worked-scripts monitoring and correction dashboard."
              loginHint="Email + password"
              accountCount={counts.testAdminOfficer}
              countLoading={countsLoading}
              onManage={() => openManage("test-admin-officer", "list")}
              onCreate={() => openManage("test-admin-officer", "create")}
            />
            <RoleDirectoryCard
              id="finance-officer"
              title="Finance officer"
              description="Official account details and centre invigilator summaries."
              loginHint="Email + password"
              accountCount={counts.financeOfficer}
              countLoading={countsLoading}
              onManage={() => openManage("finance-officer", "list")}
              onCreate={() => openManage("finance-officer", "create")}
            />
            <RoleDirectoryCard
              id="executive-viewer"
              title="Executive viewer"
              description="Read-only national monitoring dashboard."
              loginHint="Email + password"
              accountCount={counts.executiveViewer}
              countLoading={countsLoading}
              onManage={() => openManage("executive-viewer", "list")}
              onCreate={() => openManage("executive-viewer", "create")}
            />
            <RoleDirectoryCard
              id="inspectors"
              title="Inspector"
              description="Field monitoring via phone login. Full search, postings, and bulk upload on the Inspectors page."
              loginHint="Phone + password"
              accountCount={counts.inspector}
              countLoading={countsLoading}
              manageHref="/dashboard/admin/inspectors"
              onManage={() => {}}
              onCreate={() => openManage("inspectors", "create")}
            />
            <RoleDirectoryCard
              id="depot-keepers"
              title="Depot keeper"
              description="Depot confirmation workflows. Requires an existing depot."
              loginHint="Username + password"
              accountCount={counts.depotKeeper}
              countLoading={countsLoading}
              onManage={() => openManage("depot-keepers", "list")}
              onCreate={() => openManage("depot-keepers", "create")}
            />
            <RoleDirectoryCard
              id="subject-officers"
              title="Subject officer"
              description="Subject-scoped examiner roster, invitations, and marked script verification."
              loginHint="Staff sign-in · email + password"
              accountCount={counts.subjectOfficer}
              countLoading={countsLoading}
              onManage={() => openManage("subject-officers", "list")}
              onCreate={() => openManage("subject-officers", "create")}
            />
          </div>

          <StaffEmailManageModal
            open={modal?.role === "test-admin-officer"}
            initialMode={modal?.role === "test-admin-officer" ? modal.mode : "list"}
            onClose={closeModal}
            roleTitle="Test admin officers"
            roleDescription="Email and password sign-in for worked-scripts monitoring and correction."
            defaultFullName="Test Admin officer"
            listUsers={adminListTestAdminOfficers}
            resetPassword={adminResetTestAdminOfficerPassword}
            createUser={createTestAdminOfficer}
            refreshKey={refreshKey}
            onAccountsChanged={bumpRefresh}
            onPageMessage={notify}
          />

          <StaffEmailManageModal
            open={modal?.role === "finance-officer"}
            initialMode={modal?.role === "finance-officer" ? modal.mode : "list"}
            onClose={closeModal}
            roleTitle="Finance officers"
            roleDescription="Staff sign-in for official account details and centre invigilator summaries."
            defaultFullName="Finance officer"
            listUsers={adminListFinanceOfficers}
            resetPassword={adminResetFinanceOfficerPassword}
            createUser={createFinanceOfficer}
            refreshKey={refreshKey}
            onAccountsChanged={bumpRefresh}
            onPageMessage={notify}
          />

          <StaffEmailManageModal
            open={modal?.role === "executive-viewer"}
            initialMode={modal?.role === "executive-viewer" ? modal.mode : "list"}
            onClose={closeModal}
            roleTitle="Executive viewers"
            roleDescription="Read-only staff sign-in for national monitoring dashboards."
            defaultFullName=""
            listUsers={adminListExecutiveViewers}
            resetPassword={adminResetExecutiveViewerPassword}
            createUser={createExecutiveViewer}
            refreshKey={refreshKey}
            onAccountsChanged={bumpRefresh}
            onPageMessage={notify}
          />

          <DepotKeepersManageModal
            open={modal?.role === "depot-keepers"}
            initialMode={modal?.role === "depot-keepers" ? modal.mode : "list"}
            onClose={closeModal}
            depots={depots}
            listKeepers={adminListDepotKeepers}
            resetPassword={adminResetDepotKeeperPassword}
            createKeeper={adminCreateDepotKeeper}
            refreshKey={refreshKey}
            onAccountsChanged={bumpRefresh}
            onPageMessage={notify}
          />

          <SubjectOfficersManageModal
            open={modal?.role === "subject-officers"}
            initialMode={modal?.role === "subject-officers" ? modal.mode : "list"}
            onClose={closeModal}
            listOfficers={adminListSubjectOfficers}
            resetPassword={adminResetSubjectOfficerPassword}
            createOfficer={adminCreateSubjectOfficer}
            refreshKey={refreshKey}
            onAccountsChanged={bumpRefresh}
            onPageMessage={notify}
          />

          <AdminUserModalShell
            open={modal?.role === "inspectors"}
            onClose={closeModal}
            title="Create inspector"
            description="Phone and password sign-in. Assign postings from the Inspectors admin page."
            closeDisabled={inspectorSubmitting}
          >
            <CreateInspectorForm
              submitting={inspectorSubmitting}
              error={inspectorError}
              onSubmit={handleCreateInspector}
              onCancel={closeModal}
            />
          </AdminUserModalShell>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
