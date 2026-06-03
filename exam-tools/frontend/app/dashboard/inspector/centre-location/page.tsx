"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getExaminationCentreLocation,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  upsertExaminationCentreLocation,
  type CentreLocation,
  type MyInspectorPostingRow,
} from "@/lib/api";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  getInspectorPostingIdFromToken,
  inspectorMustPickWorkspaceGlobally,
  pickInspectorPostingId,
} from "@/lib/auth";
import { cn } from "@/lib/utils";

const SAVE_SUCCESS_MS = 2400;

const panelClass = "rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";

/** Subtle entrance animations — mobile only; disabled when user prefers reduced motion. */
const mobileIn = "max-lg:motion-safe:animate-in max-lg:motion-safe:fade-in max-lg:motion-safe:duration-300 max-lg:motion-reduce:animate-none";
const mobileSlideUp = `${mobileIn} max-lg:motion-safe:slide-in-from-bottom-4 max-lg:motion-safe:duration-300`;
const mobileSlideDown = `${mobileIn} max-lg:motion-safe:slide-in-from-top-2`;

type PagePhase = "record" | "saved" | "replace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function staticMapImageUrl(lat: number, lng: number): string {
  const center = `${lat},${lng}`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${center}&zoom=16&size=640x320&scale=2&markers=${lat},${lng},lightblue1`;
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function formatCapturedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}°, ${lng.toFixed(5)}°`;
}

function accuracyMeta(accuracyM: number | null | undefined): {
  label: string;
  tone: "good" | "fair" | "poor" | "unknown";
  hint: string | null;
} {
  if (accuracyM == null || !Number.isFinite(accuracyM)) {
    return { label: "Unknown", tone: "unknown", hint: null };
  }
  const rounded = Math.round(accuracyM);
  if (rounded <= 25) return { label: `±${rounded} m`, tone: "good", hint: null };
  if (rounded <= 100) {
    return {
      label: `±${rounded} m`,
      tone: "fair",
      hint: "Signal is fair — move to an open area if you can before saving.",
    };
  }
  return {
    label: `±${rounded} m`,
    tone: "poor",
    hint: "Weak GPS signal — wait a moment outdoors before saving.",
  };
}

function geolocationErrorMessage(code: number): string {
  switch (code) {
    case 1:
      return "Location access was denied. Allow it in your browser settings, then try again.";
    case 2:
      return "Could not get a GPS fix. Check that location services are on.";
    case 3:
      return "Timed out — try again with a clear view of the sky.";
    default:
      return "Could not read your position.";
  }
}

function isLocationNotFoundError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return msg.includes("not recorded") || msg.includes("404") || msg.includes("not found");
}

function derivePhase(hasLocation: boolean, changeMode: boolean): PagePhase {
  if (changeMode) return "replace";
  if (hasLocation) return "saved";
  return "record";
}

function phaseStatusBadge(phase: PagePhase) {
  if (phase === "saved") {
    return <Badge className="bg-success text-success-foreground">Saved</Badge>;
  }
  if (phase === "replace") {
    return (
      <Badge variant="secondary" className="bg-warning text-warning-foreground">
        Updating
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-white/40 bg-black/50 text-white backdrop-blur-sm">
      Not saved yet
    </Badge>
  );
}

function EmptyMapPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted/40 p-6">
      <div className="relative flex size-12 items-center justify-center">
        <span
          className="absolute inset-0 max-lg:motion-safe:animate-ping max-lg:motion-reduce:animate-none rounded-full bg-primary/20"
          aria-hidden
        />
        <div className="relative flex size-12 items-center justify-center rounded-full bg-background text-primary shadow-sm ring-1 ring-border">
          <MapPin className="size-6" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
      <div className={cn("text-center", mobileIn)}>
        <p className="text-sm font-medium text-foreground">Nothing saved yet</p>
        <p className="mt-1 text-sm text-muted-foreground">When you arrive, tap Record below</p>
      </div>
    </div>
  );
}

