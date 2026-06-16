"use client";

import { useMemo, useState } from "react";

import { Search } from "lucide-react";

import { ExaminerContactCard } from "@/components/examiners/examiner-contact-card";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { CohortRosterMember } from "@/components/cohorts/types";
import { EXAMINER_LIST_SEARCH_DEBOUNCE_MS, useDebounced } from "@/hooks/use-debounced";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass } from "@/lib/form-classes";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

type Props = {
  members: CohortRosterMember[];
  onInAppSms?: (member: CohortRosterMember) => void;
  disabled?: boolean;
  className?: string;
};

function regionLabel(value: string): string {
  return REGION_OPTIONS.find((r) => r.value === value)?.label ?? value;
}

function memberMetaLine(member: CohortRosterMember): string {
  const role = EXAMINER_TYPE_LABELS[member.examiner_type as ExaminerTypeApi] ?? member.examiner_type;
  return `${role} · ${regionLabel(member.region)}`;
}

function filterMembers(members: CohortRosterMember[], query: string): CohortRosterMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter((m) => {
    const haystack = [
      m.name,
      regionLabel(m.region),
      EXAMINER_TYPE_LABELS[m.examiner_type as ExaminerTypeApi],
      m.phone_number ?? "",
      m.reference_code ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function CohortRosterMobileList({
  members,
  onInAppSms,
  disabled = false,
  className,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounced(searchQuery, EXAMINER_LIST_SEARCH_DEBOUNCE_MS);
  const isDebouncing =
    searchQuery.trim() !== debouncedSearch.trim() && searchQuery.trim().length > 0;
  const shouldShowList = debouncedSearch.trim().length > 0;

  const sorted = useMemo(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [members],
  );

  const filtered = useMemo(() => {
    if (!shouldShowList) return [];
    return filterMembers(sorted, debouncedSearch);
  }, [debouncedSearch, shouldShowList, sorted]);

  if (members.length === 0) {
    return (
      <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>
        No examiners in this cohort.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="relative shrink-0">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          className={cn(formInputClass, "h-11 pl-9")}
          placeholder="Search members…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search cohort members"
          autoComplete="off"
        />
      </div>

      {isDebouncing ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p>
      ) : !shouldShowList ? (
        <p className="py-6 text-center text-sm leading-relaxed text-muted-foreground">
          Type to search {members.length} member{members.length === 1 ? "" : "s"}.
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No members match your search.</p>
      ) : (
        <ul className="flex flex-col gap-2.5" role="list">
          {filtered.map((member) => (
            <li key={member.id}>
              <ExaminerContactCard
                name={member.name}
                phone={member.phone_number}
                metaLine={memberMetaLine(member)}
                referenceCode={member.reference_code}
                onInAppSms={onInAppSms ? () => onInAppSms(member) : undefined}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
      )}

      {shouldShowList && filtered.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          {filtered.length} of {members.length} shown
        </p>
      ) : null}
    </div>
  );
}
