export type SubjectScope = "ALL" | "CORE" | "ELECTIVE";

export const SUBJECT_SCOPE_ORDER: Record<SubjectScope, number> = {
  ALL: 0,
  CORE: 1,
  ELECTIVE: 2,
};

export function normalizeSubjectScope(scope: string): SubjectScope {
  const normalized = scope.toUpperCase();
  if (normalized === "CORE" || normalized === "ELECTIVE" || normalized === "ALL") {
    return normalized;
  }
  return "ALL";
}

export function subjectScopeLabel(scope: string): string {
  const normalized = normalizeSubjectScope(scope);
  if (normalized === "ALL") return "All subjects";
  if (normalized === "CORE") return "Core";
  if (normalized === "ELECTIVE") return "Elective";
  return scope;
}

export function subjectScopeBadgeClass(scope: string): string {
  const normalized = normalizeSubjectScope(scope);
  if (normalized === "CORE") {
    return "border border-primary/40 bg-primary/15 text-primary dark:border-primary/50 dark:bg-primary/25 dark:text-primary-foreground";
  }
  if (normalized === "ELECTIVE") {
    return "border border-amber-500/45 bg-amber-500/15 text-amber-950 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-100";
  }
  return "border border-secondary/55 bg-secondary/30 text-secondary-foreground ring-1 ring-secondary/25 dark:border-secondary/60 dark:bg-secondary/35";
}

export function subjectScopeCardAccentClass(scope: string): string {
  const normalized = normalizeSubjectScope(scope);
  if (normalized === "CORE") {
    return "border-primary/30 bg-linear-to-br from-primary/10 to-card";
  }
  if (normalized === "ELECTIVE") {
    return "border-amber-500/35 bg-linear-to-br from-amber-500/10 to-card";
  }
  return "border-secondary/40 bg-linear-to-br from-secondary/15 to-card";
}

export function subjectScopeCardBorderClass(scope: string): string {
  const normalized = normalizeSubjectScope(scope);
  if (normalized === "CORE") return "border-l-primary";
  if (normalized === "ELECTIVE") return "border-l-amber-500";
  return "border-l-secondary";
}

export function mergeSubjectScopes(existing: string, incoming: string): SubjectScope {
  const left = normalizeSubjectScope(existing);
  const right = normalizeSubjectScope(incoming);
  if (left === "ALL" || right === "ALL") return "ALL";
  if ((left === "CORE" && right === "ELECTIVE") || (left === "ELECTIVE" && right === "CORE")) {
    return "ALL";
  }
  return left;
}

export function inspectorIdentityMergeKey(row: {
  inspector_full_name: string;
  inspector_phone?: string | null;
  inspector_phone_number?: string | null;
  inspector_user_id?: string;
}): string {
  const normalizedName = row.inspector_full_name.trim().toLowerCase();
  const phone = row.inspector_phone ?? row.inspector_phone_number ?? "";
  const normalizedPhone = phone.replace(/\D/g, "");
  if (normalizedName || normalizedPhone) return `np:${normalizedName}|${normalizedPhone}`;
  if (row.inspector_user_id) return `u:${row.inspector_user_id}`;
  return "unknown-inspector";
}

export type PostedInspectorRow = {
  posting_id: string;
  inspector_full_name: string;
  subject_scope: string;
  inspector_phone?: string | null;
  inspector_phone_number?: string | null;
  inspector_user_id?: string;
};

export function mergeAndSortPostedInspectors<T extends PostedInspectorRow>(rows: T[]): T[] {
  const grouped = new Map<string, T>();
  for (const row of rows) {
    const key = inspectorIdentityMergeKey(row);
    const scope = normalizeSubjectScope(row.subject_scope);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...row, subject_scope: scope });
      continue;
    }
    const mergedScope = mergeSubjectScopes(existing.subject_scope, scope);
    grouped.set(key, {
      ...existing,
      posting_id:
        existing.posting_id.localeCompare(row.posting_id) <= 0 ? existing.posting_id : row.posting_id,
      inspector_phone: existing.inspector_phone ?? row.inspector_phone,
      inspector_phone_number: existing.inspector_phone_number ?? row.inspector_phone_number,
      subject_scope: mergedScope,
    });
  }

  return [...grouped.values()].sort((a, b) => {
    const scopeCmp =
      SUBJECT_SCOPE_ORDER[normalizeSubjectScope(a.subject_scope)] -
      SUBJECT_SCOPE_ORDER[normalizeSubjectScope(b.subject_scope)];
    if (scopeCmp !== 0) return scopeCmp;
    const nameCmp = a.inspector_full_name.localeCompare(b.inspector_full_name);
    if (nameCmp !== 0) return nameCmp;
    return a.posting_id.localeCompare(b.posting_id);
  });
}

export function inspectorPostingCountLabel(
  inspectorCount: number,
  rawPostingCount: number,
): string {
  const inspectorWord = inspectorCount === 1 ? "inspector" : "inspectors";
  if (rawPostingCount <= inspectorCount) {
    return `${inspectorCount} ${inspectorWord}`;
  }
  const postingWord = rawPostingCount === 1 ? "posting" : "postings";
  return `${inspectorCount} ${inspectorWord} (${rawPostingCount} ${postingWord})`;
}
