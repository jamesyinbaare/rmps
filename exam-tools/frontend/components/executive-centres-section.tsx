"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { BottomSheet } from "@/components/bottom-sheet";
import { ExecutiveCentreDetailPanel } from "@/components/executive-centre-detail-panel";
import {
  ExecutiveLoadingPulse,
  ExecutiveSectionHeading,
  executiveFormInputClass,
} from "@/components/executive-ui";
import {
  getExecutiveCentreDetail,
  type ExecutiveCentreListItem,
  type ExecutiveCentreDetailResponse,
} from "@/lib/api";
import {
  getCachedNationalOverview,
  peekCachedNationalOverview,
} from "@/lib/executive-overview-cache";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

function executiveCentreRowId(centerId: string): string {
  return `executive-centre-row-${centerId}`;
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest('input, textarea, select, [contenteditable="true"]');
}

function scrollExecutiveCentreRowIntoView(centerId: string): void {
  if (typeof window === "undefined") return;
  if (!window.matchMedia("(min-width: 768px)").matches) return;
  requestAnimationFrame(() => {
    document
      .getElementById(executiveCentreRowId(centerId))
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

const centreBrowseNavBtnClass = cn(
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-card text-foreground shadow-sm transition-colors",
  "hover:bg-primary/8 disabled:pointer-events-none disabled:opacity-35",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

function ExecutiveCentreBrowseBar({
  index,
  total,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= 1) return null;

  return (
    <div className="flex h-full w-full items-center" role="navigation" aria-label="Browse examination centres">
      <div className="flex h-[4.25rem] w-full items-center gap-2 rounded-xl border border-primary/20 bg-linear-to-r from-primary/5 via-card to-success/5 px-2 shadow-sm">
        <button
          type="button"
          className={centreBrowseNavBtnClass}
          disabled={!hasPrev}
          aria-label="Previous centre"
          onClick={onPrev}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            {index + 1} of {total.toLocaleString()}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <span className="hidden items-center gap-1 lg:inline-flex">
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                ←
              </kbd>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
                →
              </kbd>
              <span>arrow keys</span>
            </span>
            <span className="hidden lg:inline" aria-hidden>
              ·
            </span>
            <span>tap previous / next</span>
          </p>
        </div>
        <button
          type="button"
          className={centreBrowseNavBtnClass}
          disabled={!hasNext}
          aria-label="Next centre"
          onClick={onNext}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

type CentreCardProps = {
  centre: ExecutiveCentreListItem;
  selected: boolean;
  onSelect: () => void;
};

function CentreStatCell({
  label,
  value,
  tint,
}: {
  label: string;
  value: number;
  tint: "primary" | "success" | "secondary";
}) {
  const bg =
    tint === "primary"
      ? "bg-primary/8"
      : tint === "success"
        ? "bg-success/8"
        : "bg-secondary/15";
  const num =
    tint === "primary"
      ? "text-primary"
      : tint === "success"
        ? "text-success"
        : "text-secondary-foreground";

  return (
    <div className={cn("rounded-lg px-2 py-2 text-center", bg)}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 tabular-nums text-base font-bold", num)}>{value.toLocaleString()}</dd>
    </div>
  );
}

function ExecutiveCentreCard({ centre, selected, onSelect }: CentreCardProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "w-full overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-colors",
          "min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected
            ? "border-primary/50 ring-2 ring-primary/25"
            : "border-primary/20 hover:border-primary/35 hover:shadow-md active:bg-muted/40",
        )}
      >
        {selected ? (
          <div className="h-1 bg-linear-to-r from-primary via-secondary to-success" aria-hidden />
        ) : null}
        <div className="p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm font-bold text-primary">{centre.center_code}</p>
              <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-medium text-foreground">
                {centre.center_name}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-secondary/20 px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                <MapPin className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
                {centre.region}
              </p>
            </div>
            <ChevronRight
              className={cn(
                "mt-0.5 h-5 w-5 shrink-0 transition-transform",
                selected ? "rotate-90 text-primary" : "text-muted-foreground",
              )}
              aria-hidden
            />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3">
            <CentreStatCell label="Candidates" value={centre.candidate_count} tint="primary" />
            <CentreStatCell label="Schools" value={centre.school_count} tint="success" />
            <CentreStatCell label="Inspectors" value={centre.inspector_count} tint="secondary" />
          </dl>
        </div>
      </button>
    </li>
  );
}

type Props = {
  examId: number | null;
  /** Dedicated centres route: skip duplicate page title (shell already shows Centres). */
  standalone?: boolean;
  /** Override helper text when standalone (e.g. Test Admin inspectors browse). */
  standaloneHint?: string;
};

export function ExecutiveCentresSection({
  examId,
  standalone = false,
  standaloneHint,
}: Props) {
  const [centres, setCentres] = useState<ExecutiveCentreListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutiveCentreDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadCentres = useCallback(async (id: number) => {
    setError(null);
    try {
      const result = await getCachedNationalOverview(id, {
        includeCentres: true,
        onUpdate: (data) => {
          setCentres(data.centres ?? []);
          setLoading(false);
        },
      });
      setCentres(result.data.centres ?? []);
    } catch (e) {
      setCentres([]);
      setError(e instanceof Error ? e.message : "Could not load examination centres");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedCenterId(null);
    setDetail(null);
    setDetailError(null);
    setSearch("");
    setRegionFilter("");
    if (examId == null) {
      setCentres([]);
      setLoading(false);
      return;
    }
    const peek = peekCachedNationalOverview(examId, true);
    if (peek?.centres != null && peek.centres.length > 0) {
      setCentres(peek.centres);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void loadCentres(examId);
  }, [examId, loadCentres]);

  useEffect(() => {
    if (examId == null || selectedCenterId == null) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void getExecutiveCentreDetail(examId, selectedCenterId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(e instanceof Error ? e.message : "Could not load centre details");
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, selectedCenterId]);

  const drawerOpen = selectedCenterId != null;

  function closeCentreDetail() {
    setSelectedCenterId(null);
    setDetail(null);
    setDetailError(null);
  }

  const filteredCentres = useMemo(() => {
    const q = search.trim().toLowerCase();
    return centres.filter((c) => {
      if (regionFilter && c.region !== regionFilter) return false;
      if (!q) return true;
      return (
        c.center_code.toLowerCase().includes(q) ||
        c.center_name.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q)
      );
    });
  }, [centres, search, regionFilter]);

  const selectedCentreIndex = useMemo(() => {
    if (selectedCenterId == null) return -1;
    return filteredCentres.findIndex((c) => c.center_id === selectedCenterId);
  }, [selectedCenterId, filteredCentres]);

  const browseToIndex = useCallback(
    (idx: number) => {
      const centre = filteredCentres[idx];
      if (!centre) return;
      setSelectedCenterId(centre.center_id);
      scrollExecutiveCentreRowIntoView(centre.center_id);
    },
    [filteredCentres],
  );

  const goToPrevCentre = useCallback(() => {
    if (selectedCentreIndex > 0) browseToIndex(selectedCentreIndex - 1);
  }, [selectedCentreIndex, browseToIndex]);

  const goToNextCentre = useCallback(() => {
    if (selectedCentreIndex >= 0 && selectedCentreIndex < filteredCentres.length - 1) {
      browseToIndex(selectedCentreIndex + 1);
    }
  }, [selectedCentreIndex, filteredCentres.length, browseToIndex]);

  useEffect(() => {
    if (!drawerOpen || selectedCenterId == null) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isEditableKeyTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        if (selectedCentreIndex > 0) {
          e.preventDefault();
          goToPrevCentre();
        }
      } else if (e.key === "ArrowRight") {
        if (selectedCentreIndex >= 0 && selectedCentreIndex < filteredCentres.length - 1) {
          e.preventDefault();
          goToNextCentre();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, selectedCenterId, selectedCentreIndex, filteredCentres.length, goToPrevCentre, goToNextCentre]);

  function toggleCentre(centerId: string) {
    setSelectedCenterId((prev) => (prev === centerId ? null : centerId));
  }

  if (examId == null) {
    return null;
  }

  return (
    <div
      className={cn(
        "space-y-4 md:space-y-6",
        !standalone && "border-t-2 border-primary/20 pt-6",
      )}
    >
      {standalone ? (
        <p className="text-sm text-muted-foreground">
          {standaloneHint ?? "Tap a centre for schools and inspector contacts."}
        </p>
      ) : (
        <>
          <ExecutiveSectionHeading icon={Building2} accentClass="bg-success">
            Examination centres
          </ExecutiveSectionHeading>
          <p className="-mt-2 text-sm text-muted-foreground">
            Tap a centre for schools and inspector contacts.
          </p>
        </>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-primary/15 bg-linear-to-br from-primary/5 via-card to-success/5 p-4 shadow-sm">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-success">Region</span>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className={executiveFormInputClass}
          >
            <option value="">All regions</option>
            {REGION_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-semibold text-primary">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name…"
            className={executiveFormInputClass}
            enterKeyHint="search"
          />
        </label>
      </div>

      {!loading && filteredCentres.length > 0 ? (
        <p className="text-xs font-medium text-muted-foreground">
          {filteredCentres.length.toLocaleString()} centre
          {filteredCentres.length === 1 ? "" : "s"}
          {centres.length !== filteredCentres.length
            ? ` (of ${centres.length.toLocaleString()} total)`
            : null}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <ExecutiveLoadingPulse label="Loading centres…" />
      ) : filteredCentres.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          {centres.length === 0
            ? "No examination centres with registered candidates."
            : "No centres match your filters."}
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {filteredCentres.map((c) => (
              <ExecutiveCentreCard
                key={c.center_id}
                centre={c}
                selected={selectedCenterId === c.center_id}
                onSelect={() => toggleCentre(c.center_id)}
              />
            ))}
          </ul>

          <div className="hidden overflow-hidden rounded-xl border border-primary/20 shadow-sm md:block">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-primary/15 bg-linear-to-r from-primary/10 via-accent/5 to-success/10 text-left">
                  <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                    Centre
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                    Region
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
                    Candidates
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-success">
                    Schools
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold tabular-nums text-secondary-foreground">
                    Inspectors
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCentres.map((c, i) => {
                  const selected = selectedCenterId === c.center_id;
                  return (
                    <tr
                      key={c.center_id}
                      id={executiveCentreRowId(c.center_id)}
                      className={cn(
                        "cursor-pointer border-b border-border/70 last:border-b-0 transition-colors hover:bg-primary/5",
                        selected && "bg-primary/10",
                        !selected && i % 2 === 1 && "bg-muted/20",
                      )}
                      onClick={() => toggleCentre(c.center_id)}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <span className="font-bold text-primary">{c.center_code}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {c.center_name}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span className="inline-flex rounded-full bg-secondary/20 px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          {c.region}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top font-bold tabular-nums text-primary">
                        {c.candidate_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top font-bold tabular-nums text-success">
                        {c.school_count.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top font-bold tabular-nums text-secondary-foreground">
                        {c.inspector_count.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <BottomSheet
        open={drawerOpen}
        brand
        onOpenChange={(open) => {
          if (!open) closeCentreDetail();
        }}
        title="Examination centre details"
        footer={
          filteredCentres.length > 1 ? (
            <ExecutiveCentreBrowseBar
              index={Math.max(0, selectedCentreIndex)}
              total={filteredCentres.length}
              hasPrev={selectedCentreIndex > 0}
              hasNext={
                selectedCentreIndex >= 0 && selectedCentreIndex < filteredCentres.length - 1
              }
              onPrev={goToPrevCentre}
              onNext={goToNextCentre}
            />
          ) : undefined
        }
      >
        {detailLoading ? (
          <ExecutiveLoadingPulse label="Loading centre details…" />
        ) : detailError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {detailError}
          </p>
        ) : detail ? (
          <ExecutiveCentreDetailPanel detail={detail} onClose={closeCentreDetail} />
        ) : null}
      </BottomSheet>
    </div>
  );
}
