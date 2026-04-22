"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiJson, type ExaminationCenterListResponse } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 20;
const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export default function ExaminationCentresPage() {
  const [items, setItems] = useState<ExaminationCenterListResponse["items"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const skip = (page - 1) * PAGE_SIZE;
    const q = debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : "";
    try {
      const data = await apiJson<ExaminationCenterListResponse>(
        `/schools/examination-centers?skip=${skip}&limit=${PAGE_SIZE}${q}`,
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load examination centres");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Examination centres</h2>
      </div>

      <div>
        <label htmlFor="centre-search" className={formLabelClass}>
          Search by code or name
        </label>
        <input
          id="centre-search"
          className={formInputClass}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Type to filter…"
        />
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Code</th>
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Region</th>
              <th className="px-3 py-3 font-medium">Zone</th>
              <th className="px-3 py-3 font-medium">Schools writing here</th>
              <th className="px-3 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No examination centres match your search.
                </td>
              </tr>
            ) : (
              items.map(({ school, hosted_school_count }) => (
                <tr key={school.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-3 font-mono text-xs">{school.code}</td>
                  <td className="max-w-[220px] truncate px-3 py-3">{school.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{school.region}</td>
                  <td className="px-3 py-3">{school.zone}</td>
                  <td className="px-3 py-3 tabular-nums">{hosted_school_count}</td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/dashboard/admin/examination-centres/${school.id}`}
                      className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary hover:bg-muted ${inputFocusRing}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} · {total} centre{total === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className={`min-h-11 rounded-lg border border-input-border px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${inputFocusRing}`}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
