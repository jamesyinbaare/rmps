"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Copy, Loader2, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import {
  bulkSendAdminWorkforceInviteSms,
  createAdminWorkforceRosterMember,
  deleteAdminWorkforceRosterMember,
  listAdminWorkforceRoster,
  sendAdminWorkforceInviteSms,
  updateAdminWorkforceRosterMember,
  type Examination,
  type WorkforceRosterCreatePayload,
  type WorkforceRosterRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { WorkforceAvailabilityBadge } from "@/components/workforce/workforce-availability-badge";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
  formatExamLabel: (exam: Examination) => string;
};

type FormState = WorkforceRosterCreatePayload;

const emptyForm = (): FormState => ({
  name: "",
  phone_number: "",
  region: "",
  reference_code: "",
});

function formatSmsSentAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WorkforceRosterPanel({ config, exams, formatExamLabel }: Props) {
  const modalTitleId = useId();
  const [examId, setExamId] = useState<number | null>(null);
  const [rows, setRows] = useState<WorkforceRosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<Record<string, "copied" | "error">>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkforceRosterRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [sendSmsOnCreate, setSendSmsOnCreate] = useState(false);

  useEffect(() => {
    if (exams.length > 0 && examId == null) setExamId(exams[0]!.id);
  }, [examId, exams]);

  const loadRows = useCallback(async () => {
    if (examId == null) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await listAdminWorkforceRoster(config.kind, examId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load roster");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [config.kind, examId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setSendSmsOnCreate(false);
    setModalOpen(true);
  }

  function openEdit(row: WorkforceRosterRow) {
    setEditing(row);
    setForm({
      name: row.name,
      phone_number: row.phone_number ?? "",
      region: row.region ?? "",
      reference_code: row.reference_code ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (examId == null || !form.name.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const payload: WorkforceRosterCreatePayload = {
        name: form.name.trim(),
        phone_number: form.phone_number?.trim() || null,
        region: form.region?.trim() || null,
        reference_code: form.reference_code?.trim() || null,
      };
      if (editing) {
        await updateAdminWorkforceRosterMember(config.kind, examId, editing.id, payload);
        setActionMessage(`${editing.name} updated.`);
      } else {
        await createAdminWorkforceRosterMember(config.kind, examId, payload, {
          sendSms: sendSmsOnCreate,
        });
        setActionMessage(`${payload.name} added.${sendSmsOnCreate ? " SMS invite sent." : ""}`);
      }
      setModalOpen(false);
      await loadRows();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(row: WorkforceRosterRow) {
    if (examId == null) return;
    if (!window.confirm(`Remove ${row.name} from the roster?`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteAdminWorkforceRosterMember(config.kind, examId, row.id);
      setActionMessage(`${row.name} removed.`);
      await loadRows();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyLink(row: WorkforceRosterRow) {
    try {
      await navigator.clipboard.writeText(row.portal_url);
      setCopyState((prev) => ({ ...prev, [row.id]: "copied" }));
      window.setTimeout(() => {
        setCopyState((prev) => {
          if (prev[row.id] !== "copied") return prev;
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }, 2500);
    } catch {
      setCopyState((prev) => ({ ...prev, [row.id]: "error" }));
    }
  }

  async function handleSendSms(row: WorkforceRosterRow) {
    if (examId == null) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await sendAdminWorkforceInviteSms(config.kind, examId, row.id);
      if (result.sent) {
        setActionMessage(`SMS sent to ${row.name}.`);
        await loadRows();
      } else {
        setActionError(result.error ?? "SMS failed");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "SMS failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkSms() {
    if (examId == null || selectedIds.size === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await bulkSendAdminWorkforceInviteSms(config.kind, examId, [...selectedIds]);
      setActionMessage(`SMS invites: ${res.sent_count} sent, ${res.failed_count} failed.`);
      setSelectedIds(new Set());
      await loadRows();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk SMS failed");
    } finally {
      setBusy(false);
    }
  }

  const regionLabel = useMemo(() => {
    const map = Object.fromEntries(REGION_OPTIONS.map((r) => [r.value, r.label]));
    return (value: string | null) => (value ? map[value] ?? value : "—");
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[min(100%,20rem)] flex-1">
          <label className={formLabelClass} htmlFor="workforce-roster-exam">
            Examination
          </label>
          <select
            id="workforce-roster-exam"
            className={formInputClass}
            value={examId ?? ""}
            onChange={(e) => {
              setExamId(e.target.value ? Number(e.target.value) : null);
              setSelectedIds(new Set());
            }}
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {formatExamLabel(ex)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || selectedIds.size === 0} onClick={() => void handleBulkSms()}>
            <MessageSquare className="mr-1.5 size-4" aria-hidden />
            Bulk invite SMS ({selectedIds.size})
          </Button>
          <Button type="button" disabled={busy || examId == null} onClick={openCreate}>
            <Plus className="mr-1.5 size-4" aria-hidden />
            Add {config.label.toLowerCase()}
          </Button>
        </div>
      </div>

      {actionMessage ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm" role="status">
          {actionMessage}
        </p>
      ) : null}
      {actionError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading roster…
        </div>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    aria-label="Select all"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(rows.map((r) => r.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Phone</th>
                <th className="px-3 py-2.5 font-medium">Region</th>
                <th className="px-3 py-2.5 font-medium">Reference</th>
                <th className="px-3 py-2.5 font-medium">Availability</th>
                <th className="px-3 py-2.5 font-medium">Bank</th>
                <th className="px-3 py-2.5 font-medium">Last SMS</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    No {config.labelPlural.toLowerCase()} on this roster yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="bg-card">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        aria-label={`Select ${row.name}`}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.phone_number ?? "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{regionLabel(row.region)}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.reference_code ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <WorkforceAvailabilityBadge status={row.availability_status} />
                    </td>
                    <td className="px-3 py-2.5">{row.has_bank_account ? "✓" : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatSmsSentAt(row.portal_invite_sms_sent_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void handleCopyLink(row)} title="Copy portal link">
                          <Copy className="size-4" aria-hidden />
                          <span className="sr-only">Copy link</span>
                        </Button>
                        {copyState[row.id] === "copied" ? (
                          <span className="self-center text-xs text-emerald-600">Copied</span>
                        ) : null}
                        <Button type="button" size="sm" variant="ghost" disabled={busy || !row.phone_number} onClick={() => void handleSendSms(row)} title="Send SMS invite">
                          <MessageSquare className="size-4" aria-hidden />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => openEdit(row)} title="Edit">
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void handleDelete(row)} title="Remove">
                          <Trash2 className="size-4 text-destructive" aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen ? (
        <OfficialModal
          title={editing ? `Edit ${config.label.toLowerCase()}` : `Add ${config.label.toLowerCase()}`}
          titleId={modalTitleId}
          onRequestClose={() => setModalOpen(false)}
          footer={
            <div className={officialModalFooterClass()}>
              <button type="button" className={officialAccountsBtnSecondary} onClick={() => setModalOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button type="submit" form="workforce-roster-form" className={officialAccountsBtnPrimary} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          }
        >
          <form id="workforce-roster-form" className="space-y-4" onSubmit={(e) => void handleSave(e)}>
            <div>
              <label className={formLabelClass} htmlFor="wf-name">
                Name
              </label>
              <input
                id="wf-name"
                className={formInputClass}
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="wf-phone">
                Phone (required for SMS)
              </label>
              <input
                id="wf-phone"
                className={formInputClass}
                value={form.phone_number ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="wf-region">
                Region
              </label>
              <select
                id="wf-region"
                className={formInputClass}
                value={form.region ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
              >
                <option value="">—</option>
                {REGION_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={formLabelClass} htmlFor="wf-ref">
                Reference code
              </label>
              <input
                id="wf-ref"
                className={formInputClass}
                value={form.reference_code ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, reference_code: e.target.value }))}
              />
            </div>
            {!editing ? (
              <label className={cn("flex items-center gap-2 text-sm")}>
                <input
                  type="checkbox"
                  checked={sendSmsOnCreate}
                  onChange={(e) => setSendSmsOnCreate(e.target.checked)}
                />
                Send portal invite SMS after create
              </label>
            ) : null}
          </form>
        </OfficialModal>
      ) : null}
    </div>
  );
}
