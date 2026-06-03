"use client";

import { useCallback, useEffect, useState } from "react";

import { CreateStaffEmailUserForm } from "@/components/admin-users/create-staff-email-user-form";
import {
  AdminUserModalShell,
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import { AdminPasswordResetModal } from "@/components/admin-password-reset-modal";
import type {
  AdminPasswordResetPayload,
  AdminPasswordResetResponse,
  StaffEmailUserListResponse,
  StaffEmailUserRow,
} from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";

const PAGE_SIZE = 10;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function formatCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

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
  const [items, setItems] = useState<StaffEmailUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffEmailUserRow | null>(null);
  const [formKey, setFormKey] = useState(0);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower
    ? items.filter(
        (row) =>
          row.full_name.toLowerCase().includes(searchLower) ||
          row.email.toLowerCase().includes(searchLower),
      )
    : items;

  const load = useCallback(async () => {
    if (!open || mode !== "list") return;
    setLoading(true);
    setError(null);
    const skip = (page - 1) * PAGE_SIZE;
    try {
      const data = await listUsers(skip, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listUsers, mode, open, page]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setInlineSuccess(null);
    setCreateError(null);
    setSearch("");
    setPage(1);
    setFormKey((k) => k + 1);
  }, [open, initialMode]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function handleClose() {
    if (createSubmitting) return;
    onClose();
  }

  async function handleCreate(payload: {
    email: string;
    password: string;
    full_name: string;
  }) {
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await createUser(payload);
      setInlineSuccess(`${payload.full_name} created.`);
      onPageMessage?.(`${roleTitle} account created for ${payload.full_name}.`);
      onAccountsChanged?.();
      setMode("list");
      setPage(1);
      setFormKey((k) => k + 1);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreateSubmitting(false);
    }
  }

  const headerTitle =
    mode === "create" ? `Create ${roleTitle.toLowerCase()}` : `${roleTitle} · ${total} accounts`;

  const headerDescription = mode === "create" ? roleDescription : roleDescription;

  return (
    <>
      <AdminUserModalShell
        open={open}
        onClose={handleClose}
        title={headerTitle}
        description={headerDescription}
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
          <div className="space-y-3">
            {inlineSuccess ? (
              <p
                className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-foreground"
                role="status"
              >
                {inlineSuccess}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <input
              type="search"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={formInputClass}
              aria-label="Search accounts"
            />
            <div className="overflow-x-auto rounded-2xl border border-border bg-card">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3 font-medium">Full name</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Created</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  ) : total === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center">
                        <p className="text-muted-foreground">No accounts yet.</p>
                        <button
                          type="button"
                          onClick={() => setMode("create")}
                          className={`mt-3 ${adminUserBtnPrimary}`}
                        >
                          Create first account
                        </button>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                        No accounts match your search on this page.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-3">{row.full_name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{row.email}</td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {formatCreatedAt(row.created_at)}
                        </td>
                        <td className="px-3 py-3">{row.is_active ? "Active" : "Inactive"}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setResetTarget(row)}
                            className={`rounded-lg px-2 py-1 text-primary hover:bg-muted ${inputFocusRing}`}
                          >
                            Reset password
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages} · {total} account{total === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => p - 1)}
                    className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </AdminUserModalShell>

      <AdminPasswordResetModal
        title={resetTarget ? `Reset password — ${resetTarget.full_name}` : "Reset password"}
        open={resetTarget != null}
        onClose={() => setResetTarget(null)}
        onConfirm={(payload) => resetPassword(resetTarget!.id, payload)}
        successMessage={() => {
          const msg = `Password reset for ${resetTarget!.full_name}. Share the new password securely.`;
          onPageMessage?.(msg);
          return msg;
        }}
      />
    </>
  );
}

/** @deprecated Use StaffEmailManageModal */
export const StaffEmailUsersListModal = StaffEmailManageModal;
