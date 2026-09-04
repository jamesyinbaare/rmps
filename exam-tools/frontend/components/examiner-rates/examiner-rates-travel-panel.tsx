"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";

import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import {
  ExaminerRatesPaneHeader,
  InlineSearchField,
  RatesSectionHeader,
  rateAmountInputClass,
} from "@/components/examiner-rates/shared";
import type { ExaminerTypeApi } from "@/lib/api";
import { formatGhsAmount } from "@/lib/format-ghs";
import {
  travelRoleZoneFactorKey,
  type TravelRateDraft,
  type TravelRoleFactorDraft,
  type TravelZoneDraft,
} from "@/lib/examiner-rates-draft";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  editing: boolean;
  saving: boolean;
  travelRates: TravelRateDraft;
  travelZones: TravelZoneDraft;
  travelRoleFactors: TravelRoleFactorDraft;
  cellErrors: Record<string, string>;
  travelRegionSearch: string;
  searchedTravelRegions: typeof REGION_OPTIONS;
  regionZoneAssignment: Record<string, string>;
  assignedTravelRegionCount: number;
  onTravelRegionSearchChange: (value: string) => void;
  onAddZone: () => void;
  onRemoveZone: (zoneId: string) => void;
  onUpdateZoneName: (zoneId: string, name: string) => void;
  onAssignRegion: (region: string, zoneId: string) => void;
  onTravelRateChange: (region: string, value: string) => void;
  onRoleFactorChange: (role: ExaminerTypeApi, zoneId: string, value: string) => void;
  formatTravelRoleFactorDisplay: (raw: string) => string;
};

