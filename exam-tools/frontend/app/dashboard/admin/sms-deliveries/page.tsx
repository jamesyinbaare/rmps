"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  listSmsDeliveries,
  retrySmsDelivery,
  type SmsDeliveryRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
const btnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;
const btnSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 ${inputFocusRing}`;

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SmsDeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState("failed");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SmsDeliveryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [retryTarget, setRetryTarget] = useState<SmsDeliveryRow | null>(null);
  const [retryMode, setRetryMode] = useState<"auto" | "manual">("auto");
  const [manualPassword, setManualPassword] = useState("");
  const [manualConfirm, setManualConfirm] = useState("");
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listSmsDeliveries({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        status: statusFilter || undefined,
        q: debouncedSearch || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load SMS deliveries");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function openRetry(row: SmsDeliveryRow) {
    setRetryTarget(row);
    setRetryMode("auto");
    setManualPassword("");
    setManualConfirm("");
    setRetryError(null);
    setGeneratedPassword(null);
  }

  async function confirmRetry() {
    if (!retryTarget) return;
    setRetryError(null);
    setGeneratedPassword(null);
    if (retryMode === "manual") {
      if (manualPassword.length < 8) {
        setRetryError("Password must be at least 8 characters.");
        return;
      }
      if (manualPassword !== manualConfirm) {
        setRetryError("Passwords do not match.");
        return;
      }
    }
    setRetryBusy(true);
    try {
      const res = await retrySmsDelivery(retryTarget.id, {
        mode: retryMode,
        new_password: retryMode === "manual" ? manualPassword : undefined,
      });
      if (res.generated_password) {
        setGeneratedPassword(res.generated_password);
      }
      if (res.sms_sent) {
        setActionSuccess(
          res.generated_password
            ? "Password updated and SMS sent. Copy the password below — shown only once."
            : "SMS sent successfully.",
        );
        if (!res.generated_password) {
          setRetryTarget(null);
        }
        await load();
      } else {
        setRetryError(res.sms_error ?? "SMS could not be sent.");
        if (res.generated_password) {
          setActionSuccess(
            "Password was reset, but SMS failed. Copy the password below and share it with the inspector.",
          );
        }
        await load();
      }
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryBusy(false);
    }
  }

  async function copyGenerated() {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setActionSuccess("Password copied to clipboard.");
    } catch {
      setActionSuccess("Copy manually — clipboard access was denied.");
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">SMS deliveries</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspector credential messages. Retry failed sends with a new password.
          </p>
        </div>
        <Link href="/dashboard/admin/inspectors" className={btnSecondary}>
          Inspectors
        </Link>
      </div>

      {actionSuccess ? (
        <p className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-success" role="status">
          {actionSuccess}
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sms-status" className={formLabelClass}>
            Status
          </label>
          <select
            id="sms-status"
            className={formInputClass}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="failed">Failed</option>
            <option value="sent">Sent</option>
            <option value="pending">Pending</option>
            <option value="">All</option>
          </select>
        </div>
        <div>
          <label htmlFor="sms-search" className={formLabelClass}>
            Search
          </label>
          <input
            id="sms-search"
            className={formInputClass}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Phone or inspector name"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">When</th>
              <th className="px-3 py-3 font-medium">Inspector</th>
              <th className="px-3 py-3 font-medium">Phone</th>
              <th className="px-3 py-3 font-medium">Trigger</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Error</th>
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No deliveries found.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 whitespace-nowrap">{formatWhen(row.created_at)}</td>
                  <td className="px-3 py-3">{row.inspector_full_name}</td>
                  <td className="px-3 py-3 font-mono text-xs">{row.phone_number}</td>
                  <td className="px-3 py-3">{row.trigger}</td>
                  <td className="px-3 py-3">{row.status}</td>
                  <td className="max-w-xs truncate px-3 py-3 text-destructive" title={row.error_message ?? ""}>
                    {row.error_message ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    {row.status === "failed" ? (
                      <button type="button" className={btnSecondary} onClick={() => openRetry(row)}>
                        Retry
                      </button>
                    ) : (
                      "—"
                    )}
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
            Page {page} of {totalPages} · {total} deliveries
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className={btnSecondary}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className={btnSecondary}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {retryTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => !retryBusy && setRetryTarget(null)}
          />
          <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Retry SMS — {retryTarget.inspector_full_name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A new password will be set on the inspector account and sent by SMS.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="retry-mode"
                  checked={retryMode === "auto"}
                  onChange={() => setRetryMode("auto")}
                />
                Auto-generate password (8 characters)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="retry-mode"
                  checked={retryMode === "manual"}
                  onChange={() => setRetryMode("manual")}
                />
                Enter password manually
              </label>
              {retryMode === "manual" ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="retry-pw" className={formLabelClass}>
                      New password
                    </label>
                    <input
                      id="retry-pw"
                      type="password"
                      className={formInputClass}
                      value={manualPassword}
                      onChange={(e) => setManualPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="retry-pw2" className={formLabelClass}>
                      Confirm password
                    </label>
                    <input
                      id="retry-pw2"
                      type="password"
                      className={formInputClass}
                      value={manualConfirm}
                      onChange={(e) => setManualConfirm(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              {generatedPassword ? (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Generated password (copy now)</p>
                  <p className="mt-2 font-mono text-lg tracking-wide">{generatedPassword}</p>
                  <button type="button" className={`${btnPrimary} mt-3`} onClick={() => void copyGenerated()}>
                    Copy password
                  </button>
                  <button
                    type="button"
                    className={`${btnSecondary} mt-3 ml-2`}
                    onClick={() => setRetryTarget(null)}
                  >
                    Done
                  </button>
                </div>
              ) : null}
              {retryError ? (
                <p className="text-sm text-destructive" role="alert">
                  {retryError}
                </p>
              ) : null}
              {!generatedPassword ? (
                <div className="flex gap-2 pt-2">
                  <button type="button" className={btnPrimary} disabled={retryBusy} onClick={() => void confirmRetry()}>
                    {retryBusy ? "Sending…" : "Retry SMS"}
                  </button>
                  <button
                    type="button"
                    className={btnSecondary}
                    disabled={retryBusy}
                    onClick={() => setRetryTarget(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
