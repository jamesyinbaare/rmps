"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, FileDown, Loader2, MessageSquare, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { ExaminersAdminToolbar } from "@/components/examiners/toolbar/examiners-admin-toolbar";
import { ExaminersSelectionBar } from "@/components/examiners/toolbar/examiners-selection-bar";
import {
  ExaminersToolsMenu,
  type ExaminersToolsMenuSection,
} from "@/components/examiners/toolbar/examiners-tools-menu";
import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import { WorkforceAvailabilityBadge } from "@/components/workforce/workforce-availability-badge";
import {
  bulkSendAdminWorkforceInviteSms,
  createAdminWorkforceRosterMember,
  deleteAdminWorkforceRosterMember,
  downloadAdminWorkforceRosterBulkUploadTemplate,
  listAdminWorkforceRoster,
  sendAdminWorkforceInviteSms,
  updateAdminWorkforceRosterMember,
  uploadAdminWorkforceRosterBulkUpload,
  type Examination,
  type WorkforceBulkImportResponse,
  type WorkforceRosterCreatePayload,
  type WorkforceRosterRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsCommandBarSearchClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
  examId: number | null;
  onRosterCountChange?: (count: number) => void;
};

type FormState = WorkforceRosterCreatePayload;

const emptyForm = (): FormState => ({
  name: "",
  phone_number: "",
  region: "",
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

function matchesSearch(row: WorkforceRosterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.name.toLowerCase().includes(q) ||
    (row.phone_number ?? "").toLowerCase().includes(q) ||
    (row.reference_code ?? "").toLowerCase().includes(q) ||
    (row.region ?? "").toLowerCase().includes(q)
  );
}

export function WorkforceRosterPanel({ config, exams, examId, onRosterCountChange }: Props) {
  const modalTitleId = useId();
  const bulkTitleId = useId();
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

  const [searchQuery, setSearchQuery] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSendSms, setBulkSendSms] = useState(false);
  const [bulkResult, setBulkResult] = useState<WorkforceBulkImportResponse | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

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
    setSelectedIds(new Set());
    setSearchQuery("");
    setBulkResult(null);
    setBulkError(null);
  }, [loadRows]);

  useEffect(() => {
    onRosterCountChange?.(rows.length);
  }, [onRosterCountChange, rows.length]);

  useEffect(() => {
    if (!actionMessage) return;
    const t = window.setTimeout(() => setActionMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [actionMessage]);

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(row, searchQuery)),
    [rows, searchQuery],
  );

  const allSelected = filteredRows.length > 0 && filteredRows.every((r) => selectedIds.has(r.id));

  const referenceCodeExample = useMemo(() => {
    const year = exams.find((e) => e.id === examId)?.year ?? new Date().getFullYear();
    const prefix = config.kind === "data-entry-clerk" ? "DE" : "SC";
    return `${prefix}${year}-1`;
  }, [config.kind, examId, exams]);

  const regionLabel = useMemo(() => {
    const map = Object.fromEntries(REGION_OPTIONS.map((r) => [r.value, r.label]));
    return (value: string | null) => (value ? map[value] ?? value : "—");
  }, []);

  const toolsSections = useMemo((): ExaminersToolsMenuSection[] => {
    const sections: ExaminersToolsMenuSection[] = [];
    if (selectedIds.size === 0) {
      sections.push({
        label: "Communications",
        items: [
          {
            key: "sms",
            label:
              filteredRows.length > 0
                ? `Send SMS invites (${filteredRows.length})`
                : "Send SMS invites",
            icon: MessageSquare,
            disabled: filteredRows.length === 0,
          },
        ],
      });
    }
    sections.push({
      label: "Admin",
      items: [{ key: "bulk-upload", label: "Bulk upload from Excel", icon: Upload }],
    });
    return sections;
  }, [filteredRows.length, selectedIds.size]);

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
    });
    setModalOpen(true);
  }

  function openBulk() {
    setBulkError(null);
    setBulkResult(null);
    setBulkOpen(true);
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

  async function handleBulkSms(ids?: string[]) {
    if (examId == null) return;
    const targets = ids ?? [...selectedIds];
    if (targets.length === 0) {
      const filteredIds = filteredRows.map((r) => r.id);
      if (filteredIds.length === 0) return;
      if (
        !window.confirm(
          `Send portal invite SMS to all ${filteredIds.length} visible ${config.labelPlural.toLowerCase()}?`,
        )
      ) {
        return;
      }
      targets.push(...filteredIds);
    }
    setBusy(true);
    setActionError(null);
    try {
      const res = await bulkSendAdminWorkforceInviteSms(config.kind, examId, targets);
      setActionMessage(`SMS invites: ${res.sent_count} sent, ${res.failed_count} failed.`);
      setSelectedIds(new Set());
      await loadRows();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk SMS failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadTemplate() {
    if (examId == null) return;
    setBulkError(null);
    try {
      await downloadAdminWorkforceRosterBulkUploadTemplate(config.kind, examId);
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Could not download template");
    }
  }

  async function handleBulkUpload(file: File | null) {
    if (examId == null || !file) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const result = await uploadAdminWorkforceRosterBulkUpload(config.kind, examId, file, {
        sendSms: bulkSendSms,
      });
      setBulkResult(result);
      await loadRows();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : "Bulk upload failed");
    } finally {
      setBulkBusy(false);
      if (bulkFileRef.current) bulkFileRef.current.value = "";
    }
  }

  function handleToolsSelect(key: string) {
    if (key === "sms") void handleBulkSms();
    else if (key === "bulk-upload") openBulk();
  }

  const actionsDisabled = busy || examId == null;

  return (
    <div className="space-y-4">
      <ExaminersAdminToolbar
        embedded
        toolbarLabel={`${config.labelPlural} roster actions`}
        search={
          <input
            id="workforce-roster-search"
            type="search"
            aria-label={`Search ${config.labelPlural.toLowerCase()}`}
            className={cn(officialAccountsCommandBarSearchClass, "w-full min-w-0 sm:max-w-xs md:max-w-sm")}
            placeholder="Search name, phone, or reference…"
            value={searchQuery}
            disabled={loading || examId == null}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        }
        discoverActions={null}
        pageActions={
          <>
            <ExaminersToolsMenu
              sections={toolsSections}
              disabled={actionsDisabled}
              onSelect={handleToolsSelect}
            />
            <button
              type="button"
              className={officialAccountsBtnPrimary}
              disabled={actionsDisabled}
              onClick={openCreate}
            >
              Add {config.label.toLowerCase()}
            </button>
          </>
        }
        selectionBar={
          <ExaminersSelectionBar
            selectedCount={selectedIds.size}
            onClearSelection={() => setSelectedIds(new Set())}
            disabled={actionsDisabled}
          >
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={actionsDisabled}
              onClick={() => void handleBulkSms([...selectedIds])}
            >
              <MessageSquare className="mr-1.5 size-3.5" aria-hidden />
              Send SMS ({selectedIds.size})
            </Button>
          </ExaminersSelectionBar>
        }
      />

      <div className="space-y-3 px-3 py-4 sm:px-5 sm:py-5">
        {actionMessage ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm" role="status">
            {actionMessage}
          </p>
        ) : null}
        {actionError ? (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
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
                      aria-label="Select all visible"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filteredRows.map((r) => r.id)));
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
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                      {rows.length === 0 ? (
                        <div className="space-y-3">
                          <p>No {config.labelPlural.toLowerCase()} on this roster yet.</p>
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <Button type="button" size="sm" onClick={openCreate}>
                              <Plus className="mr-1.5 size-3.5" aria-hidden />
                              Add one
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={openBulk}>
                              <Upload className="mr-1.5 size-3.5" aria-hidden />
                              Bulk upload
                            </Button>
                          </div>
                        </div>
                      ) : (
                        `No matches for “${searchQuery.trim()}”.`
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
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
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                        {row.reference_code ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <WorkforceAvailabilityBadge status={row.availability_status} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{row.has_bank_account ? "Yes" : "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {formatSmsSentAt(row.portal_invite_sms_sent_at)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void handleCopyLink(row)}
                            title="Copy portal link"
                          >
                            <Copy className="size-4" aria-hidden />
                            <span className="sr-only">Copy link</span>
                          </Button>
                          {copyState[row.id] === "copied" ? (
                            <span className="self-center text-xs text-emerald-600">Copied</span>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy || !row.phone_number}
                            onClick={() => void handleSendSms(row)}
                            title="Send SMS invite"
                          >
                            <MessageSquare className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => openEdit(row)}
                            title="Edit"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void handleDelete(row)}
                            title="Remove"
                          >
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
      </div>

      {modalOpen ? (
        <OfficialModal
          title={editing ? `Edit ${config.label.toLowerCase()}` : `Add ${config.label.toLowerCase()}`}
          titleId={modalTitleId}
          onRequestClose={() => setModalOpen(false)}
          footer={
            <div className={officialModalFooterClass()}>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => setModalOpen(false)}
                disabled={busy}
              >
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
            {editing?.reference_code ? (
              <div>
                <p className={formLabelClass}>Reference code</p>
                <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 font-mono text-sm text-foreground">
                  {editing.reference_code}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Reference code is assigned when they confirm availability via the portal (e.g.{" "}
                {referenceCodeExample}).
              </p>
            )}
            {!editing ? (
              <label className="flex items-center gap-2 text-sm">
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

      {bulkOpen ? (
        <OfficialModal
          title="Bulk upload from Excel"
          titleId={bulkTitleId}
          onRequestClose={() => {
            if (!bulkBusy) setBulkOpen(false);
          }}
          footer={
            <div className={officialModalFooterClass()}>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => setBulkOpen(false)}
                disabled={bulkBusy}
              >
                {bulkResult ? "Close" : "Cancel"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download the template, fill in names, phone numbers, and regions, then upload to add many{" "}
              {config.labelPlural.toLowerCase()} at once.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={examId == null || bulkBusy}
                onClick={() => void handleDownloadTemplate()}
              >
                <FileDown className="mr-1.5 size-3.5" aria-hidden />
                Download template
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={bulkBusy || examId == null}
                onClick={() => bulkFileRef.current?.click()}
              >
                {bulkBusy ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-1.5 size-3.5" aria-hidden />
                )}
                {bulkBusy ? "Uploading…" : "Upload file"}
              </Button>
              <input
                ref={bulkFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void handleBulkUpload(file);
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={bulkSendSms}
                disabled={bulkBusy}
                onChange={(e) => setBulkSendSms(e.target.checked)}
              />
              Send SMS invites to newly created rows
            </label>
            {bulkError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {bulkError}
              </p>
            ) : null}
            {bulkResult ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
                <p>
                  {bulkResult.created_count} {config.labelPlural.toLowerCase()} created
                  {bulkResult.errors.length > 0 ? `, ${bulkResult.errors.length} row(s) had errors.` : "."}
                </p>
                {bulkResult.errors.length > 0 ? (
                  <ul className="mt-1.5 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-destructive">
                    {bulkResult.errors.map((err, i) => (
                      <li key={i}>
                        Row {err.row_number}: {err.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </OfficialModal>
      ) : null}
    </div>
  );
}
