export const MONITORING_ROLES = ["SUPER_ADMIN", "TEST_ADMIN_OFFICER", "EXECUTIVE_VIEWER"] as const;

export function canAccessMonitoring(role: string): boolean {
  return (MONITORING_ROLES as readonly string[]).includes(role);
}

export function parseMonitoringExamIdFromUrl(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}
