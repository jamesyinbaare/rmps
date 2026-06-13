"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { SubjectScopePicker } from "@/components/subject-scope-picker";
import { Button } from "@/components/ui/button";
import {
  downloadExaminerAppointmentLetterPreviewPdf,
  getExaminerAppointmentLetterReferences,
  getExaminerPortalSettings,
  notifyEligibleAppointmentLetters,
  putExaminerAppointmentLetterReferences,
  putExaminerPortalSettings,
  type ExaminerAppointmentLetterReferencePutCell,
  type ExaminerPortalSettings,
  type ExaminerTypeApi,
  type ExaminationExaminerAppointmentLetterReferencesResponse,
} from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type Props = {
  examId: number;
  className?: string;
};

type DraftCell = {
  referenceNumber: string;
};

function cellKey(subjectId: number, examinerType: ExaminerTypeApi): string {
  return `${subjectId}:${examinerType}`;
}

export function ExaminersAppointmentLettersPanel({ examId, className }: Props) {
  const [settings, setSettings] = useState<ExaminerPortalSettings | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

  const [data, setData] = useState<ExaminationExaminerAppointmentLetterReferencesResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsSaving, setRefsSaving] = useState(false);
  const [previewBusyKey, setPreviewBusyKey] = useState<string | null>(null);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [refsMessage, setRefsMessage] = useState<string | null>(null);

  const savedByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of data?.items ?? []) {
      const ref = (item.reference_number ?? "").trim();
      if (ref) map.set(cellKey(item.subject_id, item.examiner_type), ref);
    }
    return map;
  }, [data]);

  const timetableSubjects = data?.subjects ?? [];

  const selectedSubject = useMemo(
    () => timetableSubjects.find((s) => s.id === selectedSubjectId) ?? null,
    [selectedSubjectId, timetableSubjects],
  );

  const loadRelease = useCallback(async () => {
    setReleaseLoading(true);
    setReleaseError(null);
    try {
      const row = await getExaminerPortalSettings(examId);
      setSettings(row);
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "Could not load portal settings");
      setSettings(null);
    } finally {
      setReleaseLoading(false);
    }
  }, [examId]);

  const loadReferences = useCallback(async () => {
    setRefsLoading(true);
    setRefsError(null);
    try {
      const row = await getExaminerAppointmentLetterReferences(examId);
      setData(row);
      const nextDraft: Record<string, DraftCell> = {};
      for (const item of row.items) {
        nextDraft[cellKey(item.subject_id, item.examiner_type)] = {
          referenceNumber: item.reference_number ?? "",
        };
      }
      setDraft(nextDraft);
    } catch (e) {
      setRefsError(e instanceof Error ? e.message : "Could not load appointment letter references");
      setData(null);
      setDraft({});
    } finally {
      setRefsLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    void loadRelease();
    void loadReferences();
  }, [loadRelease, loadReferences]);

  async function handleToggleRelease(enabled: boolean) {
    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseMessage(null);
    try {
      const row = await putExaminerPortalSettings(examId, enabled);
      setSettings(row);
      setReleaseMessage(enabled ? "Appointment letter release enabled." : "Appointment letter release disabled.");
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "Could not update settings");
    } finally {
      setReleaseBusy(false);
    }
  }

  async function handleNotify() {
    setReleaseBusy(true);
    setReleaseError(null);
    setReleaseMessage(null);
    try {
      const result = await notifyEligibleAppointmentLetters(examId);
      await loadRelease();
      setReleaseMessage(
        `SMS sent to ${result.sms_sent_count} examiner(s).` +
          (result.sms_failed_count ? ` ${result.sms_failed_count} failed.` : "") +
          (result.skipped_count ? ` ${result.skipped_count} skipped.` : ""),
      );
    } catch (e) {
      setReleaseError(e instanceof Error ? e.message : "Could not send notifications");
    } finally {
      setReleaseBusy(false);
    }
  }

  function updateDraft(subjectId: number, examinerType: ExaminerTypeApi, referenceNumber: string) {
    setDraft((prev) => ({
      ...prev,
      [cellKey(subjectId, examinerType)]: { referenceNumber },
    }));
  }

  async function handleSaveReferences() {
    if (!selectedSubject) return;
    setRefsSaving(true);
    setRefsError(null);
    setRefsMessage(null);
    try {
      const items: ExaminerAppointmentLetterReferencePutCell[] = [];
      for (const role of EXAMINER_TYPE_OPTIONS) {
        const key = cellKey(selectedSubject.id, role.value);
        const value = (draft[key]?.referenceNumber ?? "").trim();
        const hadSaved = savedByKey.has(key);
        if (value || hadSaved) {
          items.push({
            subject_id: selectedSubject.id,
            examiner_type: role.value,
            reference_number: value || null,
          });
        }
      }
      const row = await putExaminerAppointmentLetterReferences(examId, items);
      setData(row);
      const nextDraft: Record<string, DraftCell> = {};
      for (const item of row.items) {
        nextDraft[cellKey(item.subject_id, item.examiner_type)] = {
          referenceNumber: item.reference_number ?? "",
        };
      }
      setDraft(nextDraft);
      setRefsMessage(`Reference numbers saved for ${selectedSubject.code}.`);
    } catch (e) {
      setRefsError(e instanceof Error ? e.message : "Could not save references");
    } finally {
      setRefsSaving(false);
    }
  }

  async function handlePreview(subjectId: number, examinerType: ExaminerTypeApi, subjectCode: string) {
    const key = cellKey(subjectId, examinerType);
    const savedRef = savedByKey.get(key);
    if (!savedRef) {
      setRefsError("Save a reference number for this role before downloading a preview.");
      return;
    }
    setPreviewBusyKey(key);
    setRefsError(null);
    try {
      const roleLabel = EXAMINER_TYPE_OPTIONS.find((r) => r.value === examinerType)?.label ?? examinerType;
      await downloadExaminerAppointmentLetterPreviewPdf(
        examId,
        subjectId,
        examinerType,
        `appointment_letter_preview_${subjectCode}_${roleLabel.replace(/\s+/g, "_")}.pdf`,
      );
    } catch (e) {
      setRefsError(e instanceof Error ? e.message : "Could not download preview");
    } finally {
      setPreviewBusyKey(null);
    }
  }

  return (
    <div className={cn("space-y-6 px-3 py-4 md:px-4", className)}>
      <section className="rounded-2xl border border-border/70 bg-card/90 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Release to examiners</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Examiners can upload bank details and download appointment letters after their coordination
              period ends, once release is enabled.
            </p>
            {settings ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                <div>
                  <dt className="font-medium text-foreground">Rostered</dt>
                  <dd>{settings.rostered_examiner_count}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">With coordination end</dt>
                  <dd>{settings.with_coordination_end_count}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Eligible now</dt>
                  <dd>{settings.eligible_now_count}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Notified</dt>
                  <dd>{settings.notified_count}</dd>
                </div>
              </dl>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={settings?.appointment_letters_release_enabled ?? false}
                disabled={releaseLoading || releaseBusy || settings == null}
                onChange={(e) => void handleToggleRelease(e.target.checked)}
              />
              Enable release
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={releaseLoading || releaseBusy || !settings?.appointment_letters_release_enabled}
              onClick={() => void handleNotify()}
            >
              {releaseBusy ? "Working…" : "Notify eligible examiners"}
            </Button>
          </div>
        </div>
        {releaseLoading ? <p className="mt-2 text-xs text-muted-foreground">Loading…</p> : null}
        {releaseError ? (
          <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {releaseError}
          </p>
        ) : null}
        {releaseMessage ? (
          <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
            {releaseMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Letter reference numbers</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Choose a subject, then enter the reference number that should appear on each role&apos;s appointment
              letter. You can download a preview with a blank name line to check the layout before letters go out.
              Any role you leave empty will keep the automatically generated reference on real letters.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={refsLoading || refsSaving || selectedSubject == null}
            onClick={() => void handleSaveReferences()}
          >
            {refsSaving ? "Saving…" : "Save references"}
          </Button>
        </div>

        {refsError ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {refsError}
          </p>
        ) : null}
        {refsMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
            {refsMessage}
          </p>
        ) : null}

        {refsLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading references…
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <SubjectScopePicker
              subjects={timetableSubjects}
              selectedSubjectId={selectedSubjectId}
              onSelectedSubjectIdChange={setSelectedSubjectId}
              subjectComboboxId="appt-letter-ref-subject"
              resetKey={examId}
              disabled={refsLoading || refsSaving}
            />

            {selectedSubject == null ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                Select a subject to set reference numbers for each examiner role.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">
                  {subjectDisplayLabel(selectedSubject)}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {EXAMINER_TYPE_OPTIONS.map((role) => {
                    const key = cellKey(selectedSubject.id, role.value);
                    const savedRef = savedByKey.get(key);
                    return (
                      <div
                        key={role.value}
                        className="rounded-xl border border-border bg-muted/15 p-3"
                      >
                        <label
                          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                          htmlFor={`appt-ref-${selectedSubject.id}-${role.value}`}
                        >
                          {role.label}
                        </label>
                        <input
                          id={`appt-ref-${selectedSubject.id}-${role.value}`}
                          type="text"
                          className={cn(formInputClass, "mt-2 font-mono text-xs")}
                          value={draft[key]?.referenceNumber ?? ""}
                          placeholder="e.g. CTVET/EXM/2026/MATH301/CE"
                          onChange={(e) => updateDraft(selectedSubject.id, role.value, e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2 h-8 w-full justify-start gap-1.5 text-xs"
                          disabled={!savedRef || previewBusyKey === key}
                          onClick={() => void handlePreview(selectedSubject.id, role.value, selectedSubject.code)}
                        >
                          {previewBusyKey === key ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FileDown className="size-3.5" aria-hidden />
                          )}
                          Preview PDF
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
