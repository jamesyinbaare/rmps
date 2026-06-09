import type { MembershipExaminer } from "@/components/cohorts/types";

export type ExaminerPreviewRow = {
  id: string;
  name: string;
  region: string;
  examiner_type: string;
  sources: ("region" | "role" | "manual")[];
};

export type MembershipPreviewBreakdown = {
  viaRegion: number;
  viaRole: number;
  manualOnly: number;
  rows: ExaminerPreviewRow[];
};

export function computeMembershipPreview(
  examiners: MembershipExaminer[],
  membersDraft: Record<string, boolean>,
  regionsDraft: Record<string, boolean>,
  rolesDraft: Record<string, boolean>,
): MembershipPreviewBreakdown {
  const activeRegions = new Set(
    Object.entries(regionsDraft)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );
  const activeRoles = new Set(
    Object.entries(rolesDraft)
      .filter(([, v]) => v)
      .map(([k]) => k),
  );

  const rows: ExaminerPreviewRow[] = [];
  let viaRegion = 0;
  let viaRole = 0;
  let manualOnly = 0;

  for (const ex of examiners) {
    if (!membersDraft[ex.id]) continue;
    const sources: ("region" | "role" | "manual")[] = [];
    const fromRegion = activeRegions.has(ex.region);
    const fromRole = activeRoles.has(ex.examiner_type);
    if (fromRegion) {
      sources.push("region");
      viaRegion += 1;
    }
    if (fromRole) {
      sources.push("role");
      viaRole += 1;
    }
    if (!fromRegion && !fromRole) {
      sources.push("manual");
      manualOnly += 1;
    }
    rows.push({
      id: ex.id,
      name: ex.name,
      region: ex.region,
      examiner_type: ex.examiner_type,
      sources,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return { viaRegion, viaRole, manualOnly, rows };
}
