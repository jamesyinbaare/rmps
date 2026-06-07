"use client";

import { useCallback, useEffect, useState } from "react";

import {
  AdminUserModalShell,
  adminUserBtnPrimary,
  adminUserBtnSecondary,
} from "@/components/admin-user-modal-shell";
import { AdminPasswordResetModal } from "@/components/admin-password-reset-modal";
import { generateAccountPassword } from "@/components/admin-users/generate-password";
import type {
  AdminPasswordResetPayload,
  AdminPasswordResetResponse,
  AdminSubjectOfficerRow,
  Examination,
  Subject,
  SubjectOfficerAssignmentRow,
} from "@/lib/api";
import {
  adminDeleteSubjectOfficerAssignments,
  adminListSubjectOfficerAssignments,
  adminUpsertSubjectOfficerAssignments,
  apiJson,
  listAllSubjects,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { formatExamLabel } from "@/lib/official-rates-draft";

const PAGE_SIZE = 10;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

type ManageMode = "list" | "create";

type SubjectOfficersManageModalProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: ManageMode;
  listOfficers: (skip: number, limit: number) => Promise<{ items: AdminSubjectOfficerRow[]; total: number }>;
  resetPassword: (
    userId: string,
    payload: AdminPasswordResetPayload,
  ) => Promise<AdminPasswordResetResponse>;
  createOfficer: (payload: {
    email: string;
    password: string;
    full_name: string;
    phone_number?: string | null;
    send_sms?: boolean;
  }) => Promise<unknown>;
  refreshKey?: number;
  onAccountsChanged?: () => void;
  onPageMessage?: (message: string) => void;
};

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
  const [mode, setMode] = useState<ManageMode>("list");
  const [items, setItems] = useState<AdminSubjectOfficerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminSubjectOfficerRow | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [sendSms, setSendSms] = useState(true);
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [assignExamId, setAssignExamId] = useState<number | "">("");
  const [assignOfficerId, setAssignOfficerId] = useState("");
  const [assignSubjectIds, setAssignSubjectIds] = useState<number[]>([]);
  const [assignments, setAssignments] = useState<SubjectOfficerAssignmentRow[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchLower = search.trim().toLowerCase();
  const filteredItems = searchLower
    ? items.filter(
        (row) =>
          row.full_name.toLowerCase().includes(searchLower) ||
          (row.email ?? "").toLowerCase().includes(searchLower) ||
          (row.phone_number ?? "").toLowerCase().includes(searchLower),
      )
    : items;

  const load = useCallback(async () => {
    if (!open || mode !== "list") return;
    setLoading(true);
    setError(null);
    try {
      const data = await listOfficers((page - 1) * PAGE_SIZE, PAGE_SIZE);
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load subject officers");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [listOfficers, mode, open, page]);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setSearch("");
    setPage(1);
    setEmail("");
    setPhone("");
    setFullName("");
    setPassword("");
    setSendSms(true);
    setCreateError(null);
  }, [open, initialMode]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!open) return;
    void apiJson<Examination[]>("/examinations").then(setExams).catch(() => setExams([]));
    void listAllSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, [open]);

  useEffect(() => {
    if (!open || assignExamId === "") {
      setAssignments([]);
      return;
    }
    void adminListSubjectOfficerAssignments(assignExamId)
      .then((data) => setAssignments(data.items))
      .catch(() => setAssignments([]));
  }, [open, assignExamId, refreshKey]);

  async function handleSaveAssignments() {
    if (assignExamId === "" || !assignOfficerId || assignSubjectIds.length === 0) {
      setAssignMessage("Select examination, officer, and at least one subject.");
      return;
    }
    setAssignBusy(true);
    setAssignMessage(null);
    try {
      await adminUpsertSubjectOfficerAssignments(assignExamId, {
        user_id: assignOfficerId,
        subject_ids: assignSubjectIds,
      });
      setAssignMessage("Assignments saved.");
      onAccountsChanged?.();
    } catch (e) {
      setAssignMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleDeleteAssignments(userId: string) {
    if (assignExamId === "") return;
    setAssignBusy(true);
    try {
      await adminDeleteSubjectOfficerAssignments(assignExamId, userId);
      setAssignMessage("Assignments removed.");
      onAccountsChanged?.();
    } catch (e) {
      setAssignMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setAssignBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreateSubmitting(true);
    try {
      await createOfficer({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone_number: phone.trim() || null,
        send_sms: sendSms,
      });
      onPageMessage?.("Subject officer created.");
      onAccountsChanged?.();
      setMode("list");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <>
      <AdminUserModalShell
        open={open}
        onClose={onClose}
        title={mode === "create" ? "Create subject officer" : "Subject officers"}
        description="Email and password sign-in for subject-scoped examiner management."
        closeDisabled={createSubmitting}
      >
        {mode === "create" ? (
          <form className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
            <div>
              <label htmlFor="so-full-name" className={formLabelClass}>
                Full name
              </label>
              <input
                id="so-full-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={formInputClass}
              />
            </div>
            <div>
              <label htmlFor="so-email" className={formLabelClass}>
                Email
              </label>
              <input
                id="so-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={formInputClass}
              />
            </div>
            <div>
              <label htmlFor="so-phone" className={formLabelClass}>
                Phone number <span className="font-normal text-muted-foreground">(optional, for SMS)</span>
              </label>
              <input
                id="so-phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={formInputClass}
              />
            </div>
            <div>
              <label htmlFor="so-password" className={formLabelClass}>
                Password
              </label>
              <div className="flex gap-2">
                <input
                  id="so-password"
                  required
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={formInputClass}
                />
                <button
                  type="button"
                  className={adminUserBtnSecondary}
                  onClick={() => setPassword(generateAccountPassword())}
                >
                  Generate
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendSms}
                onChange={(e) => setSendSms(e.target.checked)}
                disabled={!phone.trim()}
              />
              Send credentials SMS {phone.trim() ? "" : "(add phone number)"}
            </label>
            {createError ? <p className="text-sm text-destructive">{createError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className={adminUserBtnSecondary} onClick={() => setMode("list")}>
                Back
              </button>
              <button type="submit" disabled={createSubmitting} className={adminUserBtnPrimary}>
                {createSubmitting ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="search"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${formInputClass} max-w-xs ${inputFocusRing}`}
              />
              <button type="button" className={adminUserBtnPrimary} onClick={() => setMode("create")}>
                Create account
              </button>
            </div>
            {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {!loading && filteredItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subject officers found.</p>
            ) : null}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {filteredItems.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <p className="font-medium text-foreground">{row.full_name}</p>
                    <p className="text-xs text-muted-foreground">{row.email ?? "—"}</p>
                    {row.phone_number ? (
                      <p className="text-xs text-muted-foreground">{row.phone_number}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-primary underline-offset-2 hover:underline"
                    onClick={() => setResetTarget(row)}
                  >
                    Reset password
                  </button>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className={adminUserBtnSecondary}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className={adminUserBtnSecondary}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}

            <div className="space-y-3 rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold text-foreground">Subject assignments</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={formLabelClass} htmlFor="so-assign-exam">
                    Examination
                  </label>
                  <select
                    id="so-assign-exam"
                    className={formInputClass}
                    value={assignExamId}
                    onChange={(e) =>
                      setAssignExamId(e.target.value ? Number(e.target.value) : "")
                    }
                  >
                    <option value="">Select examination…</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {formatExamLabel(ex)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="so-assign-officer">
                    Subject officer
                  </label>
                  <select
                    id="so-assign-officer"
                    className={formInputClass}
                    value={assignOfficerId}
                    onChange={(e) => {
                      setAssignOfficerId(e.target.value);
                      const row = assignments.find((a) => a.user_id === e.target.value);
                      setAssignSubjectIds(row?.subject_ids ?? []);
                    }}
                  >
                    <option value="">Select officer…</option>
                    {items.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {assignExamId !== "" ? (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-border p-2">
                  {subjects.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={assignSubjectIds.includes(s.id)}
                        onChange={(e) => {
                          setAssignSubjectIds((prev) =>
                            e.target.checked
                              ? [...prev, s.id]
                              : prev.filter((id) => id !== s.id),
                          );
                        }}
                      />
                      {s.code} — {s.name}
                    </label>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={adminUserBtnPrimary}
                  disabled={assignBusy}
                  onClick={() => void handleSaveAssignments()}
                >
                  Save assignments
                </button>
                {assignOfficerId ? (
                  <button
                    type="button"
                    className={adminUserBtnSecondary}
                    disabled={assignBusy}
                    onClick={() => void handleDeleteAssignments(assignOfficerId)}
                  >
                    Remove assignments
                  </button>
                ) : null}
              </div>
              {assignMessage ? <p className="text-sm text-muted-foreground">{assignMessage}</p> : null}
              {assignments.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {assignments.map((row) => (
                    <li key={row.user_id}>
                      {row.full_name}: {row.subjects.map((s) => s.subject_code).join(", ")}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}
      </AdminUserModalShell>

      <AdminPasswordResetModal
        title={
          resetTarget ? `Reset password — ${resetTarget.full_name}` : "Reset password"
        }
        open={resetTarget != null}
        onClose={() => setResetTarget(null)}
        onConfirm={(payload) => resetPassword(resetTarget!.id, payload)}
        successMessage={() => {
          const msg = `Password reset for ${resetTarget!.full_name} (${resetTarget!.email ?? resetTarget!.phone_number ?? "account"}). Copy the password below.`;
          onPageMessage?.(msg);
          return msg;
        }}
      />
    </>
  );
}
