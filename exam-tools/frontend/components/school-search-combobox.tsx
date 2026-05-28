"use client";

import { useEffect, useMemo, useState } from "react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { apiJson, type School, type SchoolListResponse } from "@/lib/api";
import { formLabelClass } from "@/lib/form-classes";

function schoolLabel(s: School): string {
  const code = (s.code ?? "").trim() || "—";
  const name = (s.name ?? "").trim() || "—";
  return `${code} — ${name}`;
}

export type SchoolSearchComboboxProps = {
  /** Selected school id, or empty string when none. */
  value: string;
  onSelect: (school: School | null) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  widthClass?: string;
  disabled?: boolean;
  /** School ids to hide from the list (e.g. already in membership draft). */
  excludeSchoolIds?: Set<string>;
  /** Minimum characters before searching (default 1). */
  minSearchLength?: number;
};

export function SchoolSearchCombobox({
  value,
  onSelect,
  label = "School",
  placeholder = "Search by code or name…",
  searchPlaceholder = "Type code or name…",
  emptyText = "No schools found. Type to search.",
  widthClass = "w-full",
  disabled = false,
  excludeSchoolIds,
  minSearchLength = 1,
}: SchoolSearchComboboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [options, setOptions] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCache, setSelectedCache] = useState<School | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedQuery.length < minSearchLength) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const data = await apiJson<SchoolListResponse>(
          `/schools?skip=0&limit=30&q=${encodeURIComponent(debouncedQuery)}`,
        );
        if (!cancelled) setOptions(data.items);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, minSearchLength]);

  useEffect(() => {
    if (!value) {
      setSelectedCache(null);
      return;
    }
    if (selectedCache?.id === value) return;
    const inOptions = options.find((s) => s.id === value);
    if (inOptions) {
      setSelectedCache(inOptions);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const school = await apiJson<School>(`/schools/${encodeURIComponent(value)}`);
        if (!cancelled) setSelectedCache(school);
      } catch {
        if (!cancelled) setSelectedCache(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, options, selectedCache?.id]);

  const comboboxOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: School[] = [];
    if (selectedCache && !excludeSchoolIds?.has(selectedCache.id)) {
      list.push(selectedCache);
      seen.add(selectedCache.id);
    }
    for (const s of options) {
      if (excludeSchoolIds?.has(s.id) || seen.has(s.id)) continue;
      list.push(s);
      seen.add(s.id);
    }
    return list.map((s) => ({ value: s.id, label: schoolLabel(s) }));
  }, [options, selectedCache, excludeSchoolIds]);

  const handleChange = (schoolId: string) => {
    if (!schoolId) {
      onSelect(null);
      setSelectedCache(null);
      return;
    }
    const school =
      options.find((s) => s.id === schoolId) ??
      (selectedCache?.id === schoolId ? selectedCache : null);
    if (school) {
      setSelectedCache(school);
      onSelect(school);
    }
  };

  return (
    <div>
      {label ? (
        <span className={formLabelClass} id="school-search-label">
          {label}
        </span>
      ) : null}
      <SearchableCombobox
        options={comboboxOptions}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyText={loading ? "Searching…" : emptyText}
        widthClass={widthClass}
        showAllOption={false}
        onSearchChange={setSearchQuery}
        disabled={disabled}
      />
    </div>
  );
}