function GpsBusyOverlay() {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/80 backdrop-blur-sm",
        mobileIn,
      )}
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium text-foreground">Finding your position…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PageHeaderPanel({
  centreName,
  centreCode,
  hasLocation,
  refreshing,
  disabled,
  onRefresh,
}: {
  centreName: string;
  centreCode: string;
  hasLocation: boolean;
  refreshing: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div
        className="h-1 bg-linear-to-r from-primary via-primary/50 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full bg-primary/[0.07] blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-8 left-8 size-28 rounded-full bg-success/[0.06] blur-2xl"
        aria-hidden
      />

      <div className="relative flex items-start gap-3.5 px-4 pt-4 sm:gap-4 sm:px-5 sm:pt-5">
        <div className="relative shrink-0" aria-hidden>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-primary/20 via-primary/10 to-transparent text-primary shadow-sm ring-1 ring-primary/20 sm:size-[3.25rem]">
            <MapPin className="size-5 sm:size-[1.35rem]" strokeWidth={1.75} />
          </div>
          {hasLocation ? (
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-card ring-2 ring-card">
              <CheckCircle2 className="size-4 text-success" strokeWidth={2.25} />
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Your current centre
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-[1.35rem]">
            {centreName}
          </h2>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide text-foreground">
              {centreCode}
            </span>
            {hasLocation ? (
              <Badge className="border-success/25 bg-success/10 text-[11px] font-medium text-success hover:bg-success/10">
                On file
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-primary/25 bg-primary/5 text-[11px] font-medium text-primary"
              >
                Location needed
              </Badge>
            )}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || refreshing}
          onClick={onRefresh}
          aria-label="Refresh"
          className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
        </Button>
      </div>

      <div className="relative mx-4 mb-4 mt-3 sm:mx-5 sm:mb-5 sm:mt-4">
        <div className="flex gap-3 rounded-xl border border-primary/15 bg-linear-to-br from-primary/[0.07] via-card to-muted/25 px-3.5 py-3.5 shadow-sm sm:px-4 sm:py-4">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Navigation className="size-4" strokeWidth={2} aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-foreground/90">
            <span className="font-medium text-foreground">At the centre?</span> Please save your location — we need
            it to plan materials and officer dispatch.
          </p>
        </div>
      </div>
    </header>
  );
}

function MapCardFooter({ location }: { location: CentreLocation }) {
  const meta = accuracyMeta(location.accuracy_m);
  const toneClass =
    meta.tone === "good"
      ? "text-success"
      : meta.tone === "fair"
        ? "text-warning-foreground"
        : meta.tone === "poor"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-card text-sm">
      <div className="px-3 py-3 sm:px-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lat</p>
        <p className="mt-0.5 font-mono text-xs tabular-nums sm:text-sm">{location.latitude.toFixed(5)}°</p>
      </div>
      <div className="px-3 py-3 sm:px-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lng</p>
        <p className="mt-0.5 font-mono text-xs tabular-nums sm:text-sm">{location.longitude.toFixed(5)}°</p>
      </div>
      <div className="px-3 py-3 sm:px-4">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Accuracy</p>
        <p className={cn("mt-0.5 flex items-center gap-1 font-mono text-xs tabular-nums sm:text-sm", toneClass)}>
          {meta.label}
        </p>
      </div>
    </div>
  );
}

