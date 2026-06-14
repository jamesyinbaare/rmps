"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardList } from "lucide-react";

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

      <section className="mt-6" aria-labelledby="completed-work-heading">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
          <h2 id="completed-work-heading" className="text-sm font-semibold text-foreground">
            Completed batches
          </h2>
        </div>
        {profile.completed_batches.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 bg-muted/10 px-3.5 py-4 text-center text-sm text-muted-foreground">
            No completed batches yet.
          </p>
        ) : (
          <div className="space-y-2">
            {profile.completed_batches.map((batch) => (
              <BatchCard key={batch.id} batch={batch} variant="completed" unitLabel={unitLabel} />
            ))}
          </div>
        )}
      </section>

      <WorkforceBankAccountForm
        kind={config.kind}
        token={token}
        examinationLabel={profile.examination_label}
      />
    </WorkforcePortalShell>
  );
}
