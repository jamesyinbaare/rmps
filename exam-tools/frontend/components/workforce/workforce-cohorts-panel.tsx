"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import {
  createWorkforceExerciseGroup,
  deleteWorkforceExerciseGroup,
  getWorkforceExerciseGroupRelease,
  listAdminWorkforceRoster,
  listWorkforceExerciseGroups,
  notifyWorkforceExerciseGroupAppointmentLetters,
  putWorkforceExerciseGroupRelease,
  setWorkforceExerciseGroupMembers,
  updateWorkforceExerciseGroup,
  type AppointmentLettersReleaseMode,
  type WorkforceExerciseGroupRow,
  type WorkforceExerciseGroupReleaseRow,
  type WorkforceRosterRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  examId: number | null;
  onCohortCountChange?: (count: number) => void;
};

type CohortFormState = {
  name: string;
  venue: string;
  exerciseStartDate: string;
  workStartTime: string;
  workEndTime: string;
};

type ReleaseDraft = {
  enabled: boolean;
  mode: AppointmentLettersReleaseMode;
  releaseAt: string;
  bankDetailsEditable: boolean;
};

function emptyCohortForm(): CohortFormState {
  return { name: "", venue: "", exerciseStartDate: "", workStartTime: "", workEndTime: "" };
}

function dateIsoToInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function dateInputToIso(value: string): string | null {
  return value.trim() ? `${value.trim()}T00:00:00` : null;
}

function timeApiToInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

