"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ClipboardList, MapPin } from "lucide-react";

import { WorkforceAppointmentLetterSection } from "@/components/workforce/workforce-appointment-letter-section";
import { WorkforceBankAccountForm } from "@/components/workforce/workforce-bank-account-form";
import { WorkforcePortalLandingPanel } from "@/components/workforce/workforce-portal-landing-panel";
import {
  WorkforcePortalLoadingState,
  WorkforcePortalShell,
  WorkforcePortalTile,
} from "@/components/workforce/workforce-portal-shell";
import { getPublicWorkforcePortal, type WorkforcePublicBatchRow, type WorkforcePublicPortal } from "@/lib/api";
import type { WorkforceKindConfig } from "@/lib/workforce-kind";
import { cn } from "@/lib/utils";

function workUnitLabel(kind: WorkforceKindConfig["kind"]): string {
  return kind === "data-entry-clerk" ? "entries" : "scripts";
}

function formatBatchSubject(batch: WorkforcePublicBatchRow): string {
  const code = batch.subject_code?.trim();
  const name = batch.subject_name?.trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || `Subject ${batch.subject_id}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatTime(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.split(":");
  if (parts.length < 2) return raw;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return raw;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function BatchCard({
  batch,
  variant,
  unitLabel,
}: {
  batch: WorkforcePublicBatchRow;
  variant: "active" | "completed";
  unitLabel: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-3",
        variant === "active"
          ? "border-primary/30 bg-primary/5"
          : "border-border/70 bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{formatBatchSubject(batch)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paper {batch.paper_number} · Batch {batch.batch_sequence}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            variant === "active"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {batch.script_count} {unitLabel}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Assigned {formatDate(batch.assigned_at)}
        {batch.completed_at ? ` · Completed ${formatDate(batch.completed_at)}` : ""}
      </p>
    </div>
  );
}

function CompletedBatchesSection({
  batches,
  unitLabel,
}: {
  batches: WorkforcePublicBatchRow[];
  unitLabel: string;
}) {
  const [open, setOpen] = useState(batches.length <= 3);

  if (batches.length === 0) {
    return (
      <section className="mt-6" aria-labelledby="completed-work-heading">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          <h2 id="completed-work-heading" className="text-sm font-semibold text-foreground">
            Completed batches
          </h2>
        </div>
        <p className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-3.5 py-4 text-center text-sm text-muted-foreground">
          No completed batches yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6" aria-labelledby="completed-work-heading">
      <button
        type="button"
        className="mb-3 flex w-full items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="completed-batches-list"
      >
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden />
        <h2 id="completed-work-heading" className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          Completed batches
          <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({batches.length})</span>
        </h2>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div id="completed-batches-list" className="space-y-2">
          {batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} variant="completed" unitLabel={unitLabel} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

type Props = {
  config: WorkforceKindConfig;
};

export function WorkforcePublicPortalPage({ config }: Props) {
  const params = useParams();
  const token = params.token as string;
  const [profile, setProfile] = useState<WorkforcePublicPortal | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setProfile(await getPublicWorkforcePortal(config.kind, token));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Portal link not found");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [config.kind, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <WorkforcePortalLoadingState portalLabel={config.label} />;
  }

  if (loadError || !profile) {
    return (
      <WorkforcePortalShell portalLabel={config.label}>
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">Portal unavailable</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {loadError ?? "This link may be invalid. Please contact the exam office if you need help."}
          </p>
        </div>
      </WorkforcePortalShell>
    );
  }

  const isConfirmed = profile.availability_status === "confirmed";
  const showLanding = !isConfirmed;

  if (showLanding) {
    return (
      <WorkforcePortalShell portalLabel={config.label}>
        <WorkforcePortalLandingPanel config={config} token={token} profile={profile} onConfirmed={() => void load()} />
      </WorkforcePortalShell>
    );
  }

  const unitLabel = workUnitLabel(config.kind);
  const activeTotal = profile.active_batches.reduce((sum, b) => sum + b.script_count, 0);
  const completedTotal = profile.completed_batches.reduce((sum, b) => sum + b.script_count, 0);
  const startTime = formatTime(profile.work_start_time);
  const endTime = formatTime(profile.work_end_time);
  const hasSchedule = Boolean(profile.exercise_start_date || profile.venue || startTime || endTime);
  const bankEditable = profile.bank_details_editable === true;

  return (
    <WorkforcePortalShell portalLabel={config.label}>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">{profile.examination_label}</p>
        {profile.reference_code ? (
          <p className="text-xs text-muted-foreground">Ref. {profile.reference_code}</p>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <WorkforcePortalTile label="In progress" value={activeTotal > 0 ? `${activeTotal} ${unitLabel}` : "—"} />
        <WorkforcePortalTile label="Completed" value={completedTotal > 0 ? `${completedTotal} ${unitLabel}` : "—"} />
      </div>

      {hasSchedule ? (
        <section className="mt-6 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm" aria-labelledby="exercise-schedule-heading">
          <div className="mb-2 flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden />
            <h2 id="exercise-schedule-heading" className="text-sm font-semibold text-foreground">
              Exercise schedule
              {profile.cohort_name ? (
                <span className="ml-2 font-normal text-muted-foreground">· {profile.cohort_name}</span>
              ) : null}
            </h2>
          </div>
          <dl className="space-y-1.5 text-sm">
            {profile.exercise_start_date ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Starts</dt>
                <dd className="text-right font-medium text-foreground">{formatDate(profile.exercise_start_date)}</dd>
              </div>
            ) : null}
            {startTime || endTime ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Hours</dt>
                <dd className="text-right font-medium text-foreground">
                  {[startTime, endTime].filter(Boolean).join(" – ")}
                </dd>
              </div>
            ) : null}
            {profile.venue ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Location</dt>
                <dd className="text-right font-medium text-foreground">{profile.venue}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="mt-6" aria-labelledby="active-work-heading">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" aria-hidden />
          <h2 id="active-work-heading" className="text-sm font-semibold text-foreground">
            Active work
          </h2>
        </div>
        {profile.active_batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-3.5 py-4 text-center text-sm text-muted-foreground">
            No {unitLabel} assigned right now.
          </p>
        ) : (
          <div className="space-y-2">
            {profile.active_batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} variant="active" unitLabel={unitLabel} />
            ))}
          </div>
        )}
      </section>

      <CompletedBatchesSection batches={profile.completed_batches} unitLabel={unitLabel} />

      <div className="mt-6">
        <WorkforceAppointmentLetterSection
          kind={config.kind}
          token={token}
          personName={profile.name}
          available={profile.appointment_letters_available === true}
          pendingMessage={profile.appointment_letters_pending_message}
        />
      </div>

      {bankEditable ? (
        <WorkforceBankAccountForm
          kind={config.kind}
          token={token}
          examinationLabel={profile.examination_label}
        />
      ) : (
        <section className="mt-6 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">Bank details</h2>
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {profile.bank_details_pending_message ??
              "Bank details entry has been disabled by the examination office."}
          </p>
        </section>
      )}
    </WorkforcePortalShell>
  );
}