function UnifiedMapCard({
  location,
  centreName,
  phase,
  acquiring,
}: {
  location: CentreLocation | null;
  centreName: string;
  phase: PagePhase;
  acquiring: boolean;
}) {
  const [mapFailed, setMapFailed] = useState(false);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="relative aspect-[16/10] w-full bg-muted/30 sm:aspect-2/1">
        {location && !mapFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staticMapImageUrl(location.latitude, location.longitude)}
            alt={`Map near ${centreName}`}
            className="h-full w-full object-cover"
            onError={() => setMapFailed(true)}
          />
        ) : location && mapFailed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/30 p-6">
            <Navigation className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-mono text-sm tabular-nums">{formatCoordinates(location.latitude, location.longitude)}</p>
          </div>
        ) : (
          <EmptyMapPlaceholder />
        )}

        {acquiring ? <GpsBusyOverlay /> : null}

        <div className="absolute top-3 right-3">{phaseStatusBadge(phase)}</div>

        {location ? (
          <a
            href={mapsUrl(location.latitude, location.longitude)}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute right-3 bottom-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-background/95 px-3 text-xs font-medium text-foreground shadow-sm ring-1 ring-border transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            Directions
            <ExternalLink className="size-3.5 opacity-80" aria-hidden />
          </a>
        ) : null}
      </div>

      {location ? (
        <MapCardFooter location={location} />
      ) : (
        <p className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">
          Please tap Record below and allow location when asked.
        </p>
      )}
    </div>
  );
}

function RecordSteps() {
  const steps = [
    "Be at the centre — main gate or assembly point works.",
    "Tap Record location and allow location when your phone asks.",
    "It is saved for this examination centre and used when planning dispatch of materials and officers.",
  ];
  return (
    <ol className="mt-3 space-y-2">
      {steps.map((text, i) => (
        <li key={text} className="flex gap-3 text-sm leading-snug text-muted-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
            {i + 1}
          </span>
          <span className="pt-0.5">{text}</span>
        </li>
      ))}
    </ol>
  );
}

