"use client";

import { useEffect } from "react";

import type { ScriptControlSubjectTypeFilter } from "@/lib/script-control-subjects";

type Options = {
  enabled: boolean;
  pageSubjectTypeFilter: ScriptControlSubjectTypeFilter;
  pageSubjectId: string;
  setSubjectTypeFilter: (value: ScriptControlSubjectTypeFilter) => void;
  setSubjectFilter: (value: string[] | ((prev: string[]) => string[])) => void;
};

/** Sync roster / invitation table filters from the page-level subject scope bar. */
export function useSyncPageSubjectScope({
  enabled,
  pageSubjectTypeFilter,
  pageSubjectId,
  setSubjectTypeFilter,
  setSubjectFilter,
}: Options) {
  useEffect(() => {
    if (!enabled) return;
    setSubjectTypeFilter(pageSubjectTypeFilter);
    setSubjectFilter(pageSubjectId.trim() ? [pageSubjectId.trim()] : []);
  }, [enabled, pageSubjectId, pageSubjectTypeFilter, setSubjectFilter, setSubjectTypeFilter]);
}
