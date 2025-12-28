"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FilterOptions, SchoolOption } from "@/lib/api";
import { X, Filter, ChevronRight } from "lucide-react";
import { SearchableSelect } from "@/components/SearchableSelect";

interface FilterPanelProps {
  filterOptions: FilterOptions | null;
  filters: {
    region: string | null;
    zone: string | null;
    schoolId: number | null;
  };
  onFiltersChange: (filters: {
    region: string | null;
    zone: string | null;
    schoolId: number | null;
  }) => void;
  loading?: boolean;
}

export function FilterPanel({
  filterOptions,
  filters,
  onFiltersChange,
  loading = false,
}: FilterPanelProps) {
  // Get available zones based on selected region
  const availableZones = filterOptions
    ? filters.region
      ? [
          ...new Set(
            filterOptions.schools
              .filter((s) => s.region === filters.region)
              .map((s) => s.zone)
          ),
        ]
      : filterOptions.zones
    : [];

  // Get available schools based on selected region/zone
  const availableSchools = filterOptions
    ? filterOptions.schools.filter((school) => {
        if (filters.region && school.region !== filters.region) return false;
        if (filters.zone && school.zone !== filters.zone) return false;
        return true;
      })
    : [];

  const selectedSchool = availableSchools.find((s) => s.id === filters.schoolId);

  const handleRegionChange = (value: string | undefined) => {
    onFiltersChange({
      region: value || null,
      zone: null, // Reset zone when region changes
      schoolId: null, // Reset school when region changes
    });
  };

  const handleZoneChange = (value: string | undefined) => {
    onFiltersChange({
      ...filters,
      zone: value || null,
      schoolId: null, // Reset school when zone changes
    });
  };

  const handleSchoolChange = (value: string | undefined) => {
    onFiltersChange({
      ...filters,
      schoolId: value ? parseInt(value) : null,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      region: null,
      zone: null,
      schoolId: null,
    });
  };

  const hasActiveFilters = filters.region || filters.zone || filters.schoolId;

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {/* <Filter className="h-4 w-4" />
            Filters */}
          </CardTitle>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Region Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Region</label>
          <SearchableSelect
            options={filterOptions?.regions.map((region) => ({
              value: region,
              label: region,
            })) || []}
            value={filters.region || undefined}
            onValueChange={handleRegionChange}
            placeholder="All regions"
            disabled={loading || !filterOptions}
            searchPlaceholder="Search regions..."
            emptyMessage="No regions found."
          />
        </div>

        {/* Zone Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Zone</label>
          <SearchableSelect
            options={availableZones.map((zone) => ({
              value: zone,
              label: zone,
            }))}
            value={filters.zone || undefined}
            onValueChange={handleZoneChange}
            placeholder={filters.region ? "All zones" : "Select region first"}
            disabled={loading || !filterOptions || !filters.region}
            searchPlaceholder="Search zones..."
            emptyMessage="No zones found."
          />
        </div>

        {/* School Filter */}
        <div className="space-y-2">
          <label className="text-sm font-medium">School</label>
          <SearchableSelect
            options={availableSchools.map((school) => ({
              value: school.id.toString(),
              label: `${school.name} (${school.code}) - ${school.candidate_count} candidates`,
            }))}
            value={filters.schoolId?.toString() || undefined}
            onValueChange={handleSchoolChange}
            placeholder={
              filters.region || filters.zone
                ? "All schools"
                : "Select region/zone first"
            }
            disabled={loading || !filterOptions || availableSchools.length === 0}
            searchPlaceholder="Search schools..."
            emptyMessage="No schools found."
          />
        </div>

        {/* Active Filters Summary */}
        {hasActiveFilters && (
          <div className="pt-4 border-t space-y-2">
            <div className="text-sm font-medium">Active Filters:</div>
            <div className="flex flex-wrap gap-2">
              {filters.region && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Region: {filters.region}
                  <button
                    onClick={() => handleRegionChange(undefined)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {filters.zone && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Zone: {filters.zone}
                  <button
                    onClick={() => handleZoneChange(undefined)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {selectedSchool && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  School: {selectedSchool.name}
                  <button
                    onClick={() => handleSchoolChange(undefined)}
                    className="ml-1 hover:bg-muted rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Breadcrumb Navigation */}
        {hasActiveFilters && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <button
                onClick={clearFilters}
                className="hover:text-foreground transition-colors"
              >
                All
              </button>
              {filters.region && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => handleZoneChange(undefined)}
                    className="hover:text-foreground transition-colors"
                  >
                    {filters.region}
                  </button>
                </>
              )}
              {filters.zone && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <button
                    onClick={() => handleSchoolChange(undefined)}
                    className="hover:text-foreground transition-colors"
                  >
                    {filters.zone}
                  </button>
                </>
              )}
              {selectedSchool && (
                <>
                  <ChevronRight className="h-3 w-3" />
                  <span>{selectedSchool.name}</span>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
