"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Loader2, Plus, Trash2 } from "lucide-react";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { SubjectScopePicker } from "@/components/subject-scope-picker";
import { Button } from "@/components/ui/button";
import {
  copyExaminerAppointmentLetterSettingsFrom,
  deleteExaminerAppointmentLetterSignature,
  downloadExaminerAppointmentLetterPreviewPdf,
  fetchExaminerAppointmentLetterSignatureBlobUrl,
  getExaminerAppointmentLetterReferences,
  getExaminerAppointmentLetterSettings,
  getExaminerPortalSettings,
  notifyEligibleAppointmentLetters,
  putExaminerAppointmentLetterReferences,
  putExaminerAppointmentLetterSettings,
  uploadExaminerAppointmentLetterSignature,
  type AppointmentLetterSignatureRole,
  type AppointmentLetterSigningOfficial,
  type ExaminerAppointmentLetterReferencePutCell,
  type ExaminerAppointmentLetterSettings,
  type ExaminerPortalSettings,
  type ExaminerTypeApi,
  type Examination,
  type ExaminationExaminerAppointmentLetterReferencesResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { formatExamLabel } from "@/lib/official-rates-draft";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type Props = {
  examId: number;
  exams: Examination[];
  className?: string;
};

type DraftCell = {
  referenceNumber: string;
};

type LetterSettingsDraft = {
  signingOfficial: AppointmentLetterSigningOfficial;
  signedForDirectorGeneral: boolean;
  directorGeneralName: string;
  directorGeneralTitle: string;
  directorAssessmentName: string;
  directorAssessmentTitle: string;
  valediction: string;
  letterDate: string;
  ccLines: string[];
};

function cellKey(subjectId: number, examinerType: ExaminerTypeApi): string {
  return `${subjectId}:${examinerType}`;
}

function settingsToDraft(row: ExaminerAppointmentLetterSettings): LetterSettingsDraft {
  return {
    signingOfficial: row.signing_official,
    signedForDirectorGeneral: row.signed_for_director_general,
    directorGeneralName: row.director_general_name,
    directorGeneralTitle: row.director_general_title,
    directorAssessmentName: row.director_assessment_name,
    directorAssessmentTitle: row.director_assessment_title,
    valediction: row.valediction,
    letterDate: row.letter_date ?? "",
    ccLines: row.cc_lines.length > 0 ? [...row.cc_lines] : [""],
  };
}

function SignaturePreview({
  examId,
  role,
  hasSignature,
  refreshKey,
}: {
  examId: number;
  role: AppointmentLetterSignatureRole;
  hasSignature: boolean;
  refreshKey: number;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      if (!hasSignature) {
        setSrc(null);
        return;
      }
      setLoading(true);
      try {
        objectUrl = await fetchExaminerAppointmentLetterSignatureBlobUrl(examId, role);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [examId, role, hasSignature, refreshKey]);

  if (!hasSignature) return null;
  if (loading) {
    return <p className="mt-2 text-xs text-muted-foreground">Loading preview…</p>;
  }
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="mt-2 max-h-16 max-w-[200px] rounded border border-border bg-white object-contain p-1"
    />
  );
}

export function ExaminersAppointmentLettersPanel({ examId, exams, className }: Props) {
  const [settings, setSettings] = useState<ExaminerPortalSettings | null>(null);
  const [releaseLoading, setReleaseLoading] = useState(true);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

  const [letterSettings, setLetterSettings] = useState<ExaminerAppointmentLetterSettings | null>(null);
  const [letterDraft, setLetterDraft] = useState<LetterSettingsDraft | null>(null);
  const [letterLoading, setLetterLoading] = useState(true);
  const [letterSaving, setLetterSaving] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterMessage, setLetterMessage] = useState<string | null>(null);
  const [signatureBusyRole, setSignatureBusyRole] = useState<AppointmentLetterSignatureRole | null>(null);
  const [signatureRefreshKey, setSignatureRefreshKey] = useState(0);
  const [copySourceExamId, setCopySourceExamId] = useState("");
  const [copyBusy, setCopyBusy] = useState(false);

  const dgFileRef = useRef<HTMLInputElement>(null);
  const dacFileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ExaminationExaminerAppointmentLetterReferencesResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | null>(null);
  const [refsLoading, setRefsLoading] = useState(true);
  const [refsSaving, setRefsSaving] = useState(false);
  const [previewBusyKey, setPreviewBusyKey] = useState<string | null>(null);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [refsMessage, setRefsMessage] = useState<string | null>(null);

  const copyExamOptions = useMemo(
    () =>
      exams
        .filter((ex) => ex.id !== examId)
        .map((ex) => ({ value: String(ex.id), label: formatExamLabel(ex) })),
    [exams, examId],
  );

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

  const loadLetterSettings = useCallback(async () => {
    setLetterLoading(true);
    setLetterError(null);
    try {
      const row = await getExaminerAppointmentLetterSettings(examId);
      setLetterSettings(row);
      setLetterDraft(settingsToDraft(row));
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not load letter settings");
      setLetterSettings(null);
      setLetterDraft(null);
    } finally {
      setLetterLoading(false);
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
    void loadLetterSettings();
    void loadReferences();
    setCopySourceExamId("");
  }, [loadRelease, loadLetterSettings, loadReferences]);

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

  async function handleSaveLetterSettings() {
    if (!letterDraft) return;
    if (!letterDraft.letterDate.trim()) {
      setLetterError("Set the letter date before saving.");
      return;
    }
    setLetterSaving(true);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const ccLines = letterDraft.ccLines.map((line) => line.trim()).filter(Boolean);
      const row = await putExaminerAppointmentLetterSettings(examId, {
        signing_official: letterDraft.signingOfficial,
        signed_for_director_general: letterDraft.signedForDirectorGeneral,
        director_general_name: letterDraft.directorGeneralName.trim(),
        director_general_title: letterDraft.directorGeneralTitle.trim(),
        director_assessment_name: letterDraft.directorAssessmentName.trim(),
        director_assessment_title: letterDraft.directorAssessmentTitle.trim(),
        valediction: letterDraft.valediction.trim() || "Yours faithfully",
        letter_date: letterDraft.letterDate.trim(),
        cc_lines: ccLines,
      });
      setLetterSettings(row);
      setLetterDraft(settingsToDraft(row));
      setLetterMessage("Appointment letter setup saved.");
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not save letter settings");
    } finally {
      setLetterSaving(false);
    }
  }

  async function handleCopyFromExam() {
    const sourceId = Number(copySourceExamId);
    if (!sourceId) {
      setLetterError("Choose an examination to copy from.");
      return;
    }
    setCopyBusy(true);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const result = await copyExaminerAppointmentLetterSettingsFrom(examId, sourceId);
      const sourceLabel = copyExamOptions.find((o) => o.value === String(sourceId))?.label ?? "selected examination";
      await loadLetterSettings();
      setSignatureRefreshKey((k) => k + 1);
      setLetterMessage(
        `Copied signatory setup from ${sourceLabel} (${result.cc_lines_copied} CC line(s), ${result.signatures_copied} signature(s)). Reference numbers and release settings were not changed.`,
      );
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not copy setup");
    } finally {
      setCopyBusy(false);
    }
  }

  async function handleSignatureUpload(role: AppointmentLetterSignatureRole, file: File | null) {
    if (!file) return;
    setSignatureBusyRole(role);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const row = await uploadExaminerAppointmentLetterSignature(examId, role, file);
      setLetterSettings(row);
      setSignatureRefreshKey((k) => k + 1);
      setLetterMessage("Signature uploaded.");
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not upload signature");
    } finally {
      setSignatureBusyRole(null);
    }
  }

  async function handleSignatureDelete(role: AppointmentLetterSignatureRole) {
    setSignatureBusyRole(role);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const row = await deleteExaminerAppointmentLetterSignature(examId, role);
      setLetterSettings(row);
      setSignatureRefreshKey((k) => k + 1);
      setLetterMessage("Signature removed.");
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not remove signature");
    } finally {
      setSignatureBusyRole(null);
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

  function updateCcLine(index: number, value: string) {
    setLetterDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.ccLines];
      next[index] = value;
      return { ...prev, ccLines: next };
    });
  }

  function addCcLine() {
    setLetterDraft((prev) => (prev ? { ...prev, ccLines: [...prev.ccLines, ""] } : prev));
  }

  function removeCcLine(index: number) {
    setLetterDraft((prev) => {
      if (!prev) return prev;
      const next = prev.ccLines.filter((_, i) => i !== index);
      return { ...prev, ccLines: next.length > 0 ? next : [""] };
    });
  }

  const showSignedForDg =
    letterDraft?.signingOfficial === "director_assessment_certification";

  return (
    <div className={cn("space-y-6 px-3 py-4 md:px-4", className)}>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Signatory setup</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Configure the letter date, signatories, signature images, and CC recipients for this examination.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={letterLoading || letterSaving || letterDraft == null}
            onClick={() => void handleSaveLetterSettings()}
          >
            {letterSaving ? "Saving…" : "Save setup"}
          </Button>
        </div>

        {letterError ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {letterError}
          </p>
        ) : null}
        {letterMessage ? (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
            {letterMessage}
          </p>
        ) : null}

        {letterLoading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading letter setup…
          </div>
        ) : letterDraft ? (
          <div className="mt-4 space-y-6">
            <div className="max-w-xs">
              <label className={formLabelClass} htmlFor="appt-letter-date">
                Letter date
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fixed date shown on the letter header. Preview and issued letters use this date, not the download date.
              </p>
              <input
                id="appt-letter-date"
                type="date"
                className={cn(formInputClass, "mt-1.5")}
                value={letterDraft.letterDate}
                onChange={(e) =>
                  setLetterDraft((prev) => (prev ? { ...prev, letterDate: e.target.value } : prev))
                }
              />
            </div>

            {copyExamOptions.length > 0 ? (
              <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Copy from another examination
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Copies signatory names, titles, letter date, CC lines, and signatures. Reference numbers and release
                  settings are not copied.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div>
                    <label className={formLabelClass} htmlFor="appt-letter-copy-exam">
                      Source examination
                    </label>
                    <SearchableCombobox
                      id="appt-letter-copy-exam"
                      options={copyExamOptions}
                      value={copySourceExamId}
                      onChange={setCopySourceExamId}
                      placeholder="Choose examination"
                      searchPlaceholder="Search examinations…"
                      showAllOption={false}
                      disabled={copyBusy || letterSaving}
                      widthClass="w-full min-w-[240px] sm:w-[280px]"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!copySourceExamId || copyBusy || letterSaving}
                    onClick={() => void handleCopyFromExam()}
                  >
                    {copyBusy ? "Copying…" : "Copy setup"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-2">
              <fieldset className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Director General
                </legend>
                <div>
                  <label className={formLabelClass} htmlFor="appt-letter-dg-name">
                    Name
                  </label>
                  <input
                    id="appt-letter-dg-name"
                    type="text"
                    className={cn(formInputClass, "mt-1")}
                    value={letterDraft.directorGeneralName}
                    onChange={(e) =>
                      setLetterDraft((prev) => (prev ? { ...prev, directorGeneralName: e.target.value } : prev))
                    }
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="appt-letter-dg-title">
                    Title
                  </label>
                  <input
                    id="appt-letter-dg-title"
                    type="text"
                    className={cn(formInputClass, "mt-1")}
                    value={letterDraft.directorGeneralTitle}
                    onChange={(e) =>
                      setLetterDraft((prev) => (prev ? { ...prev, directorGeneralTitle: e.target.value } : prev))
                    }
                  />
                </div>
                <div>
                  <label className={formLabelClass}>Signature</label>
                  <input
                    ref={dgFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:text-primary-foreground"
                    disabled={signatureBusyRole === "director_general"}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleSignatureUpload("director_general", file);
                      e.target.value = "";
                    }}
                  />
                  <SignaturePreview
                    examId={examId}
                    role="director_general"
                    hasSignature={letterSettings?.director_general_signature.has_signature ?? false}
                    refreshKey={signatureRefreshKey}
                  />
                  {letterSettings?.director_general_signature.has_signature ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-xs text-destructive"
                      disabled={signatureBusyRole === "director_general"}
                      onClick={() => void handleSignatureDelete("director_general")}
                    >
                      Remove signature
                    </Button>
                  ) : null}
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Director of Assessment and Certification
                </legend>
                <div>
                  <label className={formLabelClass} htmlFor="appt-letter-dac-name">
                    Name
                  </label>
                  <input
                    id="appt-letter-dac-name"
                    type="text"
                    className={cn(formInputClass, "mt-1")}
                    value={letterDraft.directorAssessmentName}
                    onChange={(e) =>
                      setLetterDraft((prev) => (prev ? { ...prev, directorAssessmentName: e.target.value } : prev))
                    }
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="appt-letter-dac-title">
                    Title
                  </label>
                  <input
                    id="appt-letter-dac-title"
                    type="text"
                    className={cn(formInputClass, "mt-1")}
                    value={letterDraft.directorAssessmentTitle}
                    onChange={(e) =>
                      setLetterDraft((prev) => (prev ? { ...prev, directorAssessmentTitle: e.target.value } : prev))
                    }
                  />
                </div>
                <div>
                  <label className={formLabelClass}>Signature</label>
                  <input
                    ref={dacFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-2 file:py-1 file:text-xs file:text-primary-foreground"
                    disabled={signatureBusyRole === "director_assessment_certification"}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      void handleSignatureUpload("director_assessment_certification", file);
                      e.target.value = "";
                    }}
                  />
                  <SignaturePreview
                    examId={examId}
                    role="director_assessment_certification"
                    hasSignature={letterSettings?.director_assessment_signature.has_signature ?? false}
                    refreshKey={signatureRefreshKey}
                  />
                  {letterSettings?.director_assessment_signature.has_signature ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 px-2 text-xs text-destructive"
                      disabled={signatureBusyRole === "director_assessment_certification"}
                      onClick={() => void handleSignatureDelete("director_assessment_certification")}
                    >
                      Remove signature
                    </Button>
                  ) : null}
                </div>
              </fieldset>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who signs the letter</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="signing-official"
                    checked={letterDraft.signingOfficial === "director_general"}
                    onChange={() =>
                      setLetterDraft((prev) =>
                        prev ? { ...prev, signingOfficial: "director_general" } : prev,
                      )
                    }
                  />
                  Director General
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="signing-official"
                    checked={letterDraft.signingOfficial === "director_assessment_certification"}
                    onChange={() =>
                      setLetterDraft((prev) =>
                        prev ? { ...prev, signingOfficial: "director_assessment_certification" } : prev,
                      )
                    }
                  />
                  Director of Assessment and Certification
                </label>
              </div>
              {showSignedForDg ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={letterDraft.signedForDirectorGeneral}
                    onChange={(e) =>
                      setLetterDraft((prev) =>
                        prev ? { ...prev, signedForDirectorGeneral: e.target.checked } : prev,
                      )
                    }
                  />
                  Signed on behalf of Director General (shows &quot;FOR: DIRECTOR-GENERAL&quot;)
                </label>
              ) : null}
            </div>

            <div>
              <label className={formLabelClass} htmlFor="appt-letter-valediction">
                Valediction
              </label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Closing line before the signature block (a comma is added automatically).
              </p>
              <input
                id="appt-letter-valediction"
                type="text"
                className={cn(formInputClass, "mt-1.5 max-w-md")}
                value={letterDraft.valediction}
                placeholder="Yours faithfully"
                onChange={(e) =>
                  setLetterDraft((prev) => (prev ? { ...prev, valediction: e.target.value } : prev))
                }
              />
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <h2 className="text-sm font-semibold text-foreground">CC recipients</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Ordered lines shown after the signatory block on each appointment letter. Saved together with signatory
          setup.
        </p>
        {letterDraft ? (
          <ul className="mt-4 space-y-2">
            {letterDraft.ccLines.map((line, index) => (
              <li key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  className={cn(formInputClass, "flex-1")}
                  value={line}
                  placeholder="e.g. The Accountant."
                  onChange={(e) => updateCcLine(index, e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label="Remove CC line"
                  onClick={() => removeCcLine(index)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 gap-1.5"
          disabled={!letterDraft || letterSaving}
          onClick={addCcLine}
        >
          <Plus className="size-3.5" aria-hidden />
          Add CC line
        </Button>
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
                <p className="text-sm font-medium text-foreground">{subjectDisplayLabel(selectedSubject)}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {EXAMINER_TYPE_OPTIONS.map((role) => {
                    const key = cellKey(selectedSubject.id, role.value);
                    const savedRef = savedByKey.get(key);
                    return (
                      <div key={role.value} className="rounded-xl border border-border bg-muted/15 p-3">
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

      <section className="rounded-2xl border border-border/70 bg-card/90 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Release and notify</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Examiners can upload bank details and download appointment letters after their coordination period
              ends, once release is enabled.
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
    </div>
  );
}
