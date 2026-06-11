"use client";

import { useEffect, useState } from "react";

import { CreateStaffEmailUserForm } from "@/components/admin-users/create-staff-email-user-form";
import { StaffEmailAccountsPanel } from "@/components/admin-users/staff-email-accounts-panel";
import {
  AdminUserModalShell,
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import type {
  AdminPasswordResetPayload,
  AdminPasswordResetResponse,
  StaffEmailUserListResponse,
  StaffEmailUserRow,
} from "@/lib/api";

type ManageMode = "list" | "create";

type StaffEmailManageModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: ManageMode;
  roleTitle: string;
  roleDescription: string;
  defaultFullName: string;
  listUsers: (skip: number, limit: number) => Promise<StaffEmailUserListResponse>;
  resetPassword: (
    userId: string,
    payload: AdminPasswordResetPayload,
  ) => Promise<AdminPasswordResetResponse>;
  createUser: (payload: { email: string; password: string; full_name: string }) => Promise<unknown>;
  refreshKey?: number;
  onAccountsChanged?: () => void;
  onPageMessage?: (message: string) => void;
};

export function StaffEmailManageModal({
  open,
  onClose,
  initialMode = "list",
  roleTitle,
  roleDescription,
  defaultFullName,
  listUsers,
  resetPassword,
  createUser,
  refreshKey = 0,
  onAccountsChanged,
  onPageMessage,
}: StaffEmailManageModalProps) {
  const [mode, setMode] = useState<ManageMode>("list");
  const [total, setTotal] = useState(0);
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setInlineSuccess(null);
    setCreateError(null);
    setFormKey((k) => k + 1);
  }, [open, initialMode]);

  function handleClose() {
    if (createSubmitting) return;
    onClose();
  }

  async function handleCreate(payload: { email: string; password: string; full_name: string }) {
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await createUser(payload);
      setInlineSuccess(`${payload.full_name} created.`);
      onPageMessage?.(`${roleTitle} account created for ${payload.full_name}.`);
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
    mode === "create" ? `Create ${roleTitle.toLowerCase()}` : `${roleTitle} · ${total} accounts`;

  return (
    <AdminUserModalShell
      open={open}
      onClose={handleClose}
      title={headerTitle}
      description={roleDescription}
      closeDisabled={createSubmitting}
      headerActions={
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
      }
    >
      {mode === "create" ? (
        <CreateStaffEmailUserForm
          key={formKey}
          defaultFullName={defaultFullName}
          submitting={createSubmitting}
          error={createError}
          onSubmit={handleCreate}
          onCancel={() => {
            setMode("list");
            setCreateError(null);
          }}
        />
      ) : (
        <StaffEmailAccountsPanel<StaffEmailUserRow>
          active={open && mode === "list"}
          listUsers={async (skip, limit) => {
            const data = await listUsers(skip, limit);
            setTotal(data.total);
            return data;
          }}
          resetPassword={resetPassword}
          refreshKey={refreshKey + listRefreshKey}
          onAccountsChanged={onAccountsChanged}
          onPageMessage={onPageMessage}
          onCreateClick={() => setMode("create")}
          inlineSuccess={inlineSuccess}
          searchMatch={(row, query) =>
            row.full_name.toLowerCase().includes(query) ||
            row.email.toLowerCase().includes(query)
          }
        />
      )}
    </AdminUserModalShell>
  );
}

/** @deprecated Use StaffEmailManageModal */
export const StaffEmailUsersListModal = StaffEmailManageModal;