function ActionPanel({
  phase,
  centreName,
  capturedAt,
  onStartReplace,
  onCancelReplace,
}: {
  phase: PagePhase;
  centreName: string;
  capturedAt: string | null;
  onStartReplace: () => void;
  onCancelReplace: () => void;
}) {
  if (phase === "record") {
    return (
      <details open className={panelClass}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-foreground marker:hidden [&::-webkit-details-marker]:hidden">
          What to do
        </summary>
        <RecordSteps />
      </details>
    );
  }

  if (phase === "saved") {
    return (
      <section className={cn(panelClass, "border-success/30 bg-success/5")}>
        <div className="flex gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-foreground">Location saved</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{centreName}</span>
              {capturedAt ? ` · ${formatCapturedAt(capturedAt)}` : " · just now"}. We will use this when
              planning dispatch of examination materials and officers.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-background p-3">
          <p className="text-sm font-medium text-foreground">Saved in the wrong place?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Go to the right spot and save again so dispatch is planned to the correct centre.
          </p>
          <Button type="button" variant="outline" className="mt-3 w-full" onClick={onStartReplace}>
            <Pencil className="size-4" aria-hidden />
            Save a new location
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-warning/40 bg-warning/10 p-4 shadow-sm sm:p-5"
      role="region"
      aria-labelledby="replace-heading"
    >
      <div className="flex gap-3">
        <AlertTriangle className="size-5 shrink-0 text-warning-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="replace-heading" className="text-sm font-semibold text-foreground">
            Save a new location
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Stand where the centre should be, then tap{" "}
            <span className="font-medium text-foreground">Save new location</span> below. This replaces the old one.
          </p>
          <Button type="button" variant="outline" className="mt-3 w-full bg-background sm:w-auto" onClick={onCancelReplace}>
            Keep the current location
          </Button>
        </div>
      </div>
    </section>
  );
}

function AlertBanner({
  variant,
  children,
}: {
  variant: "warning" | "error";
  children: ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-snug",
        variant === "warning"
          ? "border-warning/30 bg-warning/8 text-foreground"
          : "border-destructive/30 bg-destructive/8 text-destructive",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-lg animate-pulse space-y-4 pb-28" aria-busy="true" aria-label="Loading">
      <div className="h-[11.5rem] overflow-hidden rounded-2xl border border-border bg-card shadow-md">
        <div className="h-1 bg-muted" />
        <div className="flex gap-3.5 px-4 pt-4 sm:px-5">
          <div className="size-12 shrink-0 rounded-2xl bg-muted" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="h-2.5 w-24 rounded bg-muted" />
            <div className="h-5 w-full max-w-[14rem] rounded bg-muted" />
            <div className="h-6 w-20 rounded-lg bg-muted" />
          </div>
        </div>
        <div className="mx-4 mb-4 mt-3 h-16 rounded-xl bg-muted/60 sm:mx-5" />
      </div>
      <div className={cn(panelClass, "h-36")} />
      <div className="aspect-[16/10] rounded-2xl border border-border bg-muted/40 sm:aspect-2/1" />
      <div className={cn(panelClass, "h-24")} />
    </div>
  );
}

function SaveSuccessOverlay({ open, centreName, onDismiss }: { open: boolean; centreName: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDismiss, SAVE_SUCCESS_MS);
    return () => window.clearTimeout(t);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-110 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-foreground/40"
        onClick={onDismiss}
      />
      <div
        role="status"
        aria-live="polite"
        className="relative w-full max-w-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 rounded-2xl border border-success/30 bg-card p-6 shadow-lg sm:motion-safe:slide-in-from-bottom-0"
      >
        <div className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-7" strokeWidth={2} aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Location saved</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{centreName}</span> is recorded for dispatch
              planning.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecordLocationButton({
  busy,
  label,
  sublabel,
  pulseHint,
  onClick,
}: {
  busy: boolean;
  label: string;
  sublabel?: string;
  pulseHint?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="lg"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "h-auto w-full flex-col gap-1 py-3.5",
        pulseHint &&
          !busy &&
          "max-lg:motion-safe:animate-pulse max-lg:motion-reduce:animate-none max-lg:ring-2 max-lg:ring-primary/25",
      )}
    >
      <span className="flex items-center gap-2">
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Navigation className="size-5" aria-hidden />}
        {label}
        {!busy ? <ArrowRight className="size-4 opacity-70" aria-hidden /> : null}
      </span>
      {sublabel && !busy ? (
        <span className="text-xs font-normal text-primary-foreground/80">{sublabel}</span>
      ) : null}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InspectorCentreLocationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examId, setExamId] = useState<number | null>(null);
  const [posting, setPosting] = useState<MyInspectorPostingRow | null>(null);
  const [location, setLocation] = useState<CentreLocation | null>(null);
  const [busy, setBusy] = useState(false);
  const [accuracyHint, setAccuracyHint] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [changeMode, setChangeMode] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    setError(null);
    setAccuracyHint(null);
    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    try {
      const exam = await getStaffDefaultExamination();
      setExamId(exam.id);
      const postingsRes = await getMyInspectorPostings(exam.id);
      if (inspectorMustPickWorkspaceGlobally(postingsRes.items.length)) {
        router.replace("/dashboard/inspector/select-workspace");
        return;
      }
      const postingId = pickInspectorPostingId(postingsRes.items, getInspectorPostingIdFromToken());
      const row = postingsRes.items.find((p) => p.id === postingId) ?? postingsRes.items[0] ?? null;
      if (!row) {
        setError("You have no postings for the current examination.");
        setPosting(null);
        setLocation(null);
        return;
      }
      setPosting(row);
      try {
        const loc = await getExaminationCentreLocation(exam.id, row.center_id);
        setLocation(loc);
        setMapKey((k) => k + 1);
      } catch (e) {
        if (isLocationNotFoundError(e)) {
          setLocation(null);
          setChangeMode(false);
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setPosting(null);
      setLocation(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onAuthUpdated() {
      void load({ soft: true });
    }
    window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, onAuthUpdated);
    return () => window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, onAuthUpdated);
  }, [load]);

  async function onRecordGps() {
    if (examId == null || posting == null) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not supported in this browser.");
      return;
    }
    const replacing = changeMode;
    setBusy(true);
    setError(null);
    setAccuracyHint(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const meta = accuracyMeta(Number.isFinite(accuracy) ? accuracy : null);
        if (meta.hint) setAccuracyHint(meta.hint);
        try {
          const saved = await upsertExaminationCentreLocation(
            examId,
            posting.center_id,
            {
              latitude,
              longitude,
              accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
            },
            { replace: replacing },
          );
          setLocation(saved);
          setMapKey((k) => k + 1);
          setChangeMode(false);
          setShowSuccess(true);
          setPosting((prev) => (prev ? { ...prev, has_location: true } : prev));
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save location");
        } finally {
          setBusy(false);
        }
      },
      (geoErr) => {
        setError(geolocationErrorMessage(geoErr.code));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  }

  const hasLocation = location != null;
  const actionBusy = busy;
  const phase = derivePhase(hasLocation, changeMode);
  const showRecordCta = phase === "record" || phase === "replace";

  const recordLabel = busy
    ? "Finding your position…"
    : phase === "replace"
      ? "Save new location"
      : "Record location";
  const recordSublabel = busy ? undefined : "Your phone will ask to use location";

  function handleSuccessDismiss() {
    setShowSuccess(false);
  }

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Centre location" staffRole="inspector">
        <SaveSuccessOverlay
          open={showSuccess}
          centreName={posting?.center_name ?? "this centre"}
          onDismiss={handleSuccessDismiss}
        />

        {loading ? (
          <LoadingSkeleton />
        ) : error && !posting ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
            <AlertTriangle className="mx-auto size-10 text-destructive" aria-hidden />
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
            <Button type="button" className="mt-5" onClick={() => void load({ soft: true })}>
              <RefreshCw className="size-4" aria-hidden />
              Try again
            </Button>
          </div>
        ) : posting ? (
          <div
            className={cn(
              "mx-auto max-w-lg space-y-4 lg:pb-6",
              showRecordCta && "pb-[calc(7rem+env(safe-area-inset-bottom))]",
              mobileIn,
            )}
          >
            <PageHeaderPanel
              centreName={posting.center_name}
              centreCode={posting.center_code}
              hasLocation={hasLocation}
              refreshing={refreshing}
              disabled={actionBusy}
              onRefresh={() => void load({ soft: true })}
            />

            <div className={cn("transition-opacity", refreshing && "pointer-events-none opacity-50", mobileIn)}>
              <div key={mapKey}>
                <UnifiedMapCard
                  location={location}
                  centreName={posting.center_name}
                  phase={phase}
                  acquiring={busy}
                />
              </div>
            </div>

            <ActionPanel
              phase={phase}
              centreName={posting.center_name}
              capturedAt={location?.captured_at ?? null}
              onStartReplace={() => {
                setError(null);
                setAccuracyHint(null);
                setChangeMode(true);
              }}
              onCancelReplace={() => {
                setChangeMode(false);
                setError(null);
                setAccuracyHint(null);
              }}
            />

            {(accuracyHint || error) && (
              <div className={cn("space-y-2", mobileSlideDown)}>
                {accuracyHint ? <AlertBanner variant="warning">{accuracyHint}</AlertBanner> : null}
                {error ? <AlertBanner variant="error">{error}</AlertBanner> : null}
              </div>
            )}

            {showRecordCta ? (
              <>
                <div className="hidden pt-2 lg:block">
                  <RecordLocationButton
                    busy={actionBusy}
                    label={recordLabel}
                    sublabel={recordSublabel}
                    onClick={() => void onRecordGps()}
                  />
                </div>
                <div
                  key={phase}
                  className={cn(
                    "fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden",
                    mobileSlideUp,
                  )}
                >
                  <p className="mb-2 truncate text-center text-xs text-muted-foreground">
                    {posting.center_code} · {posting.center_name}
                  </p>
                  <RecordLocationButton
                    busy={actionBusy}
                    label={recordLabel}
                    sublabel={recordSublabel}
                    pulseHint={phase === "record"}
                    onClick={() => void onRecordGps()}
                  />
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
