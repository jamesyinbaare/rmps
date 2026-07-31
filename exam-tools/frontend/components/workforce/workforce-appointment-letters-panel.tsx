"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileDown, Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteWorkforceAppointmentLetterSignature,
  downloadWorkforceAppointmentLetterPreviewPdf,
  fetchWorkforceAppointmentLetterSignatureBlobUrl,
  getWorkforceAppointmentLetterSettings,
  putWorkforceAppointmentLetterSettings,
  uploadWorkforceAppointmentLetterSignature,
  type AppointmentLetterSignatureRole,
  type AppointmentLetterSigningOfficial,
  type WorkforceAppointmentLetterSettings,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

type Props = {
  config: WorkforceKindConfig;
  examId: number | null;
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
  referenceNumber: string;
  ccLines: string[];
};

function settingsToDraft(row: WorkforceAppointmentLetterSettings): LetterSettingsDraft {
  return {
    signingOfficial: row.signing_official,
    signedForDirectorGeneral: row.signed_for_director_general,
    directorGeneralName: row.director_general_name,
    directorGeneralTitle: row.director_general_title,
    directorAssessmentName: row.director_assessment_name,
    directorAssessmentTitle: row.director_assessment_title,
    valediction: row.valediction,
    letterDate: row.letter_date ?? "",
    referenceNumber: row.reference_number,
    ccLines: row.cc_lines.length > 0 ? [...row.cc_lines] : [""],
  };
}

function SignaturePreview({
  config,
  examId,
  role,
  hasSignature,
  refreshKey,
}: {
  config: WorkforceKindConfig;
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
        objectUrl = await fetchWorkforceAppointmentLetterSignatureBlobUrl(config.kind, examId, role);
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
  }, [config.kind, examId, role, hasSignature, refreshKey]);

  if (!hasSignature) return null;
  if (loading) {
    return <p className="mt-2 text-xs text-muted-foreground">Loading preview…</p>;
  }
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      className="mt-2 max-h-16 max-w-50 rounded border border-border bg-white object-contain p-1"
    />
  );
}

