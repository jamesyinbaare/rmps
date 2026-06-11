"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { AdminPasswordResetModal } from "@/components/admin-password-reset-modal";
import { adminUserBtnPrimary } from "@/components/admin-user-modal-shell";
import type { AdminPasswordResetPayload, AdminPasswordResetResponse } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";

export const STAFF_ACCOUNTS_PAGE_SIZE = 10;

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export function formatStaffAccountCreatedAt(iso: string | undefined): string {
  if (!iso) return "—";
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

export type StaffAccountRowBase = {
  id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
  created_at: string;
  phone_number?: string | null;
};

type ExtraColumn<T extends StaffAccountRowBase> = {
  header: string;
  render: (row: T) => ReactNode;
};

type StaffEmailAccountsPanelProps<T extends StaffAccountRowBase> = {
  active: boolean;
  listUsers: (skip: number, limit: number) => Promise<{ items: T[]; total: number }>;
  resetPassword: (
    userId: string,
    payload: AdminPasswordResetPayload,
  ) => Promise<AdminPasswordResetResponse>;
  refreshKey?: number;
  onAccountsChanged?: () => void;
  onPageMessage?: (message: string) => void;
  onCreateClick?: () => void;
  searchPlaceholder?: string;
  searchMatch?: (row: T, query: string) => boolean;
  extraColumns?: ExtraColumn<T>[];
  showPhoneColumn?: boolean;
  resetSuccessMessage?: (row: T) => string;
  inlineSuccess?: string | null;
};

function defaultSearchMatch(row: StaffAccountRowBase, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.full_name.toLowerCase().includes(q) ||
    (row.email ?? "").toLowerCase().includes(q) ||
    (row.phone_number ?? "").toLowerCase().includes(q)
  );
}

export function StaffEmailAccountsPanel<T extends StaffAccountRowBase>({
  active,
  listUsers,
  resetPassword,
  refreshKey = 0,
  onAccountsChanged,
  onPageMessage,
  onCreateClick,
  searchPlaceholder = "Search name or email…",
  searchMatch = defaultSearchMatch,
  extraColumns = [],
  showPhoneColumn = false,
  resetSuccessMessage,
  inlineSuccess = null,
}: StaffEmailAccountsPanelProps<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [resetTarget, setResetTarget] = useState<T | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / STAFF_ACCOUNTS_PAGE_SIZE));
  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower
    ? items.filter((row) => searchMatch(row, searchLower))
    : items;

  const columnCount = 4 + extraColumns.length + (showPhoneColumn ? 1 : 0) + 1;

  const load = useCallback(async () => {
    if (!active) return;
    setLoading(true);
    setError(null);
    const skip = (page - 1) * STAFF_ACCOUNTS_PAGE_SIZE;
    try {
      const data = await listUsers(skip, STAFF_ACCOUNTS_PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [active, listUsers, page]);

  useEffect(() => {
    if (!active) return;
    setSearch("");
    setPage(1);
  }, [active]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <>
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
          placeholder={searchPlaceholder}
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
                {showPhoneColumn ? (
                  <th className="px-3 py-3 font-medium">Phone</th>
                ) : null}
                {extraColumns.map((col) => (
                  <th key={col.header} className="px-3 py-3 font-medium">
                    {col.header}
                  </th>
                ))}
                <th className="px-3 py-3 font-medium">Created</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : total === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-8 text-center">
                    <p className="text-muted-foreground">No accounts yet.</p>
                    {onCreateClick ? (
                      <button
                        type="button"
                        onClick={onCreateClick}
                        className={`mt-3 ${adminUserBtnPrimary}`}
                      >
                        Create first account
                      </button>
                    ) : null}
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">
                    No accounts match your search on this page.
                  </td>
                </tr>
              ) : (
                filteredItems.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">{row.full_name}</td>
                    <td className="px-3 py-3 text-muted-foreground">{row.email ?? "—"}</td>
                    {showPhoneColumn ? (
                      <td className="px-3 py-3 text-muted-foreground">
                        {row.phone_number ?? "—"}
                      </td>
                    ) : null}
                    {extraColumns.map((col) => (
                      <td key={col.header} className="px-3 py-3 text-muted-foreground">
                        {col.render(row)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatStaffAccountCreatedAt(row.created_at)}
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

      <AdminPasswordResetModal
        title={resetTarget ? `Reset password — ${resetTarget.full_name}` : "Reset password"}
        open={resetTarget != null}
        onClose={() => setResetTarget(null)}
        onConfirm={(payload) => resetPassword(resetTarget!.id, payload)}
        successMessage={() => {
          const msg =
            resetTarget && resetSuccessMessage
              ? resetSuccessMessage(resetTarget)
              : resetTarget
                ? `Password reset for ${resetTarget.full_name}. Share the new password securely.`
                : "Password reset.";
          onPageMessage?.(msg);
          return msg;
        }}
      />
    </>
  );
}
