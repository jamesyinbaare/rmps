"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getAdminWorkforceRates,
  putAdminWorkforceRates,
  type Examination,
  type WorkforceRatesPutPayload,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";

type Props = {
  config: WorkforceKindConfig;
  exams: Examination[];
  formatExamLabel: (exam: Examination) => string;
};

type RateForm = {
  ratePerScript: string;
  objectiveRate: string;
  subjectiveRate: string;
  commutingPerDay: string;
  lunchPerDay: string;
  taxPercent: string;
};

const EMPTY_FORM: RateForm = {
  ratePerScript: "",
  objectiveRate: "",
  subjectiveRate: "",
  commutingPerDay: "0",
  lunchPerDay: "0",
  taxPercent: "10",
};

function parseNonNegative(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return `${label} is required.`;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return `Enter a valid non-negative ${label.toLowerCase()}.`;
  return null;
}

function parseTaxPercent(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "Tax percent is required.";
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return "Enter a valid tax percent between 0 and 100.";
  }
  return null;
}

export function WorkforceRatesPanel({ config, exams, formatExamLabel }: Props) {
  const searchParams = useSearchParams();
  const [examId, setExamId] = useState<number | null>(null);
  const [form, setForm] = useState<RateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const isScriptChecker = config.kind === "script-checker";
  const unitLabel = isScriptChecker ? "script" : "entry";

  useEffect(() => {
    if (exams.length === 0 || examId != null) return;
    const raw = Number.parseInt(searchParams.get("exam") ?? "", 10);
    if (Number.isInteger(raw) && exams.some((exam) => exam.id === raw)) {
      setExamId(raw);
      return;
    }
    setExamId(exams[0]!.id);
  }, [examId, exams, searchParams]);

  const loadRates = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getAdminWorkforceRates(config.kind, examId);
      setForm({
        ratePerScript: data.rate_per_script_ghs ?? "",
        objectiveRate: data.objective_rate_per_script_ghs ?? "",
        subjectiveRate: data.subjective_rate_per_script_ghs ?? "",
        commutingPerDay: data.commuting_allowance_ghs ?? "0",
        lunchPerDay: data.lunch_allowance_ghs ?? "0",
        taxPercent: data.withholding_tax_percent ?? "10",
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load rates");
      setForm(EMPTY_FORM);
    } finally {
      setLoading(false);
    }
  }, [config.kind, examId]);

  useEffect(() => {
    void loadRates();
  }, [loadRates]);

  function updateField<K extends keyof RateForm>(key: K, value: RateForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (examId == null) return;
    const commuteError = parseNonNegative(form.commutingPerDay, "Commute allowance");
    const lunchError = parseNonNegative(form.lunchPerDay, "Lunch allowance");
    const taxError = parseTaxPercent(form.taxPercent);
    let rateError: string | null = null;
    if (isScriptChecker) {
      rateError =
        parseNonNegative(form.objectiveRate, "Objective rate") ??
        parseNonNegative(form.subjectiveRate, "Subjective rate");
    } else {
      rateError = parseNonNegative(form.ratePerScript, `Rate per ${unitLabel}`);
    }
    const firstError = rateError ?? commuteError ?? lunchError ?? taxError;
    if (firstError) {
      setSaveError(firstError);
      return;
    }

    const payload: WorkforceRatesPutPayload = {
      commuting_allowance_ghs: form.commutingPerDay.trim(),
      lunch_allowance_ghs: form.lunchPerDay.trim(),
      withholding_tax_percent: form.taxPercent.trim(),
      ...(isScriptChecker
        ? {
            objective_rate_per_script_ghs: form.objectiveRate.trim(),
            subjective_rate_per_script_ghs: form.subjectiveRate.trim(),
          }
        : { rate_per_script_ghs: form.ratePerScript.trim() }),
    };

    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      await putAdminWorkforceRates(config.kind, examId, payload);
      setSaveMessage("Rates saved.");
      await loadRates();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={officialAccountsPanelClass}>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[min(100%,20rem)]">
            <label className={formLabelClass} htmlFor="workforce-rates-exam">
              Examination
            </label>
            <select
              id="workforce-rates-exam"
              className={formInputClass}
              value={examId ?? ""}
              onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
            >
              {exams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {formatExamLabel(ex)}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" disabled={saving || examId == null} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Save rates"}
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {isScriptChecker
            ? "Objective (paper 1) and subjective (paper 2+) rates are applied per completed batch. "
            : ""}
          Gross {unitLabel} earnings are taxed at the configured rate. Commute and lunch allowances are paid per work
          day (distinct days with completed batches). Net payable = ({unitLabel} gross − tax) + commute + lunch.
        </p>

        {saveMessage ? (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm" role="status">
            {saveMessage}
          </p>
        ) : null}
        {saveError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {saveError}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading rates…
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:max-w-3xl">
            {isScriptChecker ? (
              <>
                <div>
                  <label className={formLabelClass} htmlFor="workforce-rate-ot">
                    Objective rate per script (GHS)
                  </label>
                  <input
                    id="workforce-rate-ot"
                    type="number"
                    min={0}
                    step="0.01"
                    className={formInputClass}
                    value={form.objectiveRate}
                    onChange={(e) => updateField("objectiveRate", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="workforce-rate-st">
                    Subjective rate per script (GHS)
                  </label>
                  <input
                    id="workforce-rate-st"
                    type="number"
                    min={0}
                    step="0.01"
                    className={formInputClass}
                    value={form.subjectiveRate}
                    onChange={(e) => updateField("subjectiveRate", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={formLabelClass} htmlFor="workforce-rate-amount">
                  Rate per {unitLabel} (GHS)
                </label>
                <input
                  id="workforce-rate-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className={formInputClass}
                  value={form.ratePerScript}
                  onChange={(e) => updateField("ratePerScript", e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}
            <div>
              <label className={formLabelClass} htmlFor="workforce-tax-percent">
                Withholding tax on {unitLabel} earnings (%)
              </label>
              <input
                id="workforce-tax-percent"
                type="number"
                min={0}
                max={100}
                step="0.01"
                className={formInputClass}
                value={form.taxPercent}
                onChange={(e) => updateField("taxPercent", e.target.value)}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="workforce-commute">
                Commute allowance per day (GHS)
              </label>
              <input
                id="workforce-commute"
                type="number"
                min={0}
                step="0.01"
                className={formInputClass}
                value={form.commutingPerDay}
                onChange={(e) => updateField("commutingPerDay", e.target.value)}
              />
            </div>
            <div>
              <label className={formLabelClass} htmlFor="workforce-lunch">
                Lunch allowance per day (GHS)
              </label>
              <input
                id="workforce-lunch"
                type="number"
                min={0}
                step="0.01"
                className={formInputClass}
                value={form.lunchPerDay}
                onChange={(e) => updateField("lunchPerDay", e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
