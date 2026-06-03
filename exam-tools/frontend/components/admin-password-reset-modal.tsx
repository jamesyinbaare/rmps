"use client";

import { useEffect, useId, useState } from "react";

import type { AdminPasswordResetPayload, AdminPasswordResetResponse } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const btnPrimary = `inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-60 ${inputFocusRing}`;
const btnSecondary = `inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60 ${inputFocusRing}`;

type AdminPasswordResetModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: AdminPasswordResetPayload) => Promise<AdminPasswordResetResponse>;
  successMessage?: (generatedPassword: string | null) => string;
};

export function AdminPasswordResetModal({
  title,
  open,
  onClose,
  onConfirm,
  successMessage,
}: AdminPasswordResetModalProps) {
  const titleId = useId();
  const modeGroupName = useId();
  const [resetMode, setResetMode] = useState<"auto" | "manual">("auto");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetGeneratedPassword, setResetGeneratedPassword] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setResetMode("auto");
    setResetPassword("");
    setResetConfirm("");
    setResetGeneratedPassword(null);
    setResetError(null);
    setSuccessNote(null);
    setBusy(false);
  }, [open]);

  if (!open) return null;

  async function copyGeneratedPassword() {
    if (!resetGeneratedPassword) return;
    try {
      await navigator.clipboard.writeText(resetGeneratedPassword);
    } catch {
      /* clipboard may be unavailable */
    }
  }

  async function handleConfirm() {
    if (resetMode === "manual") {
      if (resetPassword.length < 8) {
        setResetError("Password must be at least 8 characters.");
        return;
      }
      if (resetPassword !== resetConfirm) {
        setResetError("Passwords do not match.");
        return;
      }
    }
    setResetError(null);
    setBusy(true);
    try {
      const result = await onConfirm({
        mode: resetMode,
        new_password: resetMode === "manual" ? resetPassword : undefined,
      });
      if (resetMode === "auto" && result.generated_password) {
        setResetGeneratedPassword(result.generated_password);
        setSuccessNote(
          successMessage?.(result.generated_password) ??
            "Password reset. Copy the password below — shown only once.",
        );
      } else {
        onClose();
      }
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-foreground/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted disabled:opacity-40 ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {resetGeneratedPassword ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              {successNote ? (
                <p className="text-sm text-foreground" role="status">
                  {successNote}
                </p>
              ) : null}
              <p className="mt-2 text-sm font-medium text-foreground">Generated password (copy now)</p>
              <p className="mt-2 font-mono text-lg tracking-wide">{resetGeneratedPassword}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={() => void copyGeneratedPassword()}>
                  Copy password
                </button>
                <button type="button" className={btnSecondary} onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={modeGroupName}
                  checked={resetMode === "auto"}
                  onChange={() => setResetMode("auto")}
                />
                Auto-generate password (8 characters: a–z, A–Z, 0–9)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="radio"
                  name={modeGroupName}
                  checked={resetMode === "manual"}
                  onChange={() => setResetMode("manual")}
                />
                Enter password manually
              </label>
              {resetMode === "manual" ? (
                <>
                  <div>
                    <label htmlFor={`${titleId}-password`} className={formLabelClass}>
                      New password
                    </label>
                    <input
                      id={`${titleId}-password`}
                      type="password"
                      className={formInputClass}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label htmlFor={`${titleId}-confirm`} className={formLabelClass}>
                      Confirm password
                    </label>
                    <input
                      id={`${titleId}-confirm`}
                      type="password"
                      className={formInputClass}
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                </>
              ) : null}
            </>
          )}
          {resetError ? (
            <p className="text-sm text-destructive" role="alert">
              {resetError}
            </p>
          ) : null}
          {!resetGeneratedPassword ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnPrimary} disabled={busy} onClick={() => void handleConfirm()}>
                {busy ? "Resetting…" : "Reset password"}
              </button>
              <button type="button" className={btnSecondary} disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
