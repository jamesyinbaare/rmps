"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Pencil, UserCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getPublicExaminerBackgroundSurvey,
  getPublicExaminerLocation,
  upsertPublicExaminerBackgroundSurvey,
  upsertPublicExaminerLocation,
  type ExaminerBackgroundOccupationType,
  type ExaminerBackgroundSurveyPublic,
  type ExaminerLocationPublic,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  className?: string;
  onSaved?: () => void;
};

function occupationLabel(value: ExaminerBackgroundOccupationType): string {
  return value === "teacher" ? "Teacher" : "Working outside teaching";
}

function validateLocation(town: string, gps: string): string | null {
  if (!town.trim()) return "Please enter the town where you live.";
  if (!gps.trim()) return "Please enter your GhanaPost GPS address.";
  return null;
}

function validateBackground(
  occupationType: ExaminerBackgroundOccupationType | "",
  institutionName: string,
  teachingSubject: string,
  industry: string,
  specialization: string,
): string | null {
  if (!occupationType) return "Please tell us whether you are a teacher or work in another field.";
  if (occupationType === "teacher") {
    if (!institutionName.trim()) return "Please enter the name of your school or institution.";
    if (!teachingSubject.trim()) return "Please enter the subject you teach.";
    return null;
  }
  if (!industry.trim()) return "Please enter your industry or line of work.";
  if (!specialization.trim()) return "Please enter your area of specialization.";
  return null;
}

