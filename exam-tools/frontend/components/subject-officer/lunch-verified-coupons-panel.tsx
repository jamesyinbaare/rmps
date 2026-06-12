"use client";

import { useId, useMemo, useState } from "react";

import { BadgeCheck, ChevronDown, Clock3, Search, UserCheck } from "lucide-react";

import { humanizeRegion } from "@/components/examiners/utils";
import { Badge } from "@/components/ui/badge";
import type { LunchCouponVerifiedRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  items: LunchCouponVerifiedRow[];
  loading: boolean;
  error: string | null;
  className?: string;
};

function formatVerifiedAt(value: string): { time: string; date: string } {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { time: value, date: "" };
  }
  return {
    time: parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    date: parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
}

function matchesSearch(item: LunchCouponVerifiedRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.name.toLowerCase().includes(q) ||
    item.reference_code.toLowerCase().includes(q) ||
    item.examiner_type_label.toLowerCase().includes(q) ||
    item.subject_codes.some((code) => code.toLowerCase().includes(q)) ||
    humanizeRegion(item.region).toLowerCase().includes(q)
  );
}

function VerifiedCouponDetails({ item }: { item: LunchCouponVerifiedRow }) {
  const { time, date } = formatVerifiedAt(item.verified_at);

  return (
    <dl className="grid gap-2 text-xs">
      {item.examination_name ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Examination</dt>
          <dd className="text-right font-medium text-foreground">{item.examination_name}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Role</dt>
        <dd className="text-right font-medium text-foreground">{item.examiner_type_label}</dd>
      </div>
      {item.subject_codes.length > 0 ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Subject(s)</dt>
          <dd className="text-right font-medium text-foreground">{item.subject_codes.join(", ")}</dd>
        </div>
      ) : null}
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Region</dt>
        <dd className="text-right font-medium text-foreground">{humanizeRegion(item.region)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">Verified</dt>
        <dd className="text-right font-medium text-foreground">
          {time}
          {date ? ` · ${date}` : ""}
        </dd>
      </div>
      {item.verified_by_name ? (
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">By</dt>
          <dd className="inline-flex items-center justify-end gap-1 text-right font-medium text-foreground">
            <UserCheck className="size-3.5 shrink-0 opacity-70" aria-hidden />
            {item.verified_by_name}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function VerifiedCouponMobileRow({ item }: { item: LunchCouponVerifiedRow }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const { time } = formatVerifiedAt(item.verified_at);

  return (
    <li className="overflow-hidden rounded-lg border border-border/60 bg-background/90">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left active:bg-muted/40"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={detailsId}
      >
        <BadgeCheck className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-foreground">{item.name}</p>
          <p className="mt-0.5 font-mono text-[11px] leading-none text-muted-foreground">{item.reference_code}</p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{time}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div id={detailsId} className="border-t border-border/60 bg-muted/20 px-2.5 py-2">
          <VerifiedCouponDetails item={item} />
        </div>
      ) : null}
    </li>
  );
}

function VerifiedCouponDesktopCard({ item }: { item: LunchCouponVerifiedRow }) {
  const { time, date } = formatVerifiedAt(item.verified_at);

  return (
    <li className="rounded-xl border border-border/70 bg-background/80 p-3.5 shadow-sm transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
          <BadgeCheck className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{item.name}</p>
              <p className="mt-1 inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-foreground">
                {item.reference_code}
              </p>
            </div>
            <div className="shrink-0 text-right text-xs text-muted-foreground">
              <p className="font-medium text-foreground">{time}</p>
              <p>{date}</p>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-normal">
              {item.examiner_type_label}
            </Badge>
            {item.subject_codes.map((code) => (
              <Badge key={code} variant="outline" className="font-mono text-[11px] font-normal">
                {code}
              </Badge>
            ))}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{humanizeRegion(item.region)}</span>
            {item.verified_by_name ? (
              <span className="inline-flex items-center gap-1">
                <UserCheck className="size-3.5 shrink-0 opacity-70" aria-hidden />
                {item.verified_by_name}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function VerifiedCouponsSkeleton({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <ul className="space-y-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <li key={index} className="animate-pulse rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <div className="size-3.5 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-muted" />
                <div className="h-3 w-12 rounded bg-muted" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2 p-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <li key={index} className="animate-pulse rounded-xl border border-border/50 bg-muted/20 p-3.5">
          <div className="flex gap-3">
            <div className="size-9 rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="h-5 w-16 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LunchVerifiedCouponsPanel({ items, loading, error, className }: Props) {
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, search)),
    [items, search],
  );

  const showSearch = items.length >= 4;

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-sm",
        "max-lg:max-h-none lg:sticky lg:top-4 lg:max-h-[min(72vh,720px)]",
        className,
      )}
    >
      <div className="shrink-0 border-b border-border/70 bg-muted/20 px-3 py-3 sm:px-5 sm:py-3.5">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 text-left lg:pointer-events-none"
          onClick={() => setPanelOpen((value) => !value)}
          aria-expanded={panelOpen}
          aria-controls="verified-coupons-list"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 lg:size-8">
              <BadgeCheck className="size-3.5 lg:size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Verified coupons</h3>
              <p className="text-[11px] text-muted-foreground lg:hidden">
                {items.length === 0 ? "None yet" : "Tap a row for details"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-6 px-2 text-xs tabular-nums">
              {items.length}
            </Badge>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform duration-200 lg:hidden",
                panelOpen && "rotate-180",
              )}
              aria-hidden
            />
          </div>
        </button>

        {showSearch ? (
          <div className="relative mt-2.5 hidden lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or code…"
              className="h-10 w-full rounded-lg border border-input-border bg-input pr-3 pl-9 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              aria-label="Search verified coupons"
            />
          </div>
        ) : null}
      </div>

      <div
        id="verified-coupons-list"
        className={cn("min-h-0 flex-1 flex-col", panelOpen ? "flex" : "hidden lg:flex")}
      >
        {showSearch ? (
          <div className="relative shrink-0 border-b border-border/70 px-3 py-2 lg:hidden">
            <Search className="pointer-events-none absolute top-1/2 left-6 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or code…"
              className="h-9 w-full rounded-lg border border-input-border bg-input pr-3 pl-9 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              aria-label="Search verified coupons"
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3 lg:px-4 lg:py-3 max-lg:max-h-[min(42vh,360px)]">
          {loading ? (
            <>
              <div className="lg:hidden">
                <VerifiedCouponsSkeleton compact />
              </div>
              <div className="hidden lg:block">
                <VerifiedCouponsSkeleton />
              </div>
            </>
          ) : error ? (
            <p className="px-1 py-6 text-center text-sm text-destructive lg:py-8">{error}</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-3 py-8 text-center lg:px-4 lg:py-10">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground lg:size-12">
                <Clock3 className="size-5 lg:size-6" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">No verified coupons yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground lg:text-sm">
                Scan or enter a reference code to verify an examiner for lunch.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground lg:py-8">
              No matches for &ldquo;{search.trim()}&rdquo;.
            </p>
          ) : (
            <>
              <ul className="space-y-1 lg:hidden">
                {filteredItems.map((item) => (
                  <VerifiedCouponMobileRow key={item.examiner_id} item={item} />
                ))}
              </ul>
              <ul className="hidden space-y-2 lg:block">
                {filteredItems.map((item) => (
                  <VerifiedCouponDesktopCard key={item.examiner_id} item={item} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
