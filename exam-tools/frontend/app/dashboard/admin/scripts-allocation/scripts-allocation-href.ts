export const SCRIPTS_ALLOCATION_BASE = "/dashboard/admin/scripts-allocation";
export const SCRIPTS_ALLOCATION_SETUP_BASE = "/dashboard/admin/scripts-allocation/setup";
export const SCRIPTS_ALLOCATION_MANUAL_BASE = "/dashboard/admin/scripts-allocation/manual";

export function scriptsAllocationHref(
  params: {
    exam: number | null;
    subjectId?: number | null;
    paper?: number | null;
    allocationId?: string | null;
  },
  opts?: { setup?: boolean },
): string {
  const base = opts?.setup ? SCRIPTS_ALLOCATION_SETUP_BASE : SCRIPTS_ALLOCATION_BASE;
  const p = new URLSearchParams();
  if (params.exam != null) p.set("exam", String(params.exam));
  if (params.subjectId != null && params.subjectId > 0) p.set("subject", String(params.subjectId));
  if (params.paper != null && params.paper > 0) p.set("paper", String(Math.floor(params.paper)));
  if (params.allocationId) p.set("allocation", params.allocationId);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

export function manualAllocationHref(params: {
  exam: number | null;
  subjectId?: number | null;
  paper?: number | null;
  subjectType?: "all" | "CORE" | "ELECTIVE" | null;
}): string {
  const p = new URLSearchParams();
  if (params.exam != null) p.set("exam", String(params.exam));
  if (params.subjectType != null && params.subjectType !== "all") p.set("stype", params.subjectType);
  if (params.subjectId != null && params.subjectId > 0) p.set("subject", String(params.subjectId));
  if (params.paper != null && params.paper > 0) p.set("paper", String(Math.floor(params.paper)));
  const qs = p.toString();
  return qs ? `${SCRIPTS_ALLOCATION_MANUAL_BASE}?${qs}` : SCRIPTS_ALLOCATION_MANUAL_BASE;
}
