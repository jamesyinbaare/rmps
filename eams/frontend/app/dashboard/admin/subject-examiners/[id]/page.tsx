"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getSubjectExaminer,
  updateSubjectExaminer,
  openSubjectExaminer,
  closeSubjectExaminer,
  archiveSubjectExaminer,
  listQuotas,
  saveQuotasBulk,
  runInvitation,
  promoteWaitlist,
  listInvitations,
  getQuotaCompliance,
  notifyApproved,
  forceApproveAllocation,
  forceDeclineAllocation,
  promoteAllocation,
  demoteAllocation,
  getInvitationReport,
  getQuotaComplianceReport,
  exportInvitationsCsv,
  getSubjects,
  listAcceptances,
} from "@/lib/api";
import type {
  SubjectExaminerResponse,
  SubjectQuotaResponse,
  InvitationWithExaminerResponse,
  AdminAcceptanceListResponse,
  Subject,
  AllocationStatus,
  AcceptanceStatus,
} from "@/types";
import { GHANA_REGIONS } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ArrowLeft, ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

const ALLOCATION_STATUS_OPTIONS: AllocationStatus[] = [
  "APPROVED",
  "WAITLISTED",
  "REJECTED",
];

export default function AdminSubjectExaminerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [subjectExaminer, setSubjectExaminer] = useState<SubjectExaminerResponse | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTotalRequired, setEditTotalRequired] = useState<string>("");
  const [editExperienceRatio, setEditExperienceRatio] = useState<string>("");

  useEffect(() => {
    getSubjectExaminer(id)
      .then(setSubjectExaminer)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load subject examiner");
        router.replace("/dashboard/admin/examinations");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    getSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const subjectName = subjectExaminer ? subjectMap.get(subjectExaminer.subject_id)?.name ?? subjectExaminer.subject_id : "";
  const examinationLabel = subjectExaminer
    ? `${subjectExaminer.examination_year ?? ""} – ${subjectName}`
    : "";

  const handleOpen = async () => {
    if (!subjectExaminer) return;
    setUpdating(true);
    try {
      const updated = await openSubjectExaminer(subjectExaminer.id);
      setSubjectExaminer(updated);
      toast.success("Subject examiner opened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open");
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = async () => {
    if (!subjectExaminer) return;
    setUpdating(true);
    try {
      const updated = await closeSubjectExaminer(subjectExaminer.id);
      setSubjectExaminer(updated);
      toast.success("Subject examiner closed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setUpdating(false);
    }
  };

  const handleArchive = async () => {
    if (!subjectExaminer) return;
    setUpdating(true);
    try {
      await archiveSubjectExaminer(subjectExaminer.id);
      toast.success("Subject examiner archived");
      router.replace(subjectExaminer.examination_id ? `/dashboard/admin/examinations/${subjectExaminer.examination_id}` : "/dashboard/admin/examinations");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    } finally {
      setUpdating(false);
    }
  };

  const canEdit = !!subjectExaminer; // total_required and experience_ratio are editable regardless of status

  const handleStartEdit = () => {
    if (!subjectExaminer) return;
    setEditTotalRequired(String(subjectExaminer.total_required));
    setEditExperienceRatio(String(subjectExaminer.experience_ratio));
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!subjectExaminer) return;
    const totalRequired = parseInt(editTotalRequired, 10);
    const experienceRatio = parseFloat(editExperienceRatio);
    if (Number.isNaN(totalRequired) || totalRequired < 0) {
      toast.error("Total required must be a non-negative number");
      return;
    }
    if (Number.isNaN(experienceRatio) || experienceRatio < 0 || experienceRatio > 1) {
      toast.error("Experience ratio must be a number between 0 and 1");
      return;
    }
    setUpdating(true);
    try {
      const updated = await updateSubjectExaminer(subjectExaminer.id, {
        total_required: totalRequired,
        experience_ratio: experienceRatio,
      });
      setSubjectExaminer(updated);
      setEditing(false);
      toast.success("Subject examiner updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !subjectExaminer) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={subjectExaminer.examination_id ? `/dashboard/admin/examinations/${subjectExaminer.examination_id}` : "/dashboard/admin/examinations"}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            {examinationLabel} – {subjectName}
          </h1>
          <div className="text-muted-foreground">
            Status: <Badge variant="secondary">{subjectExaminer.status}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Overview</CardTitle>
          {canEdit && !editing && (
            <Button variant="outline" size="sm" onClick={handleStartEdit} disabled={updating}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {editing ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-total-required">Total required</Label>
                <Input
                  id="edit-total-required"
                  type="number"
                  min={0}
                  value={editTotalRequired}
                  onChange={(e) => setEditTotalRequired(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-experience-ratio">Experience ratio (0–1)</Label>
                <Input
                  id="edit-experience-ratio"
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={editExperienceRatio}
                  onChange={(e) => setEditExperienceRatio(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={updating}>
                  {updating ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" onClick={handleCancelEdit} disabled={updating}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-2 text-sm">
                <p>
                  <span className="font-medium">Total required:</span>{" "}
                  {subjectExaminer.total_required}
                </p>
                <p>
                  <span className="font-medium">Experience ratio:</span>{" "}
                  {subjectExaminer.experience_ratio}
                </p>
                <p>
                  <span className="font-medium">Acceptance deadline:</span>{" "}
                  {subjectExaminer.acceptance_deadline
                    ? new Date(subjectExaminer.acceptance_deadline).toLocaleString()
                    : "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {subjectExaminer.status === "DRAFT" && (
                  <Button onClick={handleOpen} disabled={updating}>
                    Open subject examiner
                  </Button>
                )}
                {(subjectExaminer.status === "OPEN" || subjectExaminer.status === "ALLOCATED") && (
                  <Button variant="outline" onClick={handleClose} disabled={updating}>
                    Close subject examiner
                  </Button>
                )}
                {subjectExaminer.status === "CLOSED" && (
                  <Button
                    variant="destructive"
                    onClick={handleArchive}
                    disabled={updating}
                  >
                    Archive subject examiner
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="quotas" className="w-full">
        <TabsList>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
          <TabsTrigger value="invitation">Invitation</TabsTrigger>
          <TabsTrigger value="invitations">Invitations list</TabsTrigger>
          <TabsTrigger value="acceptance">Acceptance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="quotas">
          <QuotasTab subjectExaminerId={subjectExaminer.id} totalRequired={subjectExaminer.total_required} />
        </TabsContent>
        <TabsContent value="invitation">
          <InvitationTab
            subjectExaminerId={subjectExaminer.id}
            status={subjectExaminer.status}
          />
        </TabsContent>
        <TabsContent value="invitations">
          <InvitationsListTab
            subjectExaminerId={subjectExaminer.id}
            onUpdate={() => {}}
          />
        </TabsContent>
        <TabsContent value="acceptance">
          <AcceptancesTab subjectExaminerId={subjectExaminer.id} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab subjectExaminerId={subjectExaminer.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type RegionRow = {
  key: string;
  min_count: number | null;
  max_count: number | null;
  percentage: number | null;
};

type GenderRow = {
  key: "M" | "F";
  label: string;
  min_count: number | null;
  max_count: number | null;
  percentage: number | null;
};

function buildInitialRegionRows(): RegionRow[] {
  return GHANA_REGIONS.map((key) => ({
    key,
    min_count: null,
    max_count: null,
    percentage: null,
  }));
}

function buildInitialGenderRows(): GenderRow[] {
  return [
    { key: "M", label: "Male (M)", min_count: null, max_count: null, percentage: null },
    { key: "F", label: "Female (F)", min_count: null, max_count: null, percentage: null },
  ];
}

function QuotasTab({ subjectExaminerId, totalRequired }: { subjectExaminerId: string; totalRequired: number }) {
  const [regionRows, setRegionRows] = useState<RegionRow[]>(buildInitialRegionRows);
  const [genderRows, setGenderRows] = useState<GenderRow[]>(buildInitialGenderRows);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const regionSumMin = regionRows.reduce((s, r) => s + (r.min_count ?? 0), 0);
  const regionSumMax = regionRows.reduce((s, r) => s + (r.max_count ?? 0), 0);
  const genderSumMin = genderRows.reduce((s, r) => s + (r.min_count ?? 0), 0);
  const genderSumMax = genderRows.reduce((s, r) => s + (r.max_count ?? 0), 0);

  const load = () => {
    setLoading(true);
    listQuotas(subjectExaminerId)
      .then((quotas: SubjectQuotaResponse[]) => {
        setRegionRows((prev) =>
          prev.map((row) => {
            const q = quotas.find(
              (x) => x.quota_type === "REGION" && x.quota_key === row.key
            );
            return q
              ? {
                  ...row,
                  min_count: q.min_count,
                  max_count: q.max_count,
                  percentage: q.percentage,
                }
              : { ...row, min_count: null, max_count: null, percentage: null };
          })
        );
        setGenderRows((prev) =>
          prev.map((row) => {
            const q = quotas.find(
              (x) => x.quota_type === "GENDER" && x.quota_key === row.key
            );
            return q
              ? {
                  ...row,
                  min_count: q.min_count,
                  max_count: q.max_count,
                  percentage: q.percentage,
                }
              : { ...row, min_count: null, max_count: null, percentage: null };
          })
        );
      })
      .catch(() => {
        setRegionRows(buildInitialRegionRows());
        setGenderRows(buildInitialGenderRows());
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [subjectExaminerId]);

  const setRegionRow = (index: number, patch: Partial<RegionRow>) => {
    setRegionRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const setGenderRow = (index: number, patch: Partial<GenderRow>) => {
    setGenderRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const region_quotas = regionRows
        .filter(
          (r) =>
            r.min_count != null || r.max_count != null || r.percentage != null
        )
        .map((r) => ({
          quota_key: r.key,
          min_count: r.min_count ?? undefined,
          max_count: r.max_count ?? undefined,
          percentage: r.percentage ?? undefined,
        }));
      const gender_quotas = genderRows
        .filter(
          (r) =>
            r.min_count != null || r.max_count != null || r.percentage != null
        )
        .map((r) => ({
          quota_key: r.key,
          min_count: r.min_count ?? undefined,
          max_count: r.max_count ?? undefined,
          percentage: r.percentage ?? undefined,
        }));
      await saveQuotasBulk(subjectExaminerId, {
        region_quotas,
        gender_quotas,
      });
      toast.success("Quotas saved");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save quotas");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Quotas</CardTitle>
        <Button size="sm" onClick={handleSave} disabled={loading || saving}>
          {saving ? "Saving..." : "Save quotas"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div>
              <h4 className="font-medium mb-2">Region quotas</h4>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Region</th>
                      <th className="p-2 text-left font-medium">Min count</th>
                      <th className="p-2 text-left font-medium">Max count</th>
                      <th className="p-2 text-left font-medium">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionRows.map((row, i) => (
                      <tr key={row.key} className="border-b">
                        <td className="p-2">{row.key}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24"
                            value={row.min_count ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseInt(e.target.value, 10) : null;
                              setRegionRow(i, { min_count: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24"
                            value={row.max_count ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseInt(e.target.value, 10) : null;
                              setRegionRow(i, { max_count: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-24"
                            value={row.percentage ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseFloat(e.target.value) : null;
                              setRegionRow(i, { percentage: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <span className="font-medium">Total required (subject examiner):</span>
                <span>{totalRequired}</span>
                <span className="text-muted-foreground">|</span>
                <span>Sum of region min:</span>
                <span className={regionSumMin > totalRequired ? "text-destructive font-medium" : ""}>
                  {regionSumMin}
                  {regionSumMin > totalRequired && " (exceeds total)"}
                </span>
                <span className="text-muted-foreground">|</span>
                <span>Sum of region max:</span>
                <span className={regionSumMax > 0 && regionSumMax < totalRequired ? "text-destructive font-medium" : ""}>
                  {regionSumMax || "—"}
                  {regionSumMax > 0 && regionSumMax < totalRequired && " (below total)"}
                </span>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Gender quotas</h4>
              <div className="overflow-x-auto rounded border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-left font-medium">Gender</th>
                      <th className="p-2 text-left font-medium">Min count</th>
                      <th className="p-2 text-left font-medium">Max count</th>
                      <th className="p-2 text-left font-medium">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {genderRows.map((row, i) => (
                      <tr key={row.key} className="border-b">
                        <td className="p-2">{row.label}</td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24"
                            value={row.min_count ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseInt(e.target.value, 10) : null;
                              setGenderRow(i, { min_count: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-24"
                            value={row.max_count ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseInt(e.target.value, 10) : null;
                              setGenderRow(i, { max_count: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-24"
                            value={row.percentage ?? ""}
                            onChange={(e) => {
                              const n = e.target.value ? parseFloat(e.target.value) : null;
                              setGenderRow(i, { percentage: n != null ? Math.max(0, n) : null });
                            }}
                            placeholder="—"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                <span className="font-medium">Total required (subject examiner):</span>
                <span>{totalRequired}</span>
                <span className="text-muted-foreground">|</span>
                <span>Sum of gender min:</span>
                <span className={genderSumMin > totalRequired ? "text-destructive font-medium" : ""}>
                  {genderSumMin}
                  {genderSumMin > totalRequired && " (exceeds total)"}
                </span>
                <span className="text-muted-foreground">|</span>
                <span>Sum of gender max:</span>
                <span className={genderSumMax > 0 && genderSumMax < totalRequired ? "text-destructive font-medium" : ""}>
                  {genderSumMax || "—"}
                  {genderSumMax > 0 && genderSumMax < totalRequired && " (below total)"}
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InvitationTab({
  subjectExaminerId,
  status,
}: {
  subjectExaminerId: string;
  status: string;
}) {
  const [running, setRunning] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [slotCount, setSlotCount] = useState(1);
  const [compliance, setCompliance] = useState<{
    compliant: boolean;
    violations: unknown[];
    approved_count: number;
    examiners_without_region?: number;
    hint?: string | null;
  } | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [existingCount, setExistingCount] = useState(0);

  const loadCompliance = () => {
    getQuotaCompliance(subjectExaminerId)
      .then(setCompliance)
      .catch(() => setCompliance(null));
  };

  const loadExistingCount = () => {
    listInvitations(subjectExaminerId)
      .then((list) => setExistingCount(list.length))
      .catch(() => setExistingCount(0));
  };

  useEffect(() => {
    loadCompliance();
    loadExistingCount();
  }, [subjectExaminerId]);

  const handleRun = async () => {
    const isRerun = existingCount > 0;
    if (isRerun && !window.confirm("This will replace current invitations. Continue?")) {
      return;
    }
    setRunning(true);
    try {
      const result = await runInvitation(subjectExaminerId);
      setLastResult(
        `${result.approved} approved, ${result.waitlisted} waitlisted, ${result.rejected} rejected. ${result.message}`
      );
      toast.success(isRerun ? "Invitation rerun completed" : "Invitation run completed");
      loadCompliance();
      loadExistingCount();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invitation run failed");
    } finally {
      setRunning(false);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const result = await promoteWaitlist(subjectExaminerId, slotCount);
      setLastResult(
        `Promoted ${result.promoted ?? 0}. ${result.message ?? ""}`
      );
      toast.success("Waitlist promoted");
      loadCompliance();
      loadExistingCount();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoting(false);
    }
  };

  const canRun = status === "OPEN" || status === "DRAFT" || status === "ALLOCATED";
  const isRerun = existingCount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {compliance != null && (
          <div>
            <p className="text-sm font-medium">Quota compliance</p>
            <p className="text-sm text-muted-foreground">
              Compliant: {compliance.compliant ? "Yes" : "No"} | Approved count:{" "}
              {compliance.approved_count}
            </p>
            {compliance.violations.length > 0 && (
              <pre className="mt-1 text-xs text-destructive">
                {JSON.stringify(compliance.violations, null, 2)}
              </pre>
            )}
            {compliance.hint && (
              <p className="mt-2 text-xs text-muted-foreground max-w-xl">
                {compliance.hint}
              </p>
            )}
          </div>
        )}
        {lastResult && (
          <p className="text-sm text-muted-foreground">{lastResult}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canRun && (
            <Button onClick={handleRun} disabled={running}>
              {running ? "Running..." : isRerun ? "Rerun invitation" : "Run invitation"}
            </Button>
          )}
          <div className="flex items-end gap-2">
            <div>
              <Label className="text-xs">Promote waitlist (slots)</Label>
              <Input
                type="number"
                min={1}
                value={slotCount}
                onChange={(e) =>
                  setSlotCount(parseInt(e.target.value, 10) || 1)
                }
                className="w-20"
              />
            </div>
          <Button
            variant="outline"
            onClick={handlePromote}
            disabled={promoting}
          >
            {promoting ? "Promoting..." : "Promote waitlist"}
          </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Run invitation, then review and adjust the list on the &quot;Invitations list&quot; tab. Use &quot;Send invitations&quot; there to create acceptance records and notify examiners.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

type InvitationSortKey =
  | "examiner_full_name"
  | "examiner_region"
  | "score"
  | "rank"
  | "allocation_status";
type SortDir = "asc" | "desc";

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: InvitationSortKey;
  currentSort: { key: InvitationSortKey; dir: SortDir } | null;
  onSort: (key: InvitationSortKey) => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort?.key === sortKey;
  const dir = isActive ? currentSort.dir : null;
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <Button
        variant="ghost"
        size="sm"
        className={
          align === "right"
            ? "-mr-3 ml-auto h-8 data-[state=open]:bg-accent"
            : "-ml-3 h-8 data-[state=open]:bg-accent"
        }
        onClick={() => onSort(sortKey)}
      >
        <span>{label}</span>
        {dir === "desc" ? (
          <ArrowDown className="ml-2 h-4 w-4" />
        ) : dir === "asc" ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : (
          <ChevronsUpDown className="ml-2 h-4 w-4" />
        )}
      </Button>
    </TableHead>
  );
}

function InvitationsListTab({
  subjectExaminerId,
  onUpdate,
}: {
  subjectExaminerId: string;
  onUpdate: () => void;
}) {
  const [invitations, setInvitations] = useState<InvitationWithExaminerResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AllocationStatus | "">("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: InvitationSortKey; dir: SortDir } | null>(null);
  const [sending, setSending] = useState(false);

  const load = () => {
    setLoading(true);
    listInvitations(subjectExaminerId, statusFilter || undefined)
      .then(setInvitations)
      .catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [subjectExaminerId, statusFilter]);

  const filteredBySearch = useMemo(() => {
    if (!search.trim()) return invitations;
    const q = search.toLowerCase().trim();
    return invitations.filter((row) => {
      const name = (row.examiner_full_name ?? "").toLowerCase();
      const region = (row.examiner_region ?? "").toLowerCase();
      return name.includes(q) || region.includes(q);
    });
  }, [invitations, search]);

  const sortedData = useMemo(() => {
    if (!sort) return filteredBySearch;
    const key = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredBySearch].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return dir;
      if (bVal == null) return -dir;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return dir * aVal.localeCompare(bVal);
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return dir * (aVal - bVal);
      }
      return 0;
    });
  }, [filteredBySearch, sort]);

  const handleSort = (key: InvitationSortKey) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" as SortDir };
      if (prev.dir === "asc") return { key, dir: "desc" as SortDir };
      return null;
    });
  };

  const handleForceApprove = async (allocationId: string) => {
    try {
      await forceApproveAllocation(allocationId);
      toast.success("Invitation approved");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleForceDecline = async (allocationId: string) => {
    try {
      await forceDeclineAllocation(allocationId);
      toast.success("Invitation declined");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handlePromote = async (allocationId: string) => {
    try {
      await promoteAllocation(allocationId);
      toast.success("Promoted");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDemote = async (allocationId: string) => {
    try {
      await demoteAllocation(allocationId);
      toast.success("Demoted");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleSendInvitations = async () => {
    setSending(true);
    try {
      await notifyApproved(subjectExaminerId);
      toast.success("Invitations sent");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Invitations</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={handleSendInvitations}
            disabled={sending || loading || invitations.length === 0}
          >
            {sending ? "Sending..." : "Send invitations"}
          </Button>
          <div className="relative min-w-[180px] flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or region..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter || "all"}
            onValueChange={(v) =>
              setStatusFilter(v === "all" ? "" : (v as AllocationStatus))
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ALLOCATION_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : invitations.length === 0 ? (
          <p className="text-muted-foreground">No invitations.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    label="Name"
                    sortKey="examiner_full_name"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Region"
                    sortKey="examiner_region"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Score"
                    sortKey="score"
                    currentSort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Rank"
                    sortKey="rank"
                    currentSort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="allocation_status"
                    currentSort={sort}
                    onSort={handleSort}
                  />
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No invitations match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedData.map((a, index) => (
                    <TableRow
                      key={a.id}
                      className={cn(
                        index % 2 === 0 ? "bg-muted/40" : "bg-background"
                      )}
                    >
                      <TableCell className="font-medium">
                        {a.examiner_full_name ?? a.examiner_id}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.examiner_region ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.score ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {a.rank ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{a.allocation_status}</Badge>
                      </TableCell>
                      <TableCell className="flex gap-1 flex-wrap">
                        {a.allocation_status === "WAITLISTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleForceApprove(a.id)}
                          >
                            Approve
                          </Button>
                        )}
                        {a.allocation_status === "APPROVED" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleForceDecline(a.id)}
                            >
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDemote(a.id)}
                            >
                              Demote
                            </Button>
                          </>
                        )}
                        {a.allocation_status === "WAITLISTED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handlePromote(a.id)}
                          >
                            Promote
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && invitations.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing {sortedData.length} of {invitations.length} invitation
            {invitations.length === 1 ? "" : "s"}
            {search.trim() ? " (filtered)" : ""}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const ACCEPTANCE_STATUS_OPTIONS: AcceptanceStatus[] = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
];

function AcceptancesTab({ subjectExaminerId }: { subjectExaminerId: string }) {
  const [acceptances, setAcceptances] = useState<AdminAcceptanceListResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AcceptanceStatus | "">("ACCEPTED");

  const load = () => {
    setLoading(true);
    listAcceptances(subjectExaminerId, statusFilter || undefined)
      .then(setAcceptances)
      .catch(() => setAcceptances([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [subjectExaminerId, statusFilter]);

  const formatDate = (s: string | null) =>
    s ? new Date(s).toLocaleString() : "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Acceptance</CardTitle>
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) =>
            setStatusFilter(v === "all" ? "" : (v as AcceptanceStatus))
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {ACCEPTANCE_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : acceptances.length === 0 ? (
          <p className="text-muted-foreground">
            No acceptances yet. Default filter is &quot;ACCEPTED&quot; — examiners appear here after they accept the invitation.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notified at</TableHead>
                  <TableHead>Responded at</TableHead>
                  <TableHead>Response deadline</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acceptances.map((acc, index) => (
                  <TableRow
                    key={acc.id}
                    className={cn(
                      index % 2 === 0 ? "bg-muted/40" : "bg-background"
                    )}
                  >
                    <TableCell className="font-medium">
                      {acc.examiner_full_name ?? acc.examiner_id}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {acc.examiner_region ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          acc.status === "ACCEPTED"
                            ? "default"
                            : acc.status === "DECLINED"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {acc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(acc.notified_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(acc.responded_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(acc.response_deadline)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && acceptances.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Showing {acceptances.length} examiner{acceptances.length === 1 ? "" : "s"}
            {statusFilter ? ` with status ${statusFilter}` : ""}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsTab({ subjectExaminerId }: { subjectExaminerId: string }) {
  const [report, setReport] = useState<unknown>(null);
  const [complianceReport, setComplianceReport] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = () => {
    setLoading(true);
    Promise.all([
      getInvitationReport(subjectExaminerId),
      getQuotaComplianceReport(subjectExaminerId),
    ])
      .then(([r, c]) => {
        setReport(r);
        setComplianceReport(c);
      })
      .catch(() => {
        setReport(null);
        setComplianceReport(null);
      })
      .finally(() => setLoading(false));
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await exportInvitationsCsv(subjectExaminerId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invitations_${subjectExaminerId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Reports</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}>
            {loading ? "Loading..." : "Refresh reports"}
          </Button>
          <Button size="sm" onClick={handleExportCsv} disabled={exporting}>
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {report != null && (
          <div>
            <p className="text-sm font-medium">Invitation report</p>
            <pre className="mt-1 max-h-48 overflow-auto rounded border p-2 text-xs">
              {JSON.stringify(report, null, 2)}
            </pre>
          </div>
        )}
        {complianceReport != null && (
          <div>
            <p className="text-sm font-medium">Quota compliance report</p>
            <pre className="mt-1 max-h-48 overflow-auto rounded border p-2 text-xs">
              {JSON.stringify(complianceReport, null, 2)}
            </pre>
          </div>
        )}
        {!loading && report == null && complianceReport == null && (
          <p className="text-muted-foreground">
            Click &quot;Refresh reports&quot; to load invitation and quota compliance data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
