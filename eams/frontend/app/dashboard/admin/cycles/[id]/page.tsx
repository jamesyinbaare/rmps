"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getCycle,
  openCycle,
  closeCycle,
  archiveCycle,
  listQuotas,
  createQuota,
  deleteQuota,
  runAllocation,
  promoteWaitlist,
  listAllocations,
  getQuotaCompliance,
  notifyApproved,
  forceApproveAllocation,
  forceDeclineAllocation,
  promoteAllocation,
  demoteAllocation,
  getAllocationReport,
  getQuotaComplianceReport,
  exportAllocationsCsv,
  getSubjects,
} from "@/lib/api";
import type {
  MarkingCycleResponse,
  SubjectQuotaResponse,
  SubjectQuotaCreate,
  ExaminerAllocationResponse,
  Subject,
  QuotaType,
  AllocationStatus,
} from "@/types";
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
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

const QUOTA_TYPES: QuotaType[] = ["REGION", "GENDER"];
const ALLOCATION_STATUS_OPTIONS: AllocationStatus[] = [
  "APPROVED",
  "WAITLISTED",
  "REJECTED",
];

export default function AdminCycleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [cycle, setCycle] = useState<MarkingCycleResponse | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    getCycle(id)
      .then(setCycle)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load cycle");
        router.replace("/dashboard/admin/cycles");
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  useEffect(() => {
    getSubjects().then(setSubjects).catch(() => setSubjects([]));
  }, []);

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));
  const subjectName = cycle ? subjectMap.get(cycle.subject_id)?.name ?? cycle.subject_id : "";

  const handleOpen = async () => {
    if (!cycle) return;
    setUpdating(true);
    try {
      const updated = await openCycle(cycle.id);
      setCycle(updated);
      toast.success("Cycle opened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open");
    } finally {
      setUpdating(false);
    }
  };

  const handleClose = async () => {
    if (!cycle) return;
    setUpdating(true);
    try {
      const updated = await closeCycle(cycle.id);
      setCycle(updated);
      toast.success("Cycle closed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close");
    } finally {
      setUpdating(false);
    }
  };

  const handleArchive = async () => {
    if (!cycle) return;
    setUpdating(true);
    try {
      await archiveCycle(cycle.id);
      toast.success("Cycle archived");
      router.replace("/dashboard/admin/cycles");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to archive");
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !cycle) {
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
          <Link href="/dashboard/admin/cycles">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            Cycle {cycle.year} – {subjectName}
          </h1>
          <div className="text-muted-foreground">
            Status: <Badge variant="secondary">{cycle.status}</Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <p>
              <span className="font-medium">Total required:</span>{" "}
              {cycle.total_required}
            </p>
            <p>
              <span className="font-medium">Experience ratio:</span>{" "}
              {cycle.experience_ratio}
            </p>
            <p>
              <span className="font-medium">Acceptance deadline:</span>{" "}
              {cycle.acceptance_deadline
                ? new Date(cycle.acceptance_deadline).toLocaleString()
                : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {cycle.status === "DRAFT" && (
              <Button onClick={handleOpen} disabled={updating}>
                Open cycle
              </Button>
            )}
            {(cycle.status === "OPEN" || cycle.status === "ALLOCATED") && (
              <Button variant="outline" onClick={handleClose} disabled={updating}>
                Close cycle
              </Button>
            )}
            {cycle.status === "CLOSED" && (
              <Button
                variant="destructive"
                onClick={handleArchive}
                disabled={updating}
              >
                Archive cycle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="quotas" className="w-full">
        <TabsList>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="allocations">Allocations list</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="quotas">
          <QuotasTab cycleId={cycle.id} subjectId={cycle.subject_id} />
        </TabsContent>
        <TabsContent value="allocation">
          <AllocationTab
            cycleId={cycle.id}
            subjectId={cycle.subject_id}
            status={cycle.status}
          />
        </TabsContent>
        <TabsContent value="allocations">
          <AllocationsListTab
            cycleId={cycle.id}
            subjectId={cycle.subject_id}
            onUpdate={() => {}}
          />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab cycleId={cycle.id} subjectId={cycle.subject_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuotasTab({
  cycleId,
  subjectId,
}: {
  cycleId: string;
  subjectId: string;
}) {
  const [quotas, setQuotas] = useState<SubjectQuotaResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<SubjectQuotaCreate>({
    quota_type: "REGION",
    quota_key: "",
    min_count: null,
    max_count: null,
    percentage: null,
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    listQuotas(cycleId, subjectId)
      .then(setQuotas)
      .catch(() => setQuotas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [cycleId, subjectId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.quota_key.trim()) {
      toast.error("Quota key is required");
      return;
    }
    setSaving(true);
    try {
      await createQuota(cycleId, subjectId, form);
      toast.success("Quota added");
      setAddOpen(false);
      setForm({
        quota_type: "REGION",
        quota_key: "",
        min_count: null,
        max_count: null,
        percentage: null,
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add quota");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (quotaId: string) => {
    try {
      await deleteQuota(quotaId);
      toast.success("Quota deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Quotas</CardTitle>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          Add quota
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : quotas.length === 0 ? (
          <p className="text-muted-foreground">No quotas. Add one to enforce constraints.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">Type</th>
                  <th className="p-2 text-left font-medium">Key</th>
                  <th className="p-2 text-left font-medium">Min</th>
                  <th className="p-2 text-left font-medium">Max</th>
                  <th className="p-2 text-left font-medium">%</th>
                  <th className="p-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map((q) => (
                  <tr key={q.id} className="border-b">
                    <td className="p-2">{q.quota_type}</td>
                    <td className="p-2">{q.quota_key}</td>
                    <td className="p-2">{q.min_count ?? "—"}</td>
                    <td className="p-2">{q.max_count ?? "—"}</td>
                    <td className="p-2">{q.percentage ?? "—"}</td>
                    <td className="p-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(q.id)}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {addOpen && (
          <div className="mt-4 rounded border p-4">
            <h4 className="font-medium mb-2">Add quota</h4>
            <form onSubmit={handleAdd} className="space-y-2">
              <div>
                <Label>Type</Label>
                <Select
                  value={form.quota_type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, quota_type: v as QuotaType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUOTA_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quota key</Label>
                <Input
                  value={form.quota_key}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quota_key: e.target.value }))
                  }
                  placeholder="e.g. NORTH or MALE"
                />
              </div>
              <div className="flex gap-2">
                <div>
                  <Label>Min count</Label>
                  <Input
                    type="number"
                    value={form.min_count ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        min_count: e.target.value
                          ? parseInt(e.target.value, 10)
                          : null,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Max count</Label>
                  <Input
                    type="number"
                    value={form.max_count ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        max_count: e.target.value
                          ? parseInt(e.target.value, 10)
                          : null,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <Label>Percentage</Label>
                  <Input
                    type="number"
                    step={0.01}
                    value={form.percentage ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        percentage: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Adding..." : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllocationTab({
  cycleId,
  subjectId,
  status,
}: {
  cycleId: string;
  subjectId: string;
  status: string;
}) {
  const [allocating, setAllocating] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [slotCount, setSlotCount] = useState(1);
  const [compliance, setCompliance] = useState<{
    compliant: boolean;
    violations: unknown[];
    approved_count: number;
  } | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const loadCompliance = () => {
    getQuotaCompliance(cycleId, subjectId)
      .then(setCompliance)
      .catch(() => setCompliance(null));
  };

  useEffect(() => {
    loadCompliance();
  }, [cycleId, subjectId]);

  const handleAllocate = async () => {
    setAllocating(true);
    try {
      const result = await runAllocation(cycleId, subjectId);
      setLastResult(
        `${result.approved} approved, ${result.waitlisted} waitlisted, ${result.rejected} rejected. ${result.message}`
      );
      toast.success("Allocation completed");
      loadCompliance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setAllocating(false);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const result = await promoteWaitlist(cycleId, subjectId, slotCount);
      setLastResult(
        `Promoted ${result.promoted ?? 0}. ${result.message ?? ""}`
      );
      toast.success("Waitlist promoted");
      loadCompliance();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Promote failed");
    } finally {
      setPromoting(false);
    }
  };

  const handleNotify = async () => {
    setNotifying(true);
    try {
      await notifyApproved(cycleId, subjectId);
      toast.success("Notifications sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Notify failed");
    } finally {
      setNotifying(false);
    }
  };

  const canAllocate = status === "OPEN" || status === "DRAFT";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
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
          </div>
        )}
        {lastResult && (
          <p className="text-sm text-muted-foreground">{lastResult}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {canAllocate && (
            <Button onClick={handleAllocate} disabled={allocating}>
              {allocating ? "Running..." : "Run allocation"}
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
          <Button
            variant="outline"
            onClick={handleNotify}
            disabled={notifying}
          >
            {notifying ? "Sending..." : "Notify approved examiners"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AllocationsListTab({
  cycleId,
  subjectId,
  onUpdate,
}: {
  cycleId: string;
  subjectId: string;
  onUpdate: () => void;
}) {
  const [allocations, setAllocations] = useState<ExaminerAllocationResponse[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<AllocationStatus | "">("");

  const load = () => {
    setLoading(true);
    listAllocations(cycleId, subjectId, statusFilter || undefined)
      .then(setAllocations)
      .catch(() => setAllocations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [cycleId, subjectId, statusFilter]);

  const handleForceApprove = async (allocationId: string) => {
    try {
      await forceApproveAllocation(allocationId);
      toast.success("Allocation approved");
      load();
      onUpdate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleForceDecline = async (allocationId: string) => {
    try {
      await forceDeclineAllocation(allocationId);
      toast.success("Allocation declined");
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Allocations</CardTitle>
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
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : allocations.length === 0 ? (
          <p className="text-muted-foreground">No allocations.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">Examiner ID</th>
                  <th className="p-2 text-left font-medium">Score</th>
                  <th className="p-2 text-left font-medium">Rank</th>
                  <th className="p-2 text-left font-medium">Status</th>
                  <th className="p-2 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a) => (
                  <tr key={a.id} className="border-b">
                    <td className="p-2">{a.examiner_id}</td>
                    <td className="p-2">{a.score ?? "—"}</td>
                    <td className="p-2">{a.rank ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant="secondary">{a.allocation_status}</Badge>
                    </td>
                    <td className="p-2 flex gap-1 flex-wrap">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReportsTab({
  cycleId,
  subjectId,
}: {
  cycleId: string;
  subjectId: string;
}) {
  const [report, setReport] = useState<unknown>(null);
  const [complianceReport, setComplianceReport] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = () => {
    setLoading(true);
    Promise.all([
      getAllocationReport(cycleId, subjectId),
      getQuotaComplianceReport(cycleId, subjectId),
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
      const blob = await exportAllocationsCsv(cycleId, subjectId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `allocations_${cycleId}_${subjectId}.csv`;
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
            <p className="text-sm font-medium">Allocation report</p>
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
            Click &quot;Refresh reports&quot; to load allocation and quota compliance data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