function timeInputToApi(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatScheduleSummary(group: WorkforceExerciseGroupRow): string {
  const parts: string[] = [];
  if (group.exercise_start_date) {
    try {
      parts.push(
        new Date(group.exercise_start_date).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      );
    } catch {
      parts.push(group.exercise_start_date);
    }
  }
  if (group.work_start_time || group.work_end_time) {
    parts.push(`${timeApiToInput(group.work_start_time) || "—"}–${timeApiToInput(group.work_end_time) || "—"}`);
  }
  if (group.venue) parts.push(group.venue);
  return parts.length > 0 ? parts.join(" · ") : "No schedule set";
}

export function WorkforceCohortsPanel({ config, examId, onCohortCountChange }: Props) {
  const createModalTitleId = useId();

  const [groups, setGroups] = useState<WorkforceExerciseGroupRow[]>([]);
  const [roster, setRoster] = useState<WorkforceRosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CohortFormState>(emptyCohortForm());
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [detailsForm, setDetailsForm] = useState<CohortFormState>(emptyCohortForm());
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsMessage, setDetailsMessage] = useState<string | null>(null);

  const [membersDraft, setMembersDraft] = useState<Set<string>>(new Set());
  const [membersBusy, setMembersBusy] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersMessage, setMembersMessage] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const [release, setRelease] = useState<WorkforceExerciseGroupReleaseRow | null>(null);
  const [releaseDraft, setReleaseDraft] = useState<ReleaseDraft | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    if (examId == null) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setGroups(await listWorkforceExerciseGroups(config.kind, examId));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load cohorts");
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [config.kind, examId]);

  const loadRoster = useCallback(async () => {
    if (examId == null) {
      setRoster([]);
      return;
    }
    try {
      setRoster(await listAdminWorkforceRoster(config.kind, examId));
    } catch {
      setRoster([]);
    }
  }, [config.kind, examId]);

  useEffect(() => {
    void loadGroups();
    void loadRoster();
    setSelectedGroupId(null);
  }, [loadGroups, loadRoster]);

  useEffect(() => {
    onCohortCountChange?.(groups.length);
  }, [groups.length, onCohortCountChange]);

  useEffect(() => {
    if (selectedGroupId == null && groups.length > 0) {
      setSelectedGroupId(groups.find((g) => g.is_default)?.id ?? groups[0]!.id);
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  const loadRelease = useCallback(
    async (groupId: string) => {
      if (examId == null) return;
      setReleaseLoading(true);
      setReleaseError(null);
      try {
        const row = await getWorkforceExerciseGroupRelease(config.kind, examId, groupId);
        setRelease(row);
        setReleaseDraft({
          enabled: row.appointment_letters_release_enabled,
          mode: row.appointment_letters_release_mode,
          releaseAt: isoToDatetimeLocal(row.appointment_letters_release_at),
          bankDetailsEditable: row.bank_details_editable,
        });
      } catch (e) {
        setReleaseError(e instanceof Error ? e.message : "Could not load release settings");
        setRelease(null);
        setReleaseDraft(null);
      } finally {
        setReleaseLoading(false);
      }
    },
    [config.kind, examId],
  );

  useEffect(() => {
    setDetailsError(null);
    setDetailsMessage(null);
    setMembersError(null);
    setMembersMessage(null);
    setReleaseError(null);
    setReleaseMessage(null);
    setMemberSearch("");
    if (!selectedGroup) {
      setDetailsForm(emptyCohortForm());
      setMembersDraft(new Set());
      setRelease(null);
      setReleaseDraft(null);
      return;
    }
    setDetailsForm({
      name: selectedGroup.name,
      venue: selectedGroup.venue ?? "",
      exerciseStartDate: dateIsoToInput(selectedGroup.exercise_start_date),
      workStartTime: timeApiToInput(selectedGroup.work_start_time),
      workEndTime: timeApiToInput(selectedGroup.work_end_time),
    });
    setMembersDraft(new Set(selectedGroup.member_person_ids));
    void loadRelease(selectedGroup.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init on selection change
  }, [selectedGroup?.id]);

  const filteredRoster = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.reference_code ?? "").toLowerCase().includes(q),
    );
  }, [memberSearch, roster]);

  function openCreate() {
    setCreateForm(emptyCohortForm());
    setCreateError(null);
    setCreateModalOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (examId == null || !createForm.name.trim()) return;
    setCreateBusy(true);
    setCreateError(null);
    try {
      const created = await createWorkforceExerciseGroup(config.kind, examId, {
        name: createForm.name.trim(),
        venue: createForm.venue.trim() || null,
        exercise_start_date: dateInputToIso(createForm.exerciseStartDate),
        work_start_time: timeInputToApi(createForm.workStartTime),
        work_end_time: timeInputToApi(createForm.workEndTime),
      });
      setCreateModalOpen(false);
      await loadGroups();
      setSelectedGroupId(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create cohort");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleSaveDetails() {
    if (examId == null || !selectedGroup) return;
    if (!detailsForm.name.trim()) {
      setDetailsError("Cohort name is required.");
      return;
    }
    setDetailsBusy(true);
    setDetailsError(null);
    setDetailsMessage(null);
    try {
      await updateWorkforceExerciseGroup(config.kind, examId, selectedGroup.id, {
        name: detailsForm.name.trim(),
        venue: detailsForm.venue.trim() || null,
        exercise_start_date: dateInputToIso(detailsForm.exerciseStartDate),
        work_start_time: timeInputToApi(detailsForm.workStartTime),
        work_end_time: timeInputToApi(detailsForm.workEndTime),
      });
      await loadGroups();
      setDetailsMessage("Cohort details saved.");
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not save cohort details");
    } finally {
      setDetailsBusy(false);
    }
  }

  async function handleSaveMembers() {
    if (examId == null || !selectedGroup) return;
    setMembersBusy(true);
    setMembersError(null);
    setMembersMessage(null);
    try {
      await setWorkforceExerciseGroupMembers(config.kind, examId, selectedGroup.id, [...membersDraft]);
      await loadGroups();
      setMembersMessage("Membership saved.");
    } catch (err) {
      setMembersError(err instanceof Error ? err.message : "Could not save membership");
    } finally {
      setMembersBusy(false);
    }
  }

  async function handleDelete() {
    if (examId == null || !selectedGroup) return;
    if (!window.confirm(`Delete cohort "${selectedGroup.name}"? Members return to the default cohort.`)) return;
    setDeleteBusy(true);
    setDetailsError(null);
    try {
      await deleteWorkforceExerciseGroup(config.kind, examId, selectedGroup.id);
      setSelectedGroupId(null);
      await loadGroups();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : "Could not delete cohort");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleSaveRelease(overrides?: Partial<ReleaseDraft>) {
    if (examId == null || !selectedGroup || !releaseDraft) return;
    const next: ReleaseDraft = { ...releaseDraft, ...overrides };
    if (next.enabled && next.mode === "scheduled_date" && !next.releaseAt.trim()) {
      setReleaseError("Set a release date and time when using scheduled release.");
      return;
    }
    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseMessage(null);
    try {
      const row = await putWorkforceExerciseGroupRelease(config.kind, examId, selectedGroup.id, {
        appointment_letters_release_enabled: next.enabled,
        appointment_letters_release_mode: next.mode,
        appointment_letters_release_at: next.mode === "scheduled_date" ? datetimeLocalToIso(next.releaseAt) : null,
        bank_details_editable: next.bankDetailsEditable,
      });
      setRelease(row);
      setReleaseDraft({
        enabled: row.appointment_letters_release_enabled,
        mode: row.appointment_letters_release_mode,
        releaseAt: isoToDatetimeLocal(row.appointment_letters_release_at),
        bankDetailsEditable: row.bank_details_editable,
      });
      setReleaseMessage("Release settings saved.");
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Could not save release settings");
    } finally {
      setReleaseBusy(false);
    }
  }

  async function handleToggleRelease(enabled: boolean) {
    setReleaseDraft((prev) => (prev ? { ...prev, enabled } : prev));
    await handleSaveRelease({ enabled });
  }

  async function handleNotify() {
    if (examId == null || !selectedGroup) return;
    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseMessage(null);
    try {
      const result = await notifyWorkforceExerciseGroupAppointmentLetters(config.kind, examId, selectedGroup.id);
      await loadRelease(selectedGroup.id);
      setReleaseMessage(
        `SMS sent to ${result.sms_sent_count} ${config.label.toLowerCase()}(s).` +
          (result.sms_failed_count ? ` ${result.sms_failed_count} failed.` : "") +
          (result.skipped_count ? ` ${result.skipped_count} skipped.` : ""),
      );
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Could not send notifications");
    } finally {
      setReleaseBusy(false);
    }
  }

  if (examId == null) {
    return <p className="text-sm text-muted-foreground">Select an examination to manage cohorts.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Assign exercise dates, venues, and letter release per cohort. Everyone starts in the default cohort.
        </p>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 size-4" aria-hidden />
          New cohort
        </Button>
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading cohorts…
        </div>
      ) : loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">No cohorts yet.</p>
          <Button type="button" size="sm" className="mt-3" onClick={openCreate}>
            <Plus className="mr-1.5 size-3.5" aria-hidden />
            Create first cohort
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] md:items-start">
          <nav
            className="overflow-hidden rounded-xl border border-border"
            aria-label="Cohorts"
          >
            <ul className="divide-y divide-border">
              {groups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-3 text-left transition-colors hover:bg-muted/40",
                      selectedGroupId === g.id && "bg-primary/5 ring-1 ring-inset ring-primary/25",
                    )}
                    onClick={() => setSelectedGroupId(g.id)}
                    aria-current={selectedGroupId === g.id ? "true" : undefined}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <span className="min-w-0 truncate">{g.name}</span>
                      {g.is_default ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {g.member_count} member{g.member_count === 1 ? "" : "s"}
                      {" · "}
                      {g.appointment_letters_release_enabled ? "Letters on" : "Letters off"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{formatScheduleSummary(g)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {selectedGroup ? (
            <div className="min-w-0 space-y-6 rounded-xl border border-border p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{selectedGroup.name}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatScheduleSummary(selectedGroup)}</p>
            </div>
            {!selectedGroup.is_default ? (
              <Button type="button" variant="ghost" size="sm" disabled={deleteBusy} onClick={() => void handleDelete()}>
                <Trash2 className="mr-1.5 size-3.5 text-destructive" aria-hidden />
                <span className="text-destructive">Delete</span>
              </Button>
            ) : null}
          </div>

          <section className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedule &amp; venue</p>
            {detailsError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {detailsError}
              </p>
            ) : null}
            {detailsMessage ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
                {detailsMessage}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={formLabelClass} htmlFor="cohort-name">
                  Name
                </label>
                <input
                  id="cohort-name"
                  className={formInputClass}
                  value={detailsForm.name}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor="cohort-venue">
                  Venue
                </label>
                <input
                  id="cohort-venue"
                  className={formInputClass}
                  value={detailsForm.venue}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, venue: e.target.value }))}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor="cohort-start-date">
                  Exercise start date
                </label>
                <input
                  id="cohort-start-date"
                  type="date"
                  className={formInputClass}
                  value={detailsForm.exerciseStartDate}
                  onChange={(e) => setDetailsForm((f) => ({ ...f, exerciseStartDate: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={formLabelClass} htmlFor="cohort-work-start">
                    Work start
                  </label>
                  <input
                    id="cohort-work-start"
                    type="time"
                    className={formInputClass}
                    value={detailsForm.workStartTime}
                    onChange={(e) => setDetailsForm((f) => ({ ...f, workStartTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="cohort-work-end">
                    Work end
                  </label>
                  <input
                    id="cohort-work-end"
                    type="time"
                    className={formInputClass}
                    value={detailsForm.workEndTime}
                    onChange={(e) => setDetailsForm((f) => ({ ...f, workEndTime: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <Button type="button" size="sm" disabled={detailsBusy} onClick={() => void handleSaveDetails()}>
              {detailsBusy ? "Saving…" : "Save schedule"}
            </Button>
          </section>

          {/* Members */}
          <section className="space-y-3 border-t border-border/70 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Members ({membersDraft.size})
              </p>
              <Button type="button" size="sm" disabled={membersBusy} onClick={() => void handleSaveMembers()}>
                {membersBusy ? "Saving…" : "Save members"}
              </Button>
            </div>
            {membersError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {membersError}
              </p>
            ) : null}
            {membersMessage ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
                {membersMessage}
              </p>
            ) : null}
            <input
              type="search"
              className={formInputClass}
              placeholder="Search roster by name or reference code…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {roster.length === 0 ? (
                <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <Users className="size-4" aria-hidden />
                  No {config.labelPlural.toLowerCase()} on the roster yet.
                </p>
              ) : filteredRoster.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">No matches.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {filteredRoster.map((person) => (
                    <li key={person.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/30">
                        <input
                          type="checkbox"
                          checked={membersDraft.has(person.id)}
                          onChange={(e) => {
                            setMembersDraft((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(person.id);
                              else next.delete(person.id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">{person.name}</span>
                        {person.reference_code ? (
                          <span className="shrink-0 font-mono text-xs text-muted-foreground">{person.reference_code}</span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Release */}
          <section className="space-y-3 border-t border-border/70 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Appointment letter release
                </p>
                {release ? (
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                    <div>
                      <dt className="font-medium text-foreground">Rostered</dt>
                      <dd>{release.rostered_person_count}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Pending</dt>
                      <dd>{release.pending_release_count}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Eligible now</dt>
                      <dd>{release.eligible_now_count}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-foreground">Notified</dt>
                      <dd>{release.notified_count}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={releaseLoading || releaseBusy || !releaseDraft?.enabled}
                onClick={() => void handleNotify()}
              >
                {releaseBusy ? "Working…" : `Notify eligible ${config.labelPlural.toLowerCase()}`}
              </Button>
            </div>

            {releaseLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : releaseDraft ? (
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-border"
                    checked={releaseDraft.enabled}
                    disabled={releaseBusy}
                    onChange={(e) => void handleToggleRelease(e.target.checked)}
                  />
                  Enable appointment letter release
                </label>

                <label className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/15 px-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-border"
                    checked={releaseDraft.bankDetailsEditable}
                    disabled={releaseBusy}
                    onChange={(e) =>
                      setReleaseDraft((prev) => (prev ? { ...prev, bankDetailsEditable: e.target.checked } : prev))
                    }
                  />
                  <span>
                    <span className="font-medium text-foreground">Allow bank details to be entered/edited</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      Independent of appointment letter release.
                    </span>
                  </span>
                </label>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    When letters become available
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`release-mode-${selectedGroup.id}`}
                        checked={releaseDraft.mode === "on_acceptance"}
                        disabled={releaseBusy}
                        onChange={() => setReleaseDraft((prev) => (prev ? { ...prev, mode: "on_acceptance" } : prev))}
                      />
                      When they confirm availability
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`release-mode-${selectedGroup.id}`}
                        checked={releaseDraft.mode === "scheduled_date"}
                        disabled={releaseBusy}
                        onChange={() => setReleaseDraft((prev) => (prev ? { ...prev, mode: "scheduled_date" } : prev))}
                      />
                      On a fixed date
                    </label>
                  </div>
                </div>

                {releaseDraft.mode === "scheduled_date" ? (
                  <div className="max-w-xs">
                    <label className={formLabelClass} htmlFor="cohort-release-at">
                      Release date and time (UTC)
                    </label>
                    <input
                      id="cohort-release-at"
                      type="datetime-local"
                      className={formInputClass}
                      value={releaseDraft.releaseAt}
                      disabled={releaseBusy}
                      onChange={(e) => setReleaseDraft((prev) => (prev ? { ...prev, releaseAt: e.target.value } : prev))}
                    />
                  </div>
                ) : null}

                <Button type="button" size="sm" disabled={releaseBusy} onClick={() => void handleSaveRelease()}>
                  {releaseBusy ? "Saving…" : "Save release settings"}
                </Button>
              </div>
            ) : null}
            {releaseError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {releaseError}
              </p>
            ) : null}
            {releaseMessage ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
                {releaseMessage}
              </p>
            ) : null}
          </section>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Select a cohort to manage its schedule, members, and letter release.
            </p>
          )}
        </div>
      )}

      {createModalOpen ? (
        <OfficialModal
          title="New cohort"
          titleId={createModalTitleId}
          onRequestClose={() => setCreateModalOpen(false)}
          footer={
            <div className={officialModalFooterClass()}>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={() => setCreateModalOpen(false)}
                disabled={createBusy}
              >
                Cancel
              </button>
              <button type="submit" form="workforce-cohort-create-form" className={officialAccountsBtnPrimary} disabled={createBusy}>
                {createBusy ? "Creating…" : "Create"}
              </button>
            </div>
          }
        >
          <form id="workforce-cohort-create-form" className="space-y-4" onSubmit={(e) => void handleCreate(e)}>
            {createError ? (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            ) : null}
            <div>
              <label className={formLabelClass} htmlFor="new-cohort-name">
                Name
              </label>
              <input
                id="new-cohort-name"
                className={formInputClass}
                required
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="new-cohort-venue">
                Venue
              </label>
              <input
                id="new-cohort-venue"
                className={formInputClass}
                value={createForm.venue}
                onChange={(e) => setCreateForm((f) => ({ ...f, venue: e.target.value }))}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="new-cohort-start-date">
                Exercise start date
              </label>
              <input
                id="new-cohort-start-date"
                type="date"
                className={formInputClass}
                value={createForm.exerciseStartDate}
                onChange={(e) => setCreateForm((f) => ({ ...f, exerciseStartDate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={formLabelClass} htmlFor="new-cohort-work-start">
                  Work start
                </label>
                <input
                  id="new-cohort-work-start"
                  type="time"
                  className={formInputClass}
                  value={createForm.workStartTime}
                  onChange={(e) => setCreateForm((f) => ({ ...f, workStartTime: e.target.value }))}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor="new-cohort-work-end">
                  Work end
                </label>
                <input
                  id="new-cohort-work-end"
                  type="time"
                  className={formInputClass}
                  value={createForm.workEndTime}
                  onChange={(e) => setCreateForm((f) => ({ ...f, workEndTime: e.target.value }))}
                />
              </div>
            </div>
          </form>
        </OfficialModal>
      ) : null}
    </div>
  );
}
