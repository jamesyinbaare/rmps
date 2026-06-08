"use client";

import { useEffect, useState } from "react";

import {
  CreateSubjectOfficerForm,
  type SubjectOfficerCreatePayload,
} from "@/components/admin-users/create-subject-officer-form";
import { StaffEmailAccountsPanel } from "@/components/admin-users/staff-email-accounts-panel";
import { SubjectOfficerAssignmentsPanel } from "@/components/admin-users/subject-officer-assignments-panel";
import {
  AdminUserModalShell,
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import type {
  AdminPasswordResetPayload,
  AdminPasswordResetResponse,
  AdminSubjectOfficerRow,
} from "@/lib/api";

type ManageMode = "list" | "create";
type ManageTab = "accounts" | "assignments";

type SubjectOfficersManageModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: ManageMode;
  listOfficers: (skip: number, limit: number) => Promise<{ items: AdminSubjectOfficerRow[]; total: number }>;
  resetPassword: (
    userId: string,
    payload: AdminPasswordResetPayload,
  ) => Promise<AdminPasswordResetResponse>;
  createOfficer: (payload: SubjectOfficerCreatePayload) => Promise<unknown>;
  refreshKey?: number;
  onAccountsChanged?: () => void;
  onPageMessage?: (message: string) => void;
};

const tabBtn =
  "rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const tabBtnActive = `${tabBtn} bg-primary text-primary-foreground`;
const tabBtnIdle = `${tabBtn} text-muted-foreground hover:bg-muted hover:text-foreground`;

export function SubjectOfficersManageModal({
  open,
  onClose,
  initialMode = "list",
  listOfficers,
  resetPassword,
  createOfficer,
  refreshKey = 0,
  onAccountsChanged,
  onPageMessage,
}: SubjectOfficersManageModalProps) {
  const [tab, setTab] = useState<ManageTab>("accounts");
  const [mode, setMode] = useState<ManageMode>("list");
  const [total, setTotal] = useState(0);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTab("accounts");
    setMode(initialMode);
    setInlineSuccess(null);
    setCreateError(null);
    setFormKey((k) => k + 1);
  }, [open, initialMode]);

  function handleClose() {
    if (createSubmitting) return;
    onClose();
  }

  async function handleCreate(payload: SubjectOfficerCreatePayload) {
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await createOfficer(payload);
      setInlineSuccess(`${payload.full_name} created.`);
      onPageMessage?.(`Subject officer account created for ${payload.full_name}.`);
      onAccountsChanged?.();
      setMode("list");
      setListRefreshKey((k) => k + 1);
      setFormKey((k) => k + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const headerTitle =
    tab === "assignments"
      ? "Subject assignments"
      : mode === "create"
        ? "Create subject officer"
        : `Subject officers · ${total} accounts`;

  const headerDescription =
    tab === "assignments"
      ? "Link officers to subjects for each examination."
      : "Staff sign-in for subject-scoped examiner management.";

  return (
    <AdminUserModalShell
      open={open}
      onClose={handleClose}
      title={headerTitle}
      description={headerDescription}
      closeDisabled={createSubmitting}
      headerActions={
        tab === "accounts" ? (
          mode === "list" ? (
            <button type="button" onClick={() => setMode("create")} className={adminUserBtnPrimary}>
              Create account
            </button>
          ) : (
            <button
              type="button"
              disabled={createSubmitting}
              onClick={() => {
                setMode("list");
                setCreateError(null);
              }}
              className={adminUserBtnSecondary}
            >
              Back to list
            </button>
          )
        ) : null
      }
    >
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          type="button"
          className={tab === "accounts" ? tabBtnActive : tabBtnIdle}
          onClick={() => setTab("accounts")}
        >
          Accounts
        </button>
        <button
          type="button"
          className={tab === "assignments" ? tabBtnActive : tabBtnIdle}
          onClick={() => {
            setTab("assignments");
            setMode("list");
          }}
        >
          Subject assignments
        </button>
      </div>

      {tab === "accounts" ? (
        mode === "create" ? (
          <CreateSubjectOfficerForm
            key={formKey}
            submitting={createSubmitting}
            error={createError}
            onSubmit={handleCreate}
            onCancel={() => {
              setMode("list");
              setCreateError(null);
            }}
          />
        ) : (
          <StaffEmailAccountsPanel<AdminSubjectOfficerRow>
            active={open && tab === "accounts" && mode === "list"}
            listUsers={async (skip, limit) => {
              const data = await listOfficers(skip, limit);
              setTotal(data.total);
              return data;
            }}
            resetPassword={resetPassword}
            refreshKey={refreshKey + listRefreshKey}
            onAccountsChanged={onAccountsChanged}
            onPageMessage={onPageMessage}
            onCreateClick={() => setMode("create")}
            inlineSuccess={inlineSuccess}
            showPhoneColumn
            searchPlaceholder="Search name, email, or phone…"
            resetSuccessMessage={(row) =>
              `Password reset for ${row.full_name} (${row.email ?? row.phone_number ?? "account"}). Copy the password below.`
            }
          />
        )
      ) : (
        <SubjectOfficerAssignmentsPanel
          active={open && tab === "assignments"}
          refreshKey={refreshKey + listRefreshKey}
          onAccountsChanged={onAccountsChanged}
        />
      )}
    </AdminUserModalShell>
  );
}