export function ExaminerProfileDetailsForm({ token, className, onSaved }: Props) {
  const formId = useId();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savedLocation, setSavedLocation] = useState<ExaminerLocationPublic | null>(null);
  const [savedBackground, setSavedBackground] = useState<ExaminerBackgroundSurveyPublic | null>(null);
  const [editing, setEditing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [town, setTown] = useState("");
  const [ghanapostGpsAddress, setGhanapostGpsAddress] = useState("");
  const [occupationType, setOccupationType] = useState<ExaminerBackgroundOccupationType | "">("");
  const [institutionName, setInstitutionName] = useState("");
  const [teachingSubject, setTeachingSubject] = useState("");
  const [industry, setIndustry] = useState("");
  const [specialization, setSpecialization] = useState("");

  const isComplete = savedLocation !== null && savedBackground !== null;

  const applySaved = useCallback(
    (location: ExaminerLocationPublic | null, background: ExaminerBackgroundSurveyPublic | null) => {
      if (location) {
        setTown(location.town);
        setGhanapostGpsAddress(location.ghanapost_gps_address);
      } else {
        setTown("");
        setGhanapostGpsAddress("");
      }
      if (background) {
        setOccupationType(background.occupation_type);
        setInstitutionName(background.institution_name ?? "");
        setTeachingSubject(background.teaching_subject ?? "");
        setIndustry(background.industry ?? "");
        setSpecialization(background.specialization ?? "");
      } else {
        setOccupationType("");
        setInstitutionName("");
        setTeachingSubject("");
        setIndustry("");
        setSpecialization("");
      }
    },
    [],
  );

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setCardError(null);
    try {
      const [locationResult, backgroundResult] = await Promise.allSettled([
        getPublicExaminerLocation(token),
        getPublicExaminerBackgroundSurvey(token),
      ]);
      const location =
        locationResult.status === "fulfilled" ? locationResult.value : null;
      const background =
        backgroundResult.status === "fulfilled" ? backgroundResult.value : null;

      if (locationResult.status === "rejected" && backgroundResult.status === "rejected") {
        throw locationResult.reason;
      }

      setSavedLocation(location);
      setSavedBackground(background);
      applySaved(location, background);
      setEditing(location === null || background === null);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "We could not load your details right now.");
      setSavedLocation(null);
      setSavedBackground(null);
      applySaved(null, null);
      setEditing(true);
    } finally {
      setLoading(false);
    }
  }, [applySaved, token]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  function startEdit() {
    setFormError(null);
    setSuccessMessage(null);
    applySaved(savedLocation, savedBackground);
    setEditing(true);
  }

  function cancelEdit() {
    setFormError(null);
    applySaved(savedLocation, savedBackground);
    setEditing(isComplete ? false : true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const locationError = validateLocation(town, ghanapostGpsAddress);
    if (locationError) {
      setFormError(locationError);
      return;
    }
    const backgroundError = validateBackground(
      occupationType,
      institutionName,
      teachingSubject,
      industry,
      specialization,
    );
    if (backgroundError) {
      setFormError(backgroundError);
      return;
    }

    setBusy(true);
    try {
      const [locationRow, backgroundRow] = await Promise.all([
        upsertPublicExaminerLocation(token, {
          town: town.trim(),
          ghanapost_gps_address: ghanapostGpsAddress.trim(),
        }),
        upsertPublicExaminerBackgroundSurvey(token, {
          occupation_type: occupationType as ExaminerBackgroundOccupationType,
          institution_name: occupationType === "teacher" ? institutionName.trim() : null,
          teaching_subject: occupationType === "teacher" ? teachingSubject.trim() : null,
          industry: occupationType === "other" ? industry.trim() : null,
          specialization: occupationType === "other" ? specialization.trim() : null,
        }),
      ]);
      setSavedLocation(locationRow);
      setSavedBackground(backgroundRow);
      applySaved(locationRow, backgroundRow);
      setEditing(false);
      setSuccessMessage(
        isComplete ? "Your details have been updated." : "Thank you — your details are saved.",
      );
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "We could not save your details. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-24 rounded bg-muted/80" />
        <div className="h-11 rounded bg-muted/60" />
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm sm:p-5",
        className,
      )}
      aria-labelledby={`${formId}-title`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserCircle className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${formId}-title`} className="text-base font-semibold text-foreground">
            About you
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {isComplete && !editing
              ? "Your contact location and work background are on file. Update them here if anything changes."
              : "Tell us where you are based and what you do."}
          </p>
        </div>
      </div>

      {cardError ? (
        <p
          className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {cardError}
        </p>
      ) : null}

      {successMessage ? (
        <p
          className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground"
          role="status"
        >
          {successMessage}
        </p>
      ) : null}

      {isComplete && !editing ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Where you are
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">{savedLocation.town}</p>
            <p className="mt-0.5 font-mono text-sm tracking-wide text-muted-foreground">
              {savedLocation.ghanapost_gps_address}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What you do
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {occupationLabel(savedBackground.occupation_type)}
            </p>
            {savedBackground.occupation_type === "teacher" ? (
              <>
                <p className="mt-0.5 text-sm text-foreground">{savedBackground.institution_name}</p>
                <p className="text-sm text-muted-foreground">
                  Teaches {savedBackground.teaching_subject}
                </p>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-sm text-foreground">{savedBackground.industry}</p>
                <p className="text-sm text-muted-foreground">{savedBackground.specialization}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <form className="mt-4 space-y-6" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Where you are</h3>
            </div>
            <div>
              <label className={formLabelClass} htmlFor={`${formId}-town`}>
                Town or city
              </label>
              <input
                id={`${formId}-town`}
                className={formInputClass}
                value={town}
                onChange={(e) => setTown(e.target.value)}
                placeholder="e.g. Kumasi"
                disabled={busy}
                autoComplete="address-level2"
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor={`${formId}-gps`}>
                GhanaPost GPS address
              </label>
              <input
                id={`${formId}-gps`}
                className={formInputClass}
                value={ghanapostGpsAddress}
                onChange={(e) => setGhanapostGpsAddress(e.target.value)}
                placeholder="GA-123-4567"
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-border/60 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">What you do</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Are you teaching in a school, or working in another profession?
              </p>
            </div>
            <fieldset>
              <legend className="sr-only">Occupation type</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`${formId}-occupation`}
                    checked={occupationType === "teacher"}
                    disabled={busy}
                    onChange={() => setOccupationType("teacher")}
                  />
                  I am a teacher
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                  <input
                    type="radio"
                    name={`${formId}-occupation`}
                    checked={occupationType === "other"}
                    disabled={busy}
                    onChange={() => setOccupationType("other")}
                  />
                  I work in another field
                </label>
              </div>
            </fieldset>

            {occupationType === "teacher" ? (
              <>
                <div>
                  <label className={formLabelClass} htmlFor={`${formId}-institution`}>
                    School or institution
                  </label>
                  <input
                    id={`${formId}-institution`}
                    className={formInputClass}
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="e.g. Bolgatanga Technical Institute"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor={`${formId}-teaching-subject`}>
                    Subject you teach
                  </label>
                  <input
                    id={`${formId}-teaching-subject`}
                    className={formInputClass}
                    value={teachingSubject}
                    onChange={(e) => setTeachingSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    disabled={busy}
                  />
                </div>
              </>
            ) : null}

            {occupationType === "other" ? (
              <>
                <div>
                  <label className={formLabelClass} htmlFor={`${formId}-industry`}>
                    Industry or line of work
                  </label>
                  <input
                    id={`${formId}-industry`}
                    className={formInputClass}
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Banking"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor={`${formId}-specialization`}>
                    Your specialization
                  </label>
                  <input
                    id={`${formId}-specialization`}
                    className={formInputClass}
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="e.g. Risk analysis"
                    disabled={busy}
                  />
                </div>
              </>
            ) : null}
          </div>

          {formError ? (
            <p
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="min-h-11 flex-1" disabled={busy}>
              {busy ? "Saving…" : isComplete ? "Save changes" : "Save your details"}
            </Button>
            {isComplete ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1"
                disabled={busy}
                onClick={cancelEdit}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}

      {isComplete && !editing ? (
        <Button type="button" variant="outline" className="mt-4 min-h-11 w-full" onClick={startEdit}>
          <Pencil className="mr-2 size-4" aria-hidden />
          Update your details
        </Button>
      ) : null}
    </section>
  );
}