export function WorkforceAppointmentLettersPanel({ config, examId }: Props) {
  const [letterSettings, setLetterSettings] = useState<WorkforceAppointmentLetterSettings | null>(null);
  const [letterDraft, setLetterDraft] = useState<LetterSettingsDraft | null>(null);
  const [letterLoading, setLetterLoading] = useState(true);
  const [letterSaving, setLetterSaving] = useState(false);
  const [letterError, setLetterError] = useState<string | null>(null);
  const [letterMessage, setLetterMessage] = useState<string | null>(null);
  const [signatureBusyRole, setSignatureBusyRole] = useState<AppointmentLetterSignatureRole | null>(null);
  const [signatureRefreshKey, setSignatureRefreshKey] = useState(0);
  const [previewBusy, setPreviewBusy] = useState(false);

  const dgFileRef = useRef<HTMLInputElement>(null);
  const dacFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (examId == null) {
      setLetterSettings(null);
      setLetterDraft(null);
      setLetterLoading(false);
      return;
    }
    let cancelled = false;
    setLetterLoading(true);
    setLetterError(null);
    void getWorkforceAppointmentLetterSettings(config.kind, examId)
      .then((row) => {
        if (cancelled) return;
        setLetterSettings(row);
        setLetterDraft(settingsToDraft(row));
      })
      .catch((e) => {
        if (cancelled) return;
        setLetterError(e instanceof Error ? e.message : "Could not load letter settings");
        setLetterSettings(null);
        setLetterDraft(null);
      })
      .finally(() => {
        if (!cancelled) setLetterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.kind, examId]);

  useEffect(() => {
    if (!letterMessage) return;
    const t = window.setTimeout(() => setLetterMessage(null), 5000);
    return () => window.clearTimeout(t);
  }, [letterMessage]);

  const showSignedForDg = letterDraft?.signingOfficial === "director_assessment_certification";

  async function handleSaveLetterSettings() {
    if (examId == null || !letterDraft) return;
    if (!letterDraft.letterDate.trim()) {
      setLetterError("Set the letter date before saving.");
      return;
    }
    setLetterSaving(true);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const ccLines = letterDraft.ccLines.map((line) => line.trim()).filter(Boolean);
      const row = await putWorkforceAppointmentLetterSettings(config.kind, examId, {
        signing_official: letterDraft.signingOfficial,
        signed_for_director_general: letterDraft.signedForDirectorGeneral,
        director_general_name: letterDraft.directorGeneralName.trim(),
        director_general_title: letterDraft.directorGeneralTitle.trim(),
        director_assessment_name: letterDraft.directorAssessmentName.trim(),
        director_assessment_title: letterDraft.directorAssessmentTitle.trim(),
        valediction: letterDraft.valediction.trim() || "Yours faithfully",
        letter_date: letterDraft.letterDate.trim(),
        reference_number: letterDraft.referenceNumber.trim(),
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

  async function handleSignatureUpload(role: AppointmentLetterSignatureRole, file: File | null) {
    if (examId == null || !file) return;
    setSignatureBusyRole(role);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const row = await uploadWorkforceAppointmentLetterSignature(config.kind, examId, role, file);
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
    if (examId == null) return;
    setSignatureBusyRole(role);
    setLetterError(null);
    setLetterMessage(null);
    try {
      const row = await deleteWorkforceAppointmentLetterSignature(config.kind, examId, role);
      setLetterSettings(row);
      setSignatureRefreshKey((k) => k + 1);
      setLetterMessage("Signature removed.");
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not remove signature");
    } finally {
      setSignatureBusyRole(null);
    }
  }

  async function handlePreview() {
    if (examId == null) return;
    setPreviewBusy(true);
    setLetterError(null);
    try {
      await downloadWorkforceAppointmentLetterPreviewPdf(
        config.kind,
        examId,
        `${config.kind}_appointment_letter_preview.pdf`,
      );
    } catch (e) {
      setLetterError(e instanceof Error ? e.message : "Could not download preview");
    } finally {
      setPreviewBusy(false);
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

  const showDacFields = useMemo(
    () =>
      letterDraft?.signingOfficial === "director_assessment_certification" ||
      Boolean(letterDraft?.directorAssessmentName || letterDraft?.directorAssessmentTitle),
    [letterDraft],
  );

  if (examId == null) {
    return <p className="text-sm text-muted-foreground">Select an examination to manage appointment letters.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Letter date, signatories, signatures, reference number, and CC lines for{" "}
          {config.labelPlural.toLowerCase()} on this examination. Release timing is set per cohort.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={officialAccountsBtnSecondary}
            disabled={previewBusy || letterLoading}
            onClick={() => void handlePreview()}
          >
            {previewBusy ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="mr-1.5 size-4" aria-hidden />
            )}
            Preview PDF
          </button>
          <button
            type="button"
            className={officialAccountsBtnPrimary}
            disabled={letterLoading || letterSaving || letterDraft == null}
            onClick={() => void handleSaveLetterSettings()}
          >
            {letterSaving ? "Saving…" : "Save setup"}
          </button>
        </div>
      </div>

      {letterError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {letterError}
        </p>
      ) : null}
      {letterMessage ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground">
          {letterMessage}
        </p>
      ) : null}

      {letterLoading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading letter setup…
        </div>
      ) : letterDraft ? (
        <div className="space-y-8">
          <section className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Letter header</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={formLabelClass} htmlFor="wf-appt-letter-date">
                  Letter date
                </label>
                <input
                  id="wf-appt-letter-date"
                  type="date"
                  className={cn(formInputClass, "mt-1")}
                  value={letterDraft.letterDate}
                  onChange={(e) => setLetterDraft((prev) => (prev ? { ...prev, letterDate: e.target.value } : prev))}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor="wf-appt-letter-ref">
                  Reference number
                </label>
                <input
                  id="wf-appt-letter-ref"
                  type="text"
                  className={cn(formInputClass, "mt-1 font-mono text-sm")}
                  placeholder="e.g. CTVET/EXM/2026/SC"
                  value={letterDraft.referenceNumber}
                  onChange={(e) =>
                    setLetterDraft((prev) => (prev ? { ...prev, referenceNumber: e.target.value } : prev))
                  }
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border/70 pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Who signs</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wf-signing-official"
                  checked={letterDraft.signingOfficial === "director_general"}
                  onChange={() =>
                    setLetterDraft((prev) => (prev ? { ...prev, signingOfficial: "director_general" } : prev))
                  }
                />
                Director General
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="wf-signing-official"
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

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3">
                <p className="text-xs font-medium text-foreground">Director General</p>
                <div>
                  <label className={formLabelClass} htmlFor="wf-appt-dg-name">
                    Name
                  </label>
                  <input
                    id="wf-appt-dg-name"
                    type="text"
                    className={cn(formInputClass, "mt-1")}
                    value={letterDraft.directorGeneralName}
                    onChange={(e) =>
                      setLetterDraft((prev) => (prev ? { ...prev, directorGeneralName: e.target.value } : prev))
                    }
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="wf-appt-dg-title">
                    Title
                  </label>
                  <input
                    id="wf-appt-dg-title"
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
                    config={config}
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
              </div>

              {showDacFields ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3">
                  <p className="text-xs font-medium text-foreground">Director of Assessment and Certification</p>
                  <div>
                    <label className={formLabelClass} htmlFor="wf-appt-dac-name">
                      Name
                    </label>
                    <input
                      id="wf-appt-dac-name"
                      type="text"
                      className={cn(formInputClass, "mt-1")}
                      value={letterDraft.directorAssessmentName}
                      onChange={(e) =>
                        setLetterDraft((prev) =>
                          prev ? { ...prev, directorAssessmentName: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={formLabelClass} htmlFor="wf-appt-dac-title">
                      Title
                    </label>
                    <input
                      id="wf-appt-dac-title"
                      type="text"
                      className={cn(formInputClass, "mt-1")}
                      value={letterDraft.directorAssessmentTitle}
                      onChange={(e) =>
                        setLetterDraft((prev) =>
                          prev ? { ...prev, directorAssessmentTitle: e.target.value } : prev,
                        )
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
                      config={config}
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
                </div>
              ) : null}
            </div>

            <div className="max-w-md">
              <label className={formLabelClass} htmlFor="wf-appt-valediction">
                Valediction
              </label>
              <input
                id="wf-appt-valediction"
                type="text"
                className={cn(formInputClass, "mt-1")}
                value={letterDraft.valediction}
                placeholder="Yours faithfully"
                onChange={(e) => setLetterDraft((prev) => (prev ? { ...prev, valediction: e.target.value } : prev))}
              />
            </div>
          </section>

          <section className="space-y-3 border-t border-border/70 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">CC recipients</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={letterSaving}
                onClick={addCcLine}
              >
                <Plus className="size-3.5" aria-hidden />
                Add line
              </Button>
            </div>
            <ul className="space-y-2">
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
          </section>
        </div>
      ) : null}
    </div>
  );
}
