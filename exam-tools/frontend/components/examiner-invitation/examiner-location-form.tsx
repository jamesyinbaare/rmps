"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { MapPin, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getPublicExaminerLocation,
  upsertPublicExaminerLocation,
  type ExaminerLocationPublic,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  className?: string;
  onSaved?: () => void;
};

function validateForm(town: string, gps: string): string | null {
  if (!town.trim()) return "Town is required.";
  if (!gps.trim()) return "GhanaPost GPS address is required.";
  return null;
}

export function ExaminerLocationForm({ token, className, onSaved }: Props) {
  const formId = useId();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ExaminerLocationPublic | null>(null);
  const [editing, setEditing] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [town, setTown] = useState("");
  const [ghanapostGpsAddress, setGhanapostGpsAddress] = useState("");

  const loadLocation = useCallback(async () => {
    setLoading(true);
    setCardError(null);
    try {
      const row = await getPublicExaminerLocation(token);
      setSaved(row);
      if (row) {
        setTown(row.town);
        setGhanapostGpsAddress(row.ghanapost_gps_address);
        setEditing(false);
      } else {
        setTown("");
        setGhanapostGpsAddress("");
        setEditing(true);
      }
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Could not load location");
      setSaved(null);
      setEditing(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadLocation();
  }, [loadLocation]);

  function startEdit() {
    setFormError(null);
    setSuccessMessage(null);
    if (saved) {
      setTown(saved.town);
      setGhanapostGpsAddress(saved.ghanapost_gps_address);
    }
    setEditing(true);
  }

  function cancelEdit() {
    setFormError(null);
    if (saved) {
      setTown(saved.town);
      setGhanapostGpsAddress(saved.ghanapost_gps_address);
      setEditing(false);
    } else {
      setTown("");
      setGhanapostGpsAddress("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const validationError = validateForm(town, ghanapostGpsAddress);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setBusy(true);
    try {
      const row = await upsertPublicExaminerLocation(token, {
        town: town.trim(),
        ghanapost_gps_address: ghanapostGpsAddress.trim(),
      });
      setSaved(row);
      setTown(row.town);
      setGhanapostGpsAddress(row.ghanapost_gps_address);
      setEditing(false);
      setSuccessMessage(saved ? "Your location has been updated." : "Your location has been saved.");
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-16 rounded bg-muted/80" />
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
          <MapPin className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${formId}-title`} className="text-base font-semibold text-foreground">
            Your location
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {saved
              ? "We use your town and GhanaPost GPS address for coordination and logistics."
              : "Add the town where you live and your GhanaPost GPS digital address."}
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

      {saved && !editing ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
          <p className="text-sm font-medium text-foreground">{saved.town}</p>
          <p className="mt-1 font-mono text-sm tracking-wide text-muted-foreground">
            {saved.ghanapost_gps_address}
          </p>
        </div>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className={formLabelClass} htmlFor={`${formId}-town`}>
              Town
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
              {busy ? "Saving…" : saved ? "Save changes" : "Save location"}
            </Button>
            {saved ? (
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

      {saved && !editing ? (
        <Button type="button" variant="outline" className="mt-4 min-h-11 w-full" onClick={startEdit}>
          <Pencil className="mr-2 size-4" aria-hidden />
          Update location
        </Button>
      ) : null}
    </section>
  );
}
