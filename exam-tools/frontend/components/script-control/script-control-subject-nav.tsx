"use client";

import { displaySubjectCode, buildSubjectCompletion, subjectEditStatus, type SubjectEditStatusFilter } from "@/lib/script-control-completion";
import type { ScriptSubjectRowResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  needs_work: "bg-amber-500",
  verified: "bg-emerald-500",
  empty: "bg-muted-foreground/40",
};

type Props = {
  subjects: ScriptSubjectRowResponse[];
  selectedSubjectId: number | null;
  filter: SubjectEditStatusFilter;
  search: string;
  todayIso: string;
  onSelect: (subjectId: number) => void;
  onFilterChange: (f: SubjectEditStatusFilter) => void;
  onSearchChange: (q: string) => void;
};

export function ScriptControlSubjectNav({
  subjects,
  selectedSubjectId,
  filter,
  search,
  todayIso,
  onSelect,
  onFilterChange,
  onSearchChange,
}: Props) {
  const q = search.trim().toLowerCase();
  const filtered = subjects.filter((sub) => {
    if (filter === "needs_work" && subjectEditStatus(buildSubjectCompletion(sub, todayIso)) !== "needs_work") return false;
    if (filter === "verified" && subjectEditStatus(buildSubjectCompletion(sub, todayIso)) !== "verified") return false;
    if (!q) return true;
    const code = displaySubjectCode(sub).toLowerCase();
    return code.includes(q) || sub.subject_name.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border p-3 space-y-2">
        <input
          type="search"
          placeholder="Search subjects…"
          className="flex h-9 w-full rounded-md border border-input-border bg-background px-3 text-sm"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {(["all", "needs_work", "verified"] as SubjectEditStatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
              onClick={() => onFilterChange(f)}
            >
              {f === "all" ? "All" : f === "needs_work" ? "Needs work" : "Verified"}
            </button>
          ))}
        </div>
      </div>
      <ul className="max-h-[min(70vh,640px)] flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <li className="px-2 py-4 text-center text-xs text-muted-foreground">No subjects match.</li>
        ) : (
          filtered.map((sub) => {
            const c = buildSubjectCompletion(sub, todayIso);
            const st = subjectEditStatus(c);
            const active = sub.subject_id === selectedSubjectId;
            return (
              <li key={sub.subject_id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                    active ? "bg-primary/10 font-medium text-foreground" : "hover:bg-muted/60",
                  )}
                  onClick={() => onSelect(sub.subject_id)}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[st])} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {displaySubjectCode(sub)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {c.recordedSeries}/{c.totalSeries}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