export function ExaminerRatesTravelPanel({
  editing,
  saving,
  travelRates,
  travelZones,
  travelRoleFactors,
  cellErrors,
  travelRegionSearch,
  searchedTravelRegions,
  regionZoneAssignment,
  assignedTravelRegionCount,
  onTravelRegionSearchChange,
  onAddZone,
  onRemoveZone,
  onUpdateZoneName,
  onAssignRegion,
  onTravelRateChange,
  onRoleFactorChange,
  formatTravelRoleFactorDisplay,
}: Props) {
  return (
    <div>
      <ExaminerRatesPaneHeader
        groupLabel="Travel"
        title="T & T"
        description="Regional base amount × role factor for the examiner’s zone (default factor 1)."
      />
      <div className="space-y-5">
        <div className="rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3">
          <p className="text-sm text-foreground">
            <span className="font-medium">T &amp; T payable</span> = regional base amount × role factor for the
            examiner&apos;s zone (default 1).
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-background px-2.5 py-1">
              {travelZones.length} {travelZones.length === 1 ? "zone" : "zones"}
            </span>
            <span className="rounded-full bg-background px-2.5 py-1">
              {assignedTravelRegionCount}/{REGION_OPTIONS.length} regions assigned
            </span>
          </div>
        </div>

        <section className="overflow-hidden rounded-xl border border-border">
          <RatesSectionHeader
            step={1}
            title="T & T zones"
            description="Group regions into custom zones for role multipliers."
            action={
              editing ? (
                <button
                  type="button"
                  onClick={onAddZone}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                >
                  <Plus className="size-3.5" />
                  Add zone
                </button>
              ) : null
            }
          />
          {travelZones.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MapPin className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
              <p className="mt-3 text-sm text-muted-foreground">
                No zones yet. Add at least one zone, then assign regions in step 2.
              </p>
              {editing ? (
                <button
                  type="button"
                  onClick={onAddZone}
                  disabled={saving}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                >
                  <Plus className="size-4" />
                  Create first zone
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {travelZones.map((zone) => (
                <div key={zone.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-start justify-between gap-2">
                    {editing ? (
                      <input
                        type="text"
                        disabled={saving}
                        className={cn(formInputClass, "min-w-0 flex-1")}
                        value={zone.name}
                        onChange={(e) => onUpdateZoneName(zone.id, e.target.value)}
                        aria-invalid={Boolean(cellErrors[`zone:${zone.id}`])}
                      />
                    ) : (
                      <p className="font-medium text-foreground">{zone.name}</p>
                    )}
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => onRemoveZone(zone.id)}
                        disabled={saving}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Remove ${zone.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  {cellErrors[`zone:${zone.id}`] ? (
                    <p className="mt-1 text-xs text-destructive">{cellErrors[`zone:${zone.id}`]}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {zone.regions.length} {zone.regions.length === 1 ? "region" : "regions"}
                  </p>
                  {zone.regions.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {zone.regions.map((region) => (
                        <span
                          key={region}
                          className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {region}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {travelZones.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-border">
            <RatesSectionHeader
              step={2}
              title="Assign regions to zones"
              description="Each region can belong to one zone. Unassigned regions use factor 1."
            />
            <div className="border-b border-border px-4 py-3">
              <InlineSearchField
                id="travel-region-search"
                value={travelRegionSearch}
                onChange={onTravelRegionSearchChange}
                placeholder="Search regions…"
                className="max-w-sm"
              />
              {travelRegionSearch.trim() ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing {searchedTravelRegions.length} of {REGION_OPTIONS.length} regions
                </p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-4 py-2.5 font-semibold">Region</th>
                    <th className="px-4 py-2.5 font-semibold">T &amp; T zone</th>
                  </tr>
                </thead>
                <tbody>
                  {searchedTravelRegions.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                        No regions match your search.
                      </td>
                    </tr>
                  ) : (
                    searchedTravelRegions.map((region) => (
                      <tr key={region.value} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2">{region.label}</td>
                        <td className="px-4 py-2">
                          {editing ? (
                            <select
                              className={cn(formInputClass, "max-w-xs")}
                              disabled={saving}
                              value={regionZoneAssignment[region.value] ?? ""}
                              onChange={(e) => onAssignRegion(region.value, e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {travelZones.map((zone) => (
                                <option key={zone.id} value={zone.id}>
                                  {zone.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted-foreground">
                              {travelZones.find((z) => z.id === regionZoneAssignment[region.value])?.name ??
                                "Unassigned"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {travelZones.length > 0 ? (
          <section className="overflow-hidden rounded-xl border border-border">
            <RatesSectionHeader
              step={3}
              title="Role × zone multipliers"
              description="Leave blank to use 1. Only affects T & T, not other allowances."
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 font-semibold">Role</th>
                    {travelZones.map((zone) => (
                      <th key={zone.id} className="px-4 py-2.5 font-semibold text-right">
                        {zone.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXAMINER_TYPE_OPTIONS.map((role) => (
                    <tr key={role.value} className="border-b border-border/60 last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">{role.label}</td>
                      {travelZones.map((zone) => {
                        const key = travelRoleZoneFactorKey(role.value, zone.id);
                        return (
                          <td key={zone.id} className="px-4 py-2">
                            {editing ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                disabled={saving}
                                className={rateAmountInputClass}
                                placeholder="1"
                                value={travelRoleFactors[key] ?? ""}
                                onChange={(e) => onRoleFactorChange(role.value, zone.id, e.target.value)}
                                aria-invalid={Boolean(cellErrors[key])}
                              />
                            ) : (
                              <span className="block text-right tabular-nums">
                                {formatTravelRoleFactorDisplay(travelRoleFactors[key] ?? "")}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-xl border border-border">
          <RatesSectionHeader
            step={travelZones.length > 0 ? 4 : 2}
            title="Regional base amounts"
            description="One T & T amount per examiner home region, before the role × zone multiplier."
          />
          <div className="border-b border-border px-4 py-3">
            <InlineSearchField
              id="travel-base-region-search"
              value={travelRegionSearch}
              onChange={onTravelRegionSearchChange}
              placeholder="Search regions…"
              className="max-w-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-2.5 font-semibold">Region</th>
                  <th className="px-4 py-2.5 font-semibold text-right">T &amp; T (GHS)</th>
                </tr>
              </thead>
              <tbody>
                {searchedTravelRegions.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">
                      No regions match your search.
                    </td>
                  </tr>
                ) : (
                  searchedTravelRegions.map((region) => (
                    <tr key={region.value} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2">{region.label}</td>
                      <td className="px-4 py-2">
                        {editing ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            disabled={saving}
                            className={rateAmountInputClass}
                            value={travelRates[region.value] ?? ""}
                            onChange={(e) => onTravelRateChange(region.value, e.target.value)}
                            aria-invalid={Boolean(cellErrors[region.value])}
                          />
                        ) : (
                          <span className="block text-right tabular-nums">
                            {formatGhsAmount(travelRates[region.value] || null)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
