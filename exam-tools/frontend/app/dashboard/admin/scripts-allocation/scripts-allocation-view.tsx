"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileDown } from "lucide-react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  apiJson,
  createExaminerGroup,
  SCRIPTS_ALLOCATION_FORM_MAX_COPIES,
  deleteAllocationRunAssignment,
  downloadScriptsAllocationFormPdf,
  ensureAllocation,
  getAllocation,
  getAllocationRun,
  importAllocationExaminers,
  listAllocationExaminerImportCandidates,
  listAllocationExaminers,
  listAllocationRuns,
  listAllSubjects,
  listExaminerGroups,
  listScriptsAllocationQuotas,
  removeAllocationExaminer,
  replaceScriptsAllocationQuotas,
  solveAllocation,
  updateAllocation,
  upsertAllocationRunAssignment,
  type Allocation,
  type AllocationExaminerRow,
  type AllocationRunDetail,
  type AllocationRunListItem,
  type AllocationRunStatusApi,
  type AllocationSolvePayload,
  type ExaminerGroupRow,
  type ExaminerTypeApi,
  type Examination,
  type ExaminerSubjectRunSummary,
  type Subject,
  type UnassignedEnvelopeItem,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

import { AllocationSetupDialog } from "./allocation-setup-dialog";
import { scriptsAllocationHref } from "./scripts-allocation-href";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidString(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function summarizeSolveMode(m: "monolithic" | "decomposed"): string {
  if (m === "monolithic") return "single MILP";
  return "decomposed (groups + series)";
}

function coerceSolveModeFromAllocation(v: string | null | undefined): "monolithic" | "decomposed" {
  return v === "decomposed" ? "decomposed" : "monolithic";
}

/** Per-examiner allocation form PDF copies (row actions); backend allows up to 20 for bulk only. */
const SCRIPTS_ALLOCATION_ROW_PDF_MAX_COPIES = 3;

const inputFocusRing = "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function formatExaminationLabel(x: Examination): string {
  return `${x.exam_type} ${x.year}${x.exam_series ? ` (${x.exam_series})` : ""} — #${x.id}`;
}

function formatRunTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

function sanitizeDownloadFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "");
}

function runStatusLabel(status: AllocationRunStatusApi): string {
  return status.replace(/_/g, " ");
}

function subgroupStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function RunStatusBadge({ status }: { status: AllocationRunStatusApi }) {
  const isError = status === "infeasible" || status === "timeout" || status === "error";
  if (status === "optimal") {
    return <Badge variant="secondary">{runStatusLabel(status)}</Badge>;
  }
  if (status === "draft") {
    return <Badge variant="muted">{runStatusLabel(status)}</Badge>;
  }
  if (isError) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        {runStatusLabel(status)}
      </Badge>
    );
  }
  return <Badge variant="outline">{runStatusLabel(status)}</Badge>;
}

function examinerTypeLabel(t: ExaminerTypeApi): string {
  if (t === "chief_examiner") return "Chief";
  if (t === "team_leader") return "Team leader";
  return "Assistant";
}

/** Examiner home (recruitment) region. */
function examinerHomeCell(region: string | null | undefined): string {
  const r = region?.trim() ?? "";
  return r || "—";
}

export type ScriptsAllocationViewProps = {
  /** When true, open the consolidated setup dialog once the allocation session is ready (setup route). */
  initialSetupOpen?: boolean;
  /** When true, `router.replace` and in-app links use `/scripts-allocation/setup` as the base path. */
  useSetupPath?: boolean;
};

export function ScriptsAllocationView({
  initialSetupOpen = false,
  useSetupPath = false,
}: ScriptsAllocationViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkOpts = useMemo(() => ({ setup: useSetupPath }), [useSetupPath]);
  const setupAutoOpenedRef = useRef(false);
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [draftSubjectId, setDraftSubjectId] = useState("");
  const [draftPaper, setDraftPaper] = useState("");
  /** Campaign row for the current session (set on successful Start or URL hydrate). */
  const [lockedCampaign, setLockedCampaign] = useState<Allocation | null>(null);
  const [allocationId, setAllocationId] = useState<string | null>(null);
  const [runs, setRuns] = useState<AllocationRunListItem[]>([]);
  const [lastRun, setLastRun] = useState<AllocationRunDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const hadSessionReadyRef = useRef(false);

  const [quotaRows, setQuotaRows] = useState<
    Array<{ rowKey: string; examiner_type: ExaminerTypeApi; subject_id: number; quota_booklets: string }>
  >([]);
  const [poolRows, setPoolRows] = useState<AllocationExaminerRow[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalCandidates, setModalCandidates] = useState<AllocationExaminerRow[]>([]);
  const [modalSelection, setModalSelection] = useState<Record<string, boolean>>({});
  const [modalLoading, setModalLoading] = useState(false);
  const [importModalError, setImportModalError] = useState<string | null>(null);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [quotaSaveError, setQuotaSaveError] = useState<string | null>(null);
  const [poolModalOpen, setPoolModalOpen] = useState(false);
  const [examinerGroups, setExaminerGroups] = useState<ExaminerGroupRow[]>([]);
  const [fairnessWeight, setFairnessWeight] = useState("0.25");
  const [enforceSingleSeries, setEnforceSingleSeries] = useState(true);
  const [excludeHomeScope, setExcludeHomeScope] = useState(true);
  const [solveRuleRows, setSolveRuleRows] = useState<
    Array<{ rowKey: string; markingGroupId: string; targetGroupIds: string[] }>
  >([]);
  const [solveOptionsError, setSolveOptionsError] = useState<string | null>(null);
  const [poolModalFilter, setPoolModalFilter] = useState("");
  const [importModalFilter, setImportModalFilter] = useState("");
  const [assignmentDetailExaminer, setAssignmentDetailExaminer] = useState<ExaminerSubjectRunSummary | null>(null);
  const [manualAssignTarget, setManualAssignTarget] = useState<UnassignedEnvelopeItem | null>(null);
  const [manualAssignExaminerId, setManualAssignExaminerId] = useState("");
  const [manualAssignError, setManualAssignError] = useState<string | null>(null);
  const [unassignedListModalOpen, setUnassignedListModalOpen] = useState(false);
  const [unassignedFilterRegion, setUnassignedFilterRegion] = useState("");
  const [unassignedFilterZone, setUnassignedFilterZone] = useState("");
  const [unassignedFilterSeries, setUnassignedFilterSeries] = useState("");
  const [examinerLoadsSearch, setExaminerLoadsSearch] = useState("");
  const [examinerLoadsTypeFilter, setExaminerLoadsTypeFilter] = useState<ExaminerTypeApi | "">("");
  const [allocationFormPdfCopies, setAllocationFormPdfCopies] = useState(1);
  const [allocationFormRowPdfCopies, setAllocationFormRowPdfCopies] = useState<Record<string, number>>({});
  const [allocationFormPdfBusy, setAllocationFormPdfBusy] = useState(false);
  const [solverSettingsSavedMessage, setSolverSettingsSavedMessage] = useState<string | null>(null);
  const [solveMode, setSolveMode] = useState<"monolithic" | "decomposed">("monolithic");

  const draftSid = Number(draftSubjectId);
  const draftPap = Number(draftPaper);
  const paperIsOneOrTwo =
    draftPaper !== "" && Number.isFinite(draftPap) && (draftPap === 1 || draftPap === 2);
  const tripleOk = Number.isFinite(draftSid) && draftSid > 0 && paperIsOneOrTwo;
  const sessionReady =
    lockedCampaign != null &&
    allocationId === lockedCampaign.id &&
    tripleOk &&
    draftSid === lockedCampaign.subject_id &&
    Math.floor(draftPap) === lockedCampaign.paper_number;

  const selectedAllocation = lockedCampaign;

  const subjectOptions = useMemo(
    () => subjects.map((s) => ({ value: String(s.id), label: `${s.code} — ${s.name}` })),
    [subjects],
  );

  const examOptions = useMemo(
    () => exams.map((x) => ({ value: String(x.id), label: formatExaminationLabel(x) })),
    [exams],
  );

  const selectedSubjectLabel = useMemo(() => {
    if (!selectedAllocation) return "";
    const s = subjects.find((sub) => sub.id === selectedAllocation.subject_id);
    return s ? `${s.code} — ${s.name}` : `Subject #${selectedAllocation.subject_id}`;
  }, [selectedAllocation, subjects]);

  const draftSubjectLabel = useMemo(() => {
    if (!draftSubjectId) return "";
    const s = subjects.find((sub) => String(sub.id) === draftSubjectId);
    return s ? `${s.code} — ${s.name}` : `Subject #${draftSubjectId}`;
  }, [draftSubjectId, subjects]);

  const lockedSubjectLabel = useMemo(() => {
    if (!lockedCampaign) return "";
    const s = subjects.find((sub) => sub.id === lockedCampaign.subject_id);
    return s ? `${s.code} — ${s.name}` : `Subject #${lockedCampaign.subject_id}`;
  }, [lockedCampaign, subjects]);

  const poolRowsFiltered = useMemo(() => {
    const q = poolModalFilter.trim().toLowerCase();
    if (!q) return poolRows;
    return poolRows.filter((p) => p.examiner_name.toLowerCase().includes(q));
  }, [poolRows, poolModalFilter]);

  const importCandidatesFiltered = useMemo(() => {
    const q = importModalFilter.trim().toLowerCase();
    if (!q) return modalCandidates;
    return modalCandidates.filter((c) => c.examiner_name.toLowerCase().includes(q));
  }, [modalCandidates, importModalFilter]);

  const ruleMarkingGroupsFullyAllocated = useMemo(() => {
    const taken = new Set(
      solveRuleRows.map((r) => r.markingGroupId.trim()).filter((s) => s.length > 0),
    );
    return examinerGroups.length > 0 && taken.size >= examinerGroups.length;
  }, [solveRuleRows, examinerGroups.length]);

  const crossMarkingSourceCount = useMemo(
    () => solveRuleRows.filter((r) => r.markingGroupId.trim() !== "").length,
    [solveRuleRows],
  );

  const crossMarkingSummaryText = useMemo(() => {
    const nameById = new Map(examinerGroups.map((g) => [g.id, g.name]));
    const parts = solveRuleRows
      .filter((r) => r.markingGroupId.trim() !== "" && r.targetGroupIds.length > 0)
      .map((r) => {
        const mid = r.markingGroupId.trim();
        const src = nameById.get(mid) ?? `${mid.slice(0, 8)}…`;
        const tgts = r.targetGroupIds
          .map((id) => id.trim())
          .filter(Boolean)
          .map((id) => nameById.get(id) ?? `${id.slice(0, 8)}…`)
          .join(", ");
        return `${src} → ${tgts}`;
      });
    if (parts.length === 0) return "no group rules configured yet";
    return parts.join("; ");
  }, [examinerGroups, solveRuleRows]);

  const runSummariesForSubject = useMemo((): ExaminerSubjectRunSummary[] => {
    if (!lastRun || !selectedAllocation) return [];
    const rows = lastRun.examiner_subject_summaries.filter(
      (s) => s.subject_id === selectedAllocation.subject_id,
    );
    return [...rows].sort((a, b) => {
      if (b.assigned_booklets !== a.assigned_booklets) return b.assigned_booklets - a.assigned_booklets;
      return a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" });
    });
  }, [lastRun, selectedAllocation]);

  const assignmentRowsForSelectedExaminer = useMemo(() => {
    if (!lastRun || !assignmentDetailExaminer || !selectedAllocation) return [];
    return lastRun.assignments
      .filter(
        (a) =>
          a.examiner_id === assignmentDetailExaminer.examiner_id &&
          a.subject_id === selectedAllocation.subject_id &&
          a.paper_number === selectedAllocation.paper_number,
      )
      .sort((a, b) => {
        const schoolCmp = a.school_code.localeCompare(b.school_code, undefined, { sensitivity: "base" });
        if (schoolCmp !== 0) return schoolCmp;
        return a.envelope_number - b.envelope_number;
      });
  }, [lastRun, assignmentDetailExaminer, selectedAllocation]);

  const assignmentDetailBookletTotal = useMemo(
    () => assignmentRowsForSelectedExaminer.reduce((sum, r) => sum + r.booklet_count, 0),
    [assignmentRowsForSelectedExaminer],
  );

  const runSummariesAssignedTotal = useMemo(
    () => runSummariesForSubject.reduce((sum, r) => sum + r.assigned_booklets, 0),
    [runSummariesForSubject],
  );

  const manualAssignExaminerOptions = useMemo(
    () =>
      [...poolRows].sort((a, b) =>
        a.examiner_name.localeCompare(b.examiner_name, undefined, { sensitivity: "base" }),
      ).map((r) => ({
        value: r.examiner_id,
        label: `${r.examiner_name} (${examinerTypeLabel(r.examiner_type)})`,
      })),
    [poolRows],
  );

  const unassignedEnvelopesList = useMemo(
    () => lastRun?.unassigned_envelopes ?? [],
    [lastRun],
  );

  const unassignedRegionFilterOptions = useMemo(() => {
    const set = new Set(
      unassignedEnvelopesList.map((r) => (r.region ?? "").trim()).filter((s) => s.length > 0),
    );
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [unassignedEnvelopesList]);

  const unassignedZoneFilterOptions = useMemo(() => {
    let rows = unassignedEnvelopesList;
    if (unassignedFilterRegion) {
      rows = rows.filter((r) => (r.region ?? "") === unassignedFilterRegion);
    }
    const set = new Set(rows.map((r) => r.zone).filter((z) => z && String(z).trim().length > 0));
    return [...set].sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base" }));
  }, [unassignedEnvelopesList, unassignedFilterRegion]);

  const unassignedSeriesFilterOptions = useMemo(() => {
    let rows = unassignedEnvelopesList;
    if (unassignedFilterRegion) {
      rows = rows.filter((r) => (r.region ?? "") === unassignedFilterRegion);
    }
    if (unassignedFilterZone) {
      rows = rows.filter((r) => r.zone === unassignedFilterZone);
    }
    const set = new Set(rows.map((r) => r.series_number));
    return [...set].sort((a, b) => a - b);
  }, [unassignedEnvelopesList, unassignedFilterRegion, unassignedFilterZone]);

  const filteredUnassignedEnvelopes = useMemo(() => {
    return unassignedEnvelopesList.filter((row) => {
      if (unassignedFilterRegion && (row.region ?? "") !== unassignedFilterRegion) return false;
      if (unassignedFilterZone && row.zone !== unassignedFilterZone) return false;
      if (unassignedFilterSeries && String(row.series_number) !== unassignedFilterSeries) return false;
      return true;
    });
  }, [
    unassignedEnvelopesList,
    unassignedFilterRegion,
    unassignedFilterZone,
    unassignedFilterSeries,
  ]);

  const filteredRunSummariesForSubject = useMemo((): ExaminerSubjectRunSummary[] => {
    let rows = runSummariesForSubject;
    const q = examinerLoadsSearch.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => r.examiner_name.toLowerCase().includes(q));
    }
    if (examinerLoadsTypeFilter) {
      rows = rows.filter((r) => r.examiner_type === examinerLoadsTypeFilter);
    }
    return rows;
  }, [runSummariesForSubject, examinerLoadsSearch, examinerLoadsTypeFilter]);

  const examinerLoadsFiltersActive =
    examinerLoadsSearch.trim().length > 0 || examinerLoadsTypeFilter !== "";

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiJson<Examination[]>("/examinations");
        setExams(data);
      } catch {
        setExams([]);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setSubjects(await listAllSubjects());
      } catch {
        setSubjects([]);
      }
    })();
  }, []);

  useEffect(() => {
    setAllocationFormPdfCopies(1);
    setAllocationFormRowPdfCopies({});
  }, [lastRun?.id]);

  useEffect(() => {
    const rawExam = searchParams.get("exam");
    const rawSub = searchParams.get("subject");
    const rawPaper = searchParams.get("paper");
    if (rawExam != null && rawExam !== "") {
      const n = Number(rawExam);
      if (Number.isFinite(n)) setExamId(n);
    }
    if (rawSub != null && rawSub !== "") setDraftSubjectId(rawSub);
    if (rawPaper != null && rawPaper !== "") setDraftPaper(rawPaper);
  }, [searchParams]);

  function hydrateSolverStateFromAllocation(row: Allocation) {
    const rules = row.cross_marking_rules ?? {};
    const rows = Object.entries(rules)
      .filter(([k]) => isUuidString(String(k)))
      .map(([markingGroupId, targets]) => {
        const tgt = Array.isArray(targets)
          ? targets.map((t) => String(t).trim()).filter((x) => isUuidString(x))
          : [];
        return {
          rowKey: `saved-${String(markingGroupId).trim()}-${Math.random().toString(36).slice(2)}`,
          markingGroupId: String(markingGroupId).trim(),
          targetGroupIds: tgt,
        };
      });
    setFairnessWeight(String(row.fairness_weight ?? 0.25));
    setEnforceSingleSeries(row.enforce_single_series_per_examiner ?? true);
    setExcludeHomeScope(row.exclude_home_zone_or_region ?? true);
    setSolveMode(coerceSolveModeFromAllocation(row.solve_mode ?? undefined));
    setSolveRuleRows(rows);
  }

  const loadAllocationDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const alloc = await getAllocation(id);
      hydrateSolverStateFromAllocation(alloc);
      try {
        setExaminerGroups(await listExaminerGroups(alloc.examination_id));
      } catch {
        setExaminerGroups([]);
      }
      const [runList, qList, selected] = await Promise.all([
        listAllocationRuns(id),
        listScriptsAllocationQuotas(id),
        listAllocationExaminers(id),
      ]);
      setRuns(runList);
      setPoolRows(selected);
      setQuotaRows(
        qList.map((r) => ({
          rowKey: `${r.examiner_type}-${r.subject_id}`,
          examiner_type: r.examiner_type,
          subject_id: r.subject_id,
          quota_booklets: String(r.quota_booklets),
        })),
      );
      if (runList.length > 0) {
        const detail = await getAllocationRun(runList[0].id);
        setLastRun(detail);
      } else {
        setLastRun(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load allocation");
      setRuns([]);
      setPoolRows([]);
      setQuotaRows([]);
      setLastRun(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshExaminerGroups = useCallback(async (eid: number) => {
    try {
      setExaminerGroups(await listExaminerGroups(eid));
    } catch {
      setExaminerGroups([]);
    }
  }, []);

  const examinationIdForSetup = selectedAllocation?.examination_id ?? examId;

  const handleCreateExaminerGroupInSetup = useCallback(
    async (name: string, sourceRegions: string[]): Promise<string | null> => {
      const eid = examinationIdForSetup;
      if (eid == null) return "No examination selected.";
      try {
        await createExaminerGroup(eid, { name, source_regions: sourceRegions });
        await refreshExaminerGroups(eid);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Failed to create group";
      }
    },
    [examinationIdForSetup, refreshExaminerGroups],
  );

  const handleRefreshExaminerGroupsForSetup = useCallback(async () => {
    const eid = examinationIdForSetup;
    if (eid == null) throw new Error("No examination selected.");
    await refreshExaminerGroups(eid);
  }, [examinationIdForSetup, refreshExaminerGroups]);

  useEffect(() => {
    if (examId == null) {
      setExaminerGroups([]);
      return;
    }
    void refreshExaminerGroups(examId);
  }, [examId, refreshExaminerGroups]);

  useEffect(() => {
    if (!setupModalOpen || !sessionReady) return;
    const eid = examinationIdForSetup;
    if (eid == null) return;
    void refreshExaminerGroups(eid);
  }, [setupModalOpen, sessionReady, examinationIdForSetup, refreshExaminerGroups]);

  /** Hydrate session from `allocation` query (must match `exam`). */
  useEffect(() => {
    const rawAlloc = searchParams.get("allocation");
    const rawExam = searchParams.get("exam");
    if (!rawAlloc || rawExam == null || rawExam === "") return;
    const eid = Number(rawExam);
    if (!Number.isFinite(eid)) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await getAllocation(rawAlloc);
        if (cancelled) return;
        if (row.examination_id !== eid) {
          router.replace(scriptsAllocationHref({ exam: eid, allocationId: null }, linkOpts), { scroll: false });
          return;
        }
        setExamId(eid);
        setLockedCampaign(row);
        setAllocationId(row.id);
        setDraftSubjectId(String(row.subject_id));
        setDraftPaper(String(row.paper_number));
        hydrateSolverStateFromAllocation(row);
        void refreshExaminerGroups(eid);
      } catch {
        if (!cancelled) router.replace(scriptsAllocationHref({ exam: eid, allocationId: null }, linkOpts), { scroll: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router, linkOpts, refreshExaminerGroups]);

  useEffect(() => {
    if (sessionReady && allocationId) {
      void loadAllocationDetail(allocationId);
      hadSessionReadyRef.current = true;
      return;
    }
    if (hadSessionReadyRef.current && !sessionReady) {
      setRuns([]);
      setLastRun(null);
      setPoolRows([]);
      setQuotaRows([]);
      setPoolModalOpen(false);
      setSetupModalOpen(false);
      setAssignmentDetailExaminer(null);
      setUnassignedListModalOpen(false);
      setExaminerLoadsSearch("");
      setExaminerLoadsTypeFilter("");
      setExaminerGroups([]);
      hadSessionReadyRef.current = false;
    }
  }, [sessionReady, allocationId, loadAllocationDetail]);

  /**
   * Main and setup routes both render this component under Suspense. React may reuse the
   * same fiber when switching routes, so `setupModalOpen` can survive navigation. Always
   * clear the configure dialog when not on the setup-route variant, and reset the one-shot
   * ref so revisiting /setup can auto-open again.
   */
  useEffect(() => {
    if (!initialSetupOpen) {
      setSetupModalOpen(false);
      setupAutoOpenedRef.current = false;
    }
  }, [initialSetupOpen]);

  useEffect(() => {
    if (!initialSetupOpen || !sessionReady || setupAutoOpenedRef.current) return;
    setSetupModalOpen(true);
    setupAutoOpenedRef.current = true;
  }, [initialSetupOpen, sessionReady]);

  async function handleStart() {
    if (examId == null || !tripleOk) return;
    setBusy(true);
    setStartError(null);
    setLoadError(null);
    try {
      const row = await ensureAllocation({
        examination_id: examId,
        subject_id: draftSid,
        paper_number: Math.floor(draftPap),
      });
      setLockedCampaign(row);
      setAllocationId(row.id);
      hydrateSolverStateFromAllocation(row);
      router.replace(
        scriptsAllocationHref(
          {
            exam: examId,
            subjectId: draftSid,
            paper: Math.floor(draftPap),
            allocationId: row.id,
          },
          linkOpts,
        ),
        { scroll: false },
      );
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  }

  async function openImportModal() {
    if (!allocationId || !sessionReady) return;
    setImportModalOpen(true);
    setImportModalFilter("");
    setImportModalError(null);
    setModalSelection({});
    setModalCandidates([]);
    setModalLoading(true);
    try {
      const rows = await listAllocationExaminerImportCandidates(allocationId);
      setModalCandidates(rows);
    } catch (e) {
      setImportModalError(e instanceof Error ? e.message : "Failed to load eligible examiners");
    } finally {
      setModalLoading(false);
    }
  }

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    setImportModalFilter("");
    setImportModalError(null);
    setModalCandidates([]);
    setModalSelection({});
  }, []);

  const closePoolModal = useCallback(() => {
    setPoolModalOpen(false);
    setPoolModalFilter("");
  }, []);

  const closeAssignmentDetailModal = useCallback(() => {
    setAssignmentDetailExaminer(null);
  }, []);

  const closeManualAssignModal = useCallback(() => {
    setManualAssignTarget(null);
    setManualAssignExaminerId("");
    setManualAssignError(null);
  }, []);

  const openUnassignedListModal = useCallback(() => {
    setUnassignedFilterRegion("");
    setUnassignedFilterZone("");
    setUnassignedFilterSeries("");
    setUnassignedListModalOpen(true);
  }, []);

  const closeUnassignedListModal = useCallback(() => {
    setUnassignedListModalOpen(false);
    setUnassignedFilterRegion("");
    setUnassignedFilterZone("");
    setUnassignedFilterSeries("");
  }, []);

  function openManualAssign(row: UnassignedEnvelopeItem) {
    setManualAssignError(null);
    setManualAssignExaminerId("");
    setManualAssignTarget(row);
  }

  async function confirmManualAssign() {
    if (!lastRun || !manualAssignTarget || !manualAssignExaminerId) return;
    setBusy(true);
    setManualAssignError(null);
    try {
      const detail = await upsertAllocationRunAssignment(lastRun.id, {
        script_envelope_id: manualAssignTarget.script_envelope_id,
        examiner_id: manualAssignExaminerId,
      });
      setLastRun(detail);
      closeManualAssignModal();
    } catch (e) {
      setManualAssignError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveEnvelopeAssignment(scriptEnvelopeId: string) {
    if (!lastRun) return;
    if (!window.confirm("Remove this envelope assignment? It will return to the unassigned list.")) return;
    setBusy(true);
    setLoadError(null);
    try {
      const detail = await deleteAllocationRunAssignment(lastRun.id, scriptEnvelopeId);
      setLastRun(detail);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  function clampAllocationFormCopies(): number {
    return Math.min(
      SCRIPTS_ALLOCATION_FORM_MAX_COPIES,
      Math.max(1, Math.floor(Number(allocationFormPdfCopies)) || 1),
    );
  }

  async function handleDownloadAllocationFormPdf() {
    if (!lastRun || lastRun.assignments.length === 0) return;
    setAllocationFormPdfBusy(true);
    setLoadError(null);
    try {
      const copies = clampAllocationFormCopies();
      await downloadScriptsAllocationFormPdf(
        lastRun.id,
        { examinerId: null, copies },
        "scripts_allocation_forms_all.pdf",
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setAllocationFormPdfBusy(false);
    }
  }

  function clampRowAllocationFormCopies(examinerId: string): number {
    const raw = allocationFormRowPdfCopies[examinerId];
    return Math.min(
      SCRIPTS_ALLOCATION_ROW_PDF_MAX_COPIES,
      Math.max(1, Math.floor(Number(raw)) || 1),
    );
  }

  function setRowAllocationFormCopies(examinerId: string, value: number) {
    setAllocationFormRowPdfCopies((prev) => ({
      ...prev,
      [examinerId]: Math.min(
        SCRIPTS_ALLOCATION_ROW_PDF_MAX_COPIES,
        Math.max(1, Math.floor(Number(value)) || 1),
      ),
    }));
  }

  async function handleDownloadSingleExaminerFormPdf(examinerId: string, examinerName: string) {
    if (!lastRun || lastRun.assignments.length === 0) return;
    setAllocationFormPdfBusy(true);
    setLoadError(null);
    try {
      const copies = clampRowAllocationFormCopies(examinerId);
      const filename = `scripts_allocation_form_${sanitizeDownloadFilenamePart(examinerName)}.pdf`;
      await downloadScriptsAllocationFormPdf(lastRun.id, { examinerId, copies }, filename);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setAllocationFormPdfBusy(false);
    }
  }

  async function handleImportFromModal() {
    if (!allocationId || !sessionReady) return;
    const ids = Object.entries(modalSelection)
      .filter(([, picked]) => picked)
      .map(([id]) => id);
    if (ids.length === 0) return;
    setBusy(true);
    setLoadError(null);
    setImportModalError(null);
    try {
      await importAllocationExaminers(allocationId, ids);
      await loadAllocationDetail(allocationId);
      closeImportModal();
    } catch (e) {
      setImportModalError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const closeSetupModal = useCallback(() => {
    setSetupModalOpen(false);
    setQuotaSaveError(null);
  }, []);

  const openSetupModal = useCallback(() => {
    setSolveOptionsError(null);
    setQuotaSaveError(null);
    setSetupModalOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || busy) return;
      if (importModalOpen) {
        closeImportModal();
        return;
      }
      if (poolModalOpen) {
        closePoolModal();
        return;
      }
      if (manualAssignTarget) {
        closeManualAssignModal();
        return;
      }
      if (unassignedListModalOpen) {
        closeUnassignedListModal();
        return;
      }
      if (assignmentDetailExaminer) {
        closeAssignmentDetailModal();
        return;
      }
      if (setupModalOpen) {
        closeSetupModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    importModalOpen,
    poolModalOpen,
    manualAssignTarget,
    unassignedListModalOpen,
    assignmentDetailExaminer,
    setupModalOpen,
    busy,
    closeImportModal,
    closePoolModal,
    closeManualAssignModal,
    closeUnassignedListModal,
    closeAssignmentDetailModal,
    closeSetupModal,
  ]);

  async function handleRemoveExaminer(examinerId: string, examinerName: string) {
    if (!allocationId || !sessionReady) return;
    if (!window.confirm(`Remove ${examinerName} from this allocation?`)) return;
    setBusy(true);
    setLoadError(null);
    try {
      await removeAllocationExaminer(allocationId, examinerId);
      await loadAllocationDetail(allocationId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  function addQuotaRow() {
    if (!sessionReady || !selectedAllocation) return;
    setQuotaRows((prev) => [
      ...prev,
      {
        rowKey: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        examiner_type: "assistant_examiner",
        subject_id: selectedAllocation.subject_id,
        quota_booklets: "0",
      },
    ]);
  }

  async function handleSaveQuotas() {
    if (!allocationId || !sessionReady) return;
    const items: { examiner_type: ExaminerTypeApi; subject_id: number; quota_booklets: number }[] = [];
    for (const r of quotaRows) {
      const q = Number(r.quota_booklets);
      if (!Number.isFinite(q) || q < 0) {
        setQuotaSaveError("Each quota must be a non-negative number");
        return;
      }
      if (!Number.isFinite(r.subject_id) || r.subject_id <= 0) {
        setQuotaSaveError("Each quota row must include a valid subject.");
        return;
      }
      items.push({ examiner_type: r.examiner_type, subject_id: r.subject_id, quota_booklets: Math.floor(q) });
    }
    setBusy(true);
    setQuotaSaveError(null);
    setLoadError(null);
    try {
      await replaceScriptsAllocationQuotas(allocationId, { items });
      await loadAllocationDetail(allocationId);
    } catch (e) {
      setQuotaSaveError(e instanceof Error ? e.message : "Save quotas failed");
    } finally {
      setBusy(false);
    }
  }

  function addRuleRow() {
    setSolveRuleRows((prev) => [
      ...prev,
      { rowKey: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`, markingGroupId: "", targetGroupIds: [] },
    ]);
  }

  function removeRuleRow(rowKey: string) {
    setSolveRuleRows((prev) => prev.filter((row) => row.rowKey !== rowKey));
  }

  function removeRuleTarget(rowKey: string, targetGroupId: string) {
    setSolveRuleRows((prev) =>
      prev.map((row) =>
        row.rowKey === rowKey
          ? { ...row, targetGroupIds: row.targetGroupIds.filter((x) => x !== targetGroupId) }
          : row,
      ),
    );
  }

  function toggleRuleTarget(rowKey: string, targetGroupId: string, checked: boolean) {
    setSolveRuleRows((prev) =>
      prev.map((row) => {
        if (row.rowKey !== rowKey) return row;
        if (checked) {
          return row.targetGroupIds.includes(targetGroupId)
            ? row
            : { ...row, targetGroupIds: [...row.targetGroupIds, targetGroupId] };
        }
        return { ...row, targetGroupIds: row.targetGroupIds.filter((t) => t !== targetGroupId) };
      }),
    );
  }

  async function persistAllocationSettingsToServer(): Promise<boolean> {
    if (!allocationId || !sessionReady) return false;
    const fair = Number(fairnessWeight);
    if (!Number.isFinite(fair) || fair < 0) {
      setSolveOptionsError("Fairness weight must be a non-negative number.");
      return false;
    }
    const crossRules = buildCrossMarkingRules();
    if (crossRules == null) return false;
    setSolveOptionsError(null);
    try {
      const updated = await updateAllocation(allocationId, {
        allocation_scope: "region",
        cross_marking_rules: crossRules,
        fairness_weight: fair,
        enforce_single_series_per_examiner: enforceSingleSeries,
        exclude_home_zone_or_region: excludeHomeScope,
        solve_mode: solveMode,
      });
      setLockedCampaign(updated);
      return true;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to save allocation settings");
      return false;
    }
  }

  async function saveSolverSettings() {
    if (!allocationId || !sessionReady) return;
    setBusy(true);
    setLoadError(null);
    setSolverSettingsSavedMessage(null);
    try {
      const ok = await persistAllocationSettingsToServer();
      if (ok) {
        setSolverSettingsSavedMessage("Solver settings and cross-marking rules are saved on this allocation.");
        window.setTimeout(() => setSolverSettingsSavedMessage(null), 6000);
      }
    } finally {
      setBusy(false);
    }
  }

  function buildCrossMarkingRules(): Record<string, string[]> | null {
    const gid = new Set(examinerGroups.map((g) => g.id));
    const out: Record<string, string[]> = {};
    const seenMarking = new Set<string>();
    for (const row of solveRuleRows) {
      const marking = row.markingGroupId.trim();
      const targets = row.targetGroupIds.map((t) => t.trim()).filter(Boolean);
      if (!marking && targets.length === 0) continue;
      if (!marking || targets.length === 0) {
        setSolveOptionsError("Each mapping row must have a marking group and at least one script cohort group.");
        return null;
      }
      if (!isUuidString(marking)) {
        setSolveOptionsError(`Invalid marking group id: ${marking}`);
        return null;
      }
      if (seenMarking.has(marking)) {
        setSolveOptionsError("Duplicate marking group in rules; each marking group may only appear once.");
        return null;
      }
      seenMarking.add(marking);
      if (!gid.has(marking)) {
        setSolveOptionsError(`Unknown marking group (refresh groups from roster): ${marking}`);
        return null;
      }
      for (const t of targets) {
        if (!isUuidString(t)) {
          setSolveOptionsError(`Invalid target group id: ${t}`);
          return null;
        }
        if (!gid.has(t)) {
          setSolveOptionsError(`Unknown script cohort group: ${t}`);
          return null;
        }
      }
      out[marking] = targets;
    }
    if (Object.keys(out).length === 0) {
      setSolveOptionsError(
        "Add at least one cross-marking row: pick a marking group and one or more allowed script cohort groups (then Save solver settings or run solve).",
      );
      return null;
    }
    return out;
  }

  async function handleSolve() {
    if (!allocationId || !sessionReady || poolRows.length === 0) return;
    const saved = await persistAllocationSettingsToServer();
    if (!saved) return;
    const fair = Number(fairnessWeight);
    setBusy(true);
    setLoadError(null);
    try {
      const rowOrder = solveRuleRows.map((r) => r.markingGroupId.trim()).filter((s) => s.length > 0);
      const payload: AllocationSolvePayload = {
        unassigned_penalty: 1.0,
        time_limit_sec: 120,
        allocation_scope: "region",
        fairness_weight: fair,
        enforce_single_series_per_examiner: enforceSingleSeries,
        exclude_home_zone_or_region: excludeHomeScope,
        cross_marking_rules: null,
        solve_mode: solveMode,
        ...(solveMode === "decomposed" && rowOrder.length > 0 ? { marking_group_solve_order: rowOrder } : {}),
      };
      const detail = await solveAllocation(allocationId, payload);
      setLastRun(detail);
      await loadAllocationDetail(allocationId);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Solve failed");
    } finally {
      setBusy(false);
    }
  }

  function onExamChange(next: string) {
    setLockedCampaign(null);
    setAllocationId(null);
    setDraftSubjectId("");
    setDraftPaper("");
    setRuns([]);
    setLastRun(null);
    setPoolRows([]);
    setQuotaRows([]);
    setPoolModalOpen(false);
    setSetupModalOpen(false);
    setAssignmentDetailExaminer(null);
    setExaminerLoadsSearch("");
    setExaminerLoadsTypeFilter("");
    setUnassignedListModalOpen(false);
    setStartError(null);
    setFairnessWeight("0.25");
    setEnforceSingleSeries(true);
    setExcludeHomeScope(true);
    setSolveRuleRows([]);
    setSolveOptionsError(null);
    setSolveMode("monolithic");
    setExaminerGroups([]);
    if (!next) {
      setExamId(null);
      router.replace(scriptsAllocationHref({ exam: null, allocationId: null }, linkOpts), { scroll: false });
      return;
    }
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    setExamId(n);
    router.replace(scriptsAllocationHref({ exam: n, allocationId: null }, linkOpts), { scroll: false });
  }

  function onDraftSubjectChange(v: string) {
    setDraftSubjectId(v);
  }

  function onDraftPaperChange(v: string) {
    setDraftPaper(v);
  }

  const examinersManageHref =
    examId != null
      ? `/dashboard/admin/allocation-examiners?exam=${examId}`
      : "/dashboard/admin/allocation-examiners";

  const mainAllocationHrefFromSetup =
    examId != null && sessionReady && allocationId != null && tripleOk
      ? scriptsAllocationHref(
          {
            exam: examId,
            subjectId: draftSid,
            paper: Math.floor(draftPap),
            allocationId,
          },
          { setup: false },
        )
      : null;

  return (
    <div className="space-y-10 p-4 md:p-6">
      <header className="border-b border-border/80 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Scripts allocation</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Open a campaign for one exam, subject, and paper. Configure the pool and solver in one place, then review results
          below.
        </p>
      </header>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{loadError}</p>
      ) : null}

      {startError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{startError}</p>
      ) : null}

      <section
        className={`rounded-2xl border bg-card p-5 shadow-sm md:p-6 ${
          sessionReady ? "border-primary/30 ring-1 ring-primary/10" : "border-border"
        }`}
        aria-labelledby="open-allocation-heading"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="open-allocation-heading" className="text-base font-semibold tracking-tight text-card-foreground">
              Open an allocation
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Two steps: pick the examination, then subject and paper. Starting locks in that campaign for this page.
            </p>
          </div>
          {sessionReady ? (
            <Badge variant="secondary" className="w-fit shrink-0">
              Session active
            </Badge>
          ) : null}
        </div>

        <ol className="relative mt-6 grid gap-4 md:gap-5">
          <li className="relative rounded-xl border border-border/90 bg-muted/15 p-4 md:p-5">
            <div className="flex gap-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-2 ring-card ${
                  examId != null
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-hidden
              >
                1
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Examination</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Search or pick from the list.</p>
                </div>
                <SearchableCombobox
                  options={examOptions}
                  value={examId != null ? String(examId) : ""}
                  onChange={onExamChange}
                  placeholder="Choose examination…"
                  searchPlaceholder="Search examination…"
                  widthClass="min-w-0 w-full max-w-xl"
                  showAllOption
                  allOptionLabel="Choose examination…"
                  emptyText={exams.length ? "No match." : "No examinations loaded."}
                />
              </div>
            </div>
          </li>

          <li
            className={`rounded-xl border p-4 transition-colors md:p-5 ${
              examId == null
                ? "border-dashed border-border/80 bg-muted/5 opacity-70"
                : sessionReady
                  ? "border-primary/25 bg-primary/5"
                  : "border-border/90 bg-muted/15"
            }`}
          >
            <div className="flex gap-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-sm ring-2 ring-card ${
                  examId == null
                    ? "bg-muted text-muted-foreground"
                    : sessionReady
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                }`}
                aria-hidden
              >
                2
              </span>
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Subject, paper, and start</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Same exam + subject + paper always reopens the same campaign. A new solve replaces the latest run only.
                  </p>
                </div>

                {examId != null ? (
                  <>
                    <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                      <div className="min-w-0 flex-1 lg:max-w-md">
                        <p className={formLabelClass} id="draft-subject-label">
                          Subject
                        </p>
                        <div className="mt-1">
                          <SearchableCombobox
                            options={subjectOptions}
                            value={draftSubjectId}
                            onChange={onDraftSubjectChange}
                            placeholder="Select subject…"
                            searchPlaceholder="Search subject…"
                            widthClass="min-w-0 w-full"
                            showAllOption={false}
                          />
                        </div>
                      </div>
                      <div className="w-full lg:w-auto">
                        <label className={formLabelClass} htmlFor="draft-paper">
                          Paper
                        </label>
                        <select
                          id="draft-paper"
                          className={`${formInputClass} mt-1 w-full min-w-36 lg:max-w-44`}
                          value={draftPaper}
                          onChange={(e) => onDraftPaperChange(e.target.value)}
                          aria-describedby="allocation-start-hint"
                        >
                          <option value="">Select paper…</option>
                          <option value="1">Paper 1</option>
                          <option value="2">Paper 2</option>
                        </select>
                      </div>
                      <Button
                        type="button"
                        className="w-full lg:w-auto lg:shrink-0"
                        disabled={busy || !tripleOk || sessionReady}
                        onClick={() => void handleStart()}
                        aria-describedby="allocation-start-hint"
                        title={
                          sessionReady
                            ? "Allocation is already open for this examination, subject, and paper"
                            : undefined
                        }
                      >
                        {busy ? "Starting…" : "Start allocation"}
                      </Button>
                    </div>

                    <div id="allocation-start-hint" className="space-y-2">
                      {(() => {
                        if (!tripleOk) {
                          return (
                            <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                              Select a subject and paper (1 or 2), then press <strong className="text-foreground">Start allocation</strong>.
                            </div>
                          );
                        }
                        if (sessionReady) {
                          return (
                            <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between">
                              <span className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">Ready</Badge>
                                <span>
                                  <span className="font-medium text-foreground">{draftSubjectLabel || "This subject"}</span>
                                  , paper {Math.floor(draftPap)}. Use the <strong className="text-foreground">Run allocation</strong>{" "}
                                  section next.
                                </span>
                              </span>
                              <span className="text-muted-foreground sm:text-right">
                                Change subject or paper above, then start again to switch campaigns.
                              </span>
                            </div>
                          );
                        }
                        if (lockedCampaign) {
                          return (
                            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs text-amber-950 dark:text-amber-50">
                              <p className="font-semibold text-amber-950 dark:text-amber-50">Subject or paper changed</p>
                              <p className="mt-1.5 leading-relaxed text-amber-900/95 dark:text-amber-100/90">
                                You had started with{" "}
                                <span className="font-medium">
                                  {lockedSubjectLabel} · Paper {lockedCampaign.paper_number}
                                </span>
                                . The fields above differ. Press <strong>Start allocation</strong> for the new selection, or
                                switch back to{" "}
                                <span className="font-medium">{lockedSubjectLabel}</span> · paper{" "}
                                <strong>{lockedCampaign.paper_number}</strong>.
                              </p>
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-lg border border-border/80 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                            No campaign loaded for{" "}
                            <span className="font-medium text-foreground">
                              {draftSubjectLabel || `subject #${draftSid}`}
                            </span>
                            , paper {Math.floor(draftPap)}. Press <strong className="text-foreground">Start allocation</strong>.
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Choose an examination in step 1 to enable subject, paper, and start.
                  </p>
                )}
              </div>
            </div>
          </li>
        </ol>
      </section>

      {sessionReady && selectedAllocation ? (
        <section className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 pb-4">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight text-card-foreground">Run allocation</h2>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                Review the snapshot, use Configure allocation to change pool and solver rules, then run the solver. Results
                follow in the next block.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href={examinersManageHref}>Exam roster</Link>
              </Button>
              {useSetupPath && mainAllocationHrefFromSetup ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href={mainAllocationHrefFromSetup}>Main allocation page</Link>
                </Button>
              ) : null}
            </div>
          </div>

          {detailLoading ? (
            <p className="rounded-lg border border-border/80 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              Loading allocation details…
            </p>
          ) : null}

          <div className="space-y-3 rounded-xl border border-border/90 bg-muted/15 p-4 md:p-5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Pool:</span>{" "}
              {poolRows.length === 0 ? "none yet" : `${poolRows.length} examiner${poolRows.length === 1 ? "" : "s"}`}
              {" · "}
              <span className="font-medium text-foreground">Cross-marking:</span>{" "}
              <span className="wrap-break-word">{crossMarkingSummaryText}</span>
              {" · "}
              <span className="font-medium text-foreground">Fairness:</span> {fairnessWeight}
              {" · "}
              <span className="font-medium text-foreground">Quotas:</span>{" "}
              {quotaRows.length === 0 ? "none" : `${quotaRows.length} row${quotaRows.length === 1 ? "" : "s"}`}
              {" · "}
              <span className="font-medium text-foreground">Mappings:</span>{" "}
              {crossMarkingSourceCount === 0 ? "none" : `${crossMarkingSourceCount} source${crossMarkingSourceCount === 1 ? "" : "s"}`}
              {" · "}
              <span className="font-medium text-foreground">Single series:</span> {enforceSingleSeries ? "on" : "off"}
              {" · "}
              <span className="font-medium text-foreground">Exclude home:</span> {excludeHomeScope ? "on" : "off"}
              {" · "}
              <span className="font-medium text-foreground">Solve:</span> {summarizeSolveMode(solveMode)}
            </p>
            <p className="max-w-3xl text-xs text-muted-foreground">
              Use <strong>Configure allocation</strong> to import examiners, edit quotas, cross-marking rules, and{" "}
              <strong>solve strategy</strong>. <strong>Run MILP solve</strong> assigns whole envelopes (often under two
              minutes).
            </p>
            {solveOptionsError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {solveOptionsError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={openSetupModal}>
                Configure allocation…
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || poolRows.length === 0}
                onClick={() => void handleSolve()}
              >
                Run MILP solve
              </Button>
            </div>
          </div>

          {importModalOpen ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closeImportModal();
              }}
            >
              <div
                className="flex max-h-[min(92vh,800px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-examiners-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border p-4">
                  <h2 id="import-examiners-title" className="text-base font-semibold text-card-foreground">
                    Import examiners
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select examiners who are already on this examination and mapped to this allocation subject. Already
                    imported names are not shown.
                  </p>
                  {importModalError ? (
                    <p className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {importModalError}
                    </p>
                  ) : null}
                  {!modalLoading && modalCandidates.length > 0 ? (
                    <div className="mt-3">
                      <label className={formLabelClass} htmlFor="import-examiner-filter">
                        Filter by name
                      </label>
                      <input
                        id="import-examiner-filter"
                        type="search"
                        className={`${formInputClass} mt-1 w-full max-w-md`}
                        value={importModalFilter}
                        onChange={(e) => setImportModalFilter(e.target.value)}
                        placeholder="Search…"
                        autoComplete="off"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  {modalLoading ? (
                    <p className="text-sm text-muted-foreground">Loading eligible examiners…</p>
                  ) : modalCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No eligible examiners left to import.</p>
                  ) : importCandidatesFiltered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No names match your search.</p>
                  ) : (
                    <div className="max-h-[min(60vh,520px)] overflow-auto rounded-md border border-border">
                      <table className="w-full min-w-[720px] border-collapse text-sm">
                        <thead>
                          <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <th className="w-10 px-2 py-2.5 pl-3" scope="col">
                              <span className="sr-only">Select</span>
                            </th>
                            <th className="px-3 py-2.5 pr-4">Name</th>
                            <th className="px-3 py-2.5 pr-4">Type</th>
                            <th className="px-3 py-2.5 pr-3">Region / zone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importCandidatesFiltered.map((c) => (
                            <tr
                              key={c.examiner_id}
                              className="border-b border-border/80 align-top hover:bg-muted/20"
                            >
                              <td className="px-2 py-2 pl-3 align-middle">
                                <input
                                  type="checkbox"
                                  className={inputFocusRing}
                                  checked={Boolean(modalSelection[c.examiner_id])}
                                  onChange={(e) =>
                                    setModalSelection((prev) => ({ ...prev, [c.examiner_id]: e.target.checked }))
                                  }
                                  aria-label={`Select ${c.examiner_name}`}
                                />
                              </td>
                              <td className="px-3 py-2.5 font-medium text-foreground">{c.examiner_name}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{examinerTypeLabel(c.examiner_type)}</td>
                              <td className="max-w-xs px-3 py-2.5 text-muted-foreground">
                                {examinerHomeCell(c.region)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || modalLoading || importCandidatesFiltered.length === 0}
                      onClick={() => {
                        setModalSelection((prev) => {
                          const next = { ...prev };
                          for (const c of importCandidatesFiltered) next[c.examiner_id] = true;
                          return next;
                        });
                      }}
                    >
                      Select visible
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || modalLoading || modalCandidates.length === 0}
                      onClick={() => setModalSelection({})}
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" disabled={busy} onClick={closeImportModal}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={
                        busy ||
                        modalLoading ||
                        !Object.values(modalSelection).some(Boolean)
                      }
                      onClick={() => void handleImportFromModal()}
                    >
                      Import selected
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {poolModalOpen ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closePoolModal();
              }}
            >
              <div
                className="flex max-h-[min(92vh,800px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pool-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border p-4">
                  <h2 id="pool-modal-title" className="text-base font-semibold text-card-foreground">
                    Imported examiners
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Remove people from this allocation pool only. The exam roster is unchanged.
                  </p>
                  <div className="mt-3">
                    <label className={formLabelClass} htmlFor="pool-examiner-filter">
                      Filter by name
                    </label>
                    <input
                      id="pool-examiner-filter"
                      type="search"
                      className={`${formInputClass} mt-1 w-full max-w-md`}
                      value={poolModalFilter}
                      onChange={(e) => setPoolModalFilter(e.target.value)}
                      placeholder="Search…"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  {poolRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No examiners in this pool yet. Use Import to add some.</p>
                  ) : poolRowsFiltered.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No names match your search.</p>
                  ) : (
                    <div className="max-h-[min(60vh,520px)] overflow-auto rounded-md border border-border">
                      <table className="w-full min-w-[640px] border-collapse text-sm">
                        <thead>
                          <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2.5 pr-4">Name</th>
                            <th className="px-3 py-2.5 pr-4">Type</th>
                            <th className="px-3 py-2.5 pr-4">Region / zone</th>
                            <th className="px-3 py-2.5 text-right"> </th>
                          </tr>
                        </thead>
                        <tbody>
                          {poolRowsFiltered.map((p) => (
                            <tr key={p.examiner_id} className="border-b border-border/80 align-top hover:bg-muted/20">
                              <td className="px-3 py-2.5 font-medium text-foreground">{p.examiner_name}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{examinerTypeLabel(p.examiner_type)}</td>
                              <td className="max-w-[240px] px-3 py-2.5 text-muted-foreground">
                                {examinerHomeCell(p.region)}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  className={`text-destructive underline-offset-2 hover:underline ${inputFocusRing}`}
                                  disabled={busy}
                                  onClick={() => void handleRemoveExaminer(p.examiner_id, p.examiner_name)}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
                  <Button type="button" variant="outline" disabled={busy} onClick={closePoolModal}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <AllocationSetupDialog
            open={setupModalOpen}
            onClose={closeSetupModal}
            busy={busy}
            sessionReady={sessionReady}
            subjects={subjects}
            subjectOptions={subjectOptions}
            poolRowCount={poolRows.length}
            onOpenImport={() => void openImportModal()}
            onOpenPool={() => setPoolModalOpen(true)}
            quotaRows={quotaRows}
            setQuotaRows={setQuotaRows}
            quotaError={quotaSaveError}
            onSaveQuotas={() => void handleSaveQuotas()}
            onAddQuotaRow={addQuotaRow}
            examinerGroups={examinerGroups}
            fairnessWeight={fairnessWeight}
            setFairnessWeight={setFairnessWeight}
            enforceSingleSeries={enforceSingleSeries}
            setEnforceSingleSeries={setEnforceSingleSeries}
            excludeHomeScope={excludeHomeScope}
            setExcludeHomeScope={setExcludeHomeScope}
            solveMode={solveMode}
            setSolveMode={setSolveMode}
            solveOptionsError={solveOptionsError}
            solveRuleRows={solveRuleRows}
            setSolveRuleRows={setSolveRuleRows}
            ruleMarkingGroupsFullyAllocated={ruleMarkingGroupsFullyAllocated}
            onAddRuleRow={addRuleRow}
            onRemoveRuleRow={removeRuleRow}
            onRemoveRuleTarget={removeRuleTarget}
            onToggleRuleTarget={toggleRuleTarget}
            onSaveSolverSettings={() => void saveSolverSettings()}
            solverSettingsSavedMessage={solverSettingsSavedMessage}
            examinationId={examinationIdForSetup}
            onCreateExaminerGroup={handleCreateExaminerGroupInSetup}
            onRefreshExaminerGroups={handleRefreshExaminerGroupsForSetup}
          />

          {!detailLoading ? (
            <div className="mt-6 space-y-5 border-t border-border pt-6">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-card-foreground">Solver results</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedSubjectLabel} · Paper {selectedAllocation.paper_number}.
                </p>
              </div>

              {runs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">No solver runs yet</p>
                  <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
                    Add examiners, set quotas if needed, then run MILP solve. Results and booklet loads will show here.
                  </p>
                </div>
              ) : lastRun && runs[0]?.id === lastRun.id ? (
                <div className="space-y-5">
                  <div className="rounded-xl border border-border bg-linear-to-b from-muted/50 to-card p-4 shadow-sm md:p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest run</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/80 bg-card px-3 py-3 shadow-sm">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Time</p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {formatRunTimestamp(lastRun.created_at)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-card px-3 py-3 shadow-sm">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                        <div className="mt-1.5">
                          <RunStatusBadge status={lastRun.status} />
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-card px-3 py-3 shadow-sm">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Objective</p>
                        <p className="mt-1 text-sm font-medium tabular-nums text-foreground">
                          {lastRun.objective_value != null ? lastRun.objective_value : "—"}
                        </p>
                      </div>
                    </div>
                    {lastRun.solve_mode === "decomposed" && lastRun.subgroups && lastRun.subgroups.length > 0 ? (
                      <div className="mt-4 rounded-lg border border-border bg-muted/20 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Decomposed sub-solves
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {lastRun.subgroups.filter((s) => s.status === "optimal").length} optimal ·{" "}
                          {lastRun.subgroups.filter((s) => s.status === "stopped_feasible").length} feasible
                          (time limit) · {lastRun.subgroups.filter((s) => s.status === "skipped_empty").length}{" "}
                          skipped · {lastRun.subgroups.length} total stages
                        </p>
                        <div className="mt-2 max-h-52 overflow-auto rounded-md border border-border/80 bg-card text-xs">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b border-border bg-muted/50 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                <th className="px-2 py-1.5">Marking group</th>
                                <th className="px-2 py-1.5">Series</th>
                                <th className="px-2 py-1.5">Status</th>
                                <th className="px-2 py-1.5 text-right">Limit s</th>
                                <th className="px-2 py-1.5 text-right">Obj.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lastRun.subgroups.map((sg, idx) => (
                                <tr key={`${sg.marking_group_id}-${sg.series_number}-${idx}`} className="border-b border-border/60">
                                  <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[10px]" title={sg.marking_group_id}>
                                    {sg.marking_group_id.slice(0, 8)}…
                                  </td>
                                  <td className="px-2 py-1.5 tabular-nums">{sg.series_number}</td>
                                  <td className="px-2 py-1.5">{subgroupStatusLabel(sg.status)}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {sg.time_limit_allocated_sec != null ? sg.time_limit_allocated_sec.toFixed(1) : "—"}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">
                                    {sg.objective_value != null ? sg.objective_value.toFixed(2) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : null}
                    {lastRun.solver_message ? (
                      <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                        {lastRun.solver_message}
                      </p>
                    ) : null}
                    {lastRun.unassigned_envelope_ids.length > 0 ? (
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                        <div className="min-w-0 flex-1 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100">
                          <span className="font-semibold">{lastRun.unassigned_envelope_ids.length}</span> envelope
                          {lastRun.unassigned_envelope_ids.length === 1 ? "" : "s"} still unassigned for this subject and
                          paper. Manual assignments apply to the latest run only.
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full shrink-0 sm:w-auto"
                          disabled={busy}
                          onClick={openUnassignedListModal}
                        >
                          View unassigned envelopes…
                        </Button>
                      </div>
                    ) : lastRun.status === "optimal" || lastRun.assignments.length > 0 ? (
                      <p className="mt-4 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                        All non-empty envelopes are assigned.
                      </p>
                    ) : null}
                  </div>

                  {lastRun.assignments.length > 0 ? (
                    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
                      <p className="text-sm font-semibold text-foreground">Allocation forms (PDF) — all examiners</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Merged PDF for all examiners.
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="w-full sm:w-28">
                          <label htmlFor="allocation-form-copies-all" className={formLabelClass}>
                            Copies per examiner
                          </label>
                          <input
                            id="allocation-form-copies-all"
                            type="number"
                            min={1}
                            max={SCRIPTS_ALLOCATION_FORM_MAX_COPIES}
                            className={`${formInputClass} mt-1 w-full tabular-nums`}
                            value={allocationFormPdfCopies}
                            onChange={(e) => setAllocationFormPdfCopies(Number(e.target.value))}
                            disabled={allocationFormPdfBusy}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          disabled={allocationFormPdfBusy}
                          onClick={() => void handleDownloadAllocationFormPdf()}
                        >
                          {allocationFormPdfBusy ? "Preparing PDF…" : "Download all allocation forms (PDF)"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <p className="text-sm font-semibold text-foreground">Examiner booklet loads</p>
                      {runSummariesForSubject.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Total assigned:{" "}
                          <span className="font-medium tabular-nums text-foreground">{runSummariesAssignedTotal}</span>{" "}
                          booklets
                          {examinerLoadsFiltersActive && runSummariesForSubject.length > 0 ? (
                            <>
                              {" "}
                              · Showing{" "}
                              <span className="font-medium tabular-nums text-foreground">
                                {filteredRunSummariesForSubject.length}
                              </span>{" "}
                              of {runSummariesForSubject.length}
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    {runSummariesForSubject.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                        <div className="min-w-0 flex-1 sm:max-w-xs">
                          <label htmlFor="examiner-loads-search" className={formLabelClass}>
                            Search examiner
                          </label>
                          <input
                            id="examiner-loads-search"
                            type="search"
                            autoComplete="off"
                            placeholder="Name…"
                            className={`${formInputClass} mt-1 w-full`}
                            value={examinerLoadsSearch}
                            onChange={(e) => setExaminerLoadsSearch(e.target.value)}
                          />
                        </div>
                        <div className="w-full sm:w-auto">
                          <label htmlFor="examiner-loads-type" className={formLabelClass}>
                            Examiner type
                          </label>
                          <select
                            id="examiner-loads-type"
                            className={`${formInputClass} mt-1 w-full min-w-40 sm:max-w-52`}
                            value={examinerLoadsTypeFilter}
                            onChange={(e) =>
                              setExaminerLoadsTypeFilter((e.target.value || "") as ExaminerTypeApi | "")
                            }
                          >
                            <option value="">All types</option>
                            <option value="chief_examiner">Chief</option>
                            <option value="assistant_examiner">Assistant</option>
                            <option value="team_leader">Team leader</option>
                          </select>
                        </div>
                      </div>
                    ) : null}
                    {runSummariesForSubject.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                        No examiner rows for this subject on this run.
                      </p>
                    ) : filteredRunSummariesForSubject.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-border/80 bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">
                        No examiners match the current search or type filter.
                      </p>
                    ) : (
                      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                        <div className="max-h-[min(22rem,50vh)] overflow-auto">
                          <table className="w-full min-w-[660px] border-collapse text-sm leading-normal">
                            <thead>
                              <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 backdrop-blur-sm">
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  Examiner
                                </th>
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  Type
                                </th>
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  Assigned
                                </th>
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  Quota
                                </th>
                                <th
                                  scope="col"
                                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                  Δ vs quota
                                </th>
                                {lastRun.assignments.length > 0 ? (
                                  <th
                                    scope="col"
                                    className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                  >
                                    Actions
                                  </th>
                                ) : null}
                              </tr>
                            </thead>
                            <tbody className="[&_tr:nth-child(even)]:bg-muted/25">
                              {filteredRunSummariesForSubject.map((row) => (
                                <tr
                                  key={`${row.examiner_id}-${row.subject_id}`}
                                  className="cursor-pointer border-b border-border/70 align-top transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setAssignmentDetailExaminer(row)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setAssignmentDetailExaminer(row);
                                    }
                                  }}
                                  aria-label={`View assigned envelopes for ${row.examiner_name}`}
                                  title={`View assigned envelopes for ${row.examiner_name}`}
                                >
                                  <td className="px-3 py-2 font-medium text-foreground">{row.examiner_name}</td>
                                  <td className="px-3 py-2 text-muted-foreground">
                                    {examinerTypeLabel(row.examiner_type)}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                    {row.assigned_booklets}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {row.quota_booklets != null ? row.quota_booklets : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                                    {row.deviation != null ? row.deviation : "—"}
                                  </td>
                                  {lastRun.assignments.length > 0 ? (
                                    <td
                                      className="px-3 py-2 text-right align-middle"
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                        <div className="w-14 shrink-0">
                                          <label
                                            htmlFor={`row-allocation-pdf-copies-${row.examiner_id}`}
                                            className={`${formLabelClass} sr-only`}
                                          >
                                            Copies for {row.examiner_name}
                                          </label>
                                          <input
                                            id={`row-allocation-pdf-copies-${row.examiner_id}`}
                                            type="number"
                                            min={1}
                                            max={SCRIPTS_ALLOCATION_ROW_PDF_MAX_COPIES}
                                            className="mt-0 box-border h-7 w-full min-h-0 min-w-0 rounded-md border border-input-border bg-input px-1.5 py-0.5 text-center text-xs tabular-nums leading-tight text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring/30"
                                            value={clampRowAllocationFormCopies(row.examiner_id)}
                                            onChange={(e) =>
                                              setRowAllocationFormCopies(row.examiner_id, Number(e.target.value))
                                            }
                                            disabled={allocationFormPdfBusy || row.assigned_booklets === 0}
                                            aria-label={`Number of form copies for ${row.examiner_name}`}
                                          />
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 shrink-0 gap-1.5 px-2.5 text-xs tabular-nums"
                                          disabled={
                                            allocationFormPdfBusy || row.assigned_booklets === 0
                                          }
                                          title={
                                            row.assigned_booklets === 0
                                              ? "No script assignments for this examiner on this run"
                                              : "Download this examiner’s allocation form PDF"
                                          }
                                          aria-label={`Download scripts allocation form PDF for ${row.examiner_name}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleDownloadSingleExaminerFormPdf(
                                              row.examiner_id,
                                              row.examiner_name,
                                            );
                                          }}
                                        >
                                          <FileDown className="size-4 shrink-0" aria-hidden />
                                          PDF
                                        </Button>
                                      </div>
                                    </td>
                                  ) : null}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {runs.length > 1 ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                      <p className="border-b border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Earlier runs
                      </p>
                      <ul className="divide-y divide-border">
                        {runs.slice(1).map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                            <span className="font-medium text-foreground">{formatRunTimestamp(r.created_at)}</span>
                            <RunStatusBadge status={r.status} />
                            {r.objective_value != null ? (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                Objective {r.objective_value}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">Run history</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Detailed examiner breakdown appears when the latest run is loaded.
                    </p>
                  </div>
                  <ul className="divide-y divide-border">
                    {runs.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
                        <span className="font-medium text-foreground">{formatRunTimestamp(r.created_at)}</span>
                        <RunStatusBadge status={r.status} />
                        {r.objective_value != null ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            Objective {r.objective_value}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}

          {assignmentDetailExaminer ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closeAssignmentDetailModal();
              }}
            >
              <div
                className="flex max-h-[min(92vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="assignment-detail-modal-title"
                aria-describedby="assignment-detail-modal-desc"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border bg-muted/20 px-4 py-4 md:px-5">
                  <h2 id="assignment-detail-modal-title" className="text-base font-semibold text-card-foreground">
                    {assignmentDetailExaminer.examiner_name}
                  </h2>
                  <p id="assignment-detail-modal-desc" className="mt-1 text-xs text-muted-foreground">
                    {selectedSubjectLabel} · Paper {selectedAllocation.paper_number} · Assigned envelopes
                  </p>
                  {assignmentRowsForSelectedExaminer.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{assignmentRowsForSelectedExaminer.length}</span>{" "}
                      envelope line{assignmentRowsForSelectedExaminer.length === 1 ? "" : "s"} ·{" "}
                      <span className="font-medium tabular-nums text-foreground">{assignmentDetailBookletTotal}</span>{" "}
                      booklets total
                    </p>
                  ) : null}
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
                  {assignmentRowsForSelectedExaminer.length === 0 ? (
                    <p className="rounded-lg border border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      No assigned envelopes found for this examiner.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                      <div className="max-h-[min(50vh,420px)] overflow-auto">
                        <table className="w-full min-w-[560px] border-collapse text-sm leading-normal">
                          <thead>
                            <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 backdrop-blur-sm">
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                School
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Series
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Envelope
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Qty
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="[&_tr:nth-child(even)]:bg-muted/20">
                            {assignmentRowsForSelectedExaminer.map((item) => (
                              <tr key={item.script_envelope_id} className="border-b border-border/70 align-top">
                                <td className="px-3 py-2 text-foreground">
                                  {item.school_name}{" "}
                                  <span className="text-muted-foreground">({item.school_code})</span>
                                </td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{item.series_number}</td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{item.envelope_number}</td>
                                <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                                  {item.booklet_count}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
                                    disabled={busy}
                                    onClick={() => void handleRemoveEnvelopeAssignment(item.script_envelope_id)}
                                  >
                                    Remove
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end border-t border-border bg-muted/20 px-4 py-3 md:px-5">
                  <Button type="button" variant="outline" disabled={busy} onClick={closeAssignmentDetailModal}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {unassignedListModalOpen ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closeUnassignedListModal();
              }}
            >
              <div
                className="flex max-h-[min(92vh,840px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="unassigned-list-modal-title"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border bg-muted/20 px-4 py-4 md:px-5">
                  <h2 id="unassigned-list-modal-title" className="text-base font-semibold text-card-foreground">
                    Unassigned envelopes
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Latest run only · {unassignedEnvelopesList.length} total
                    {filteredUnassignedEnvelopes.length !== unassignedEnvelopesList.length
                      ? ` · showing ${filteredUnassignedEnvelopes.length} after filters`
                      : ""}
                  </p>
                </div>
                <div className="border-b border-border px-4 py-3 md:px-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor="unassigned-filter-region" className={formLabelClass}>
                        Region
                      </label>
                      <select
                        id="unassigned-filter-region"
                        className={`${formInputClass} mt-1 w-full`}
                        value={unassignedFilterRegion}
                        onChange={(e) => {
                          setUnassignedFilterRegion(e.target.value);
                          setUnassignedFilterZone("");
                          setUnassignedFilterSeries("");
                        }}
                      >
                        <option value="">All regions</option>
                        {unassignedRegionFilterOptions.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="unassigned-filter-zone" className={formLabelClass}>
                        Zone
                      </label>
                      <select
                        id="unassigned-filter-zone"
                        className={`${formInputClass} mt-1 w-full`}
                        value={unassignedFilterZone}
                        onChange={(e) => {
                          setUnassignedFilterZone(e.target.value);
                          setUnassignedFilterSeries("");
                        }}
                      >
                        <option value="">All zones</option>
                        {unassignedZoneFilterOptions.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="unassigned-filter-series" className={formLabelClass}>
                        Series
                      </label>
                      <select
                        id="unassigned-filter-series"
                        className={`${formInputClass} mt-1 w-full`}
                        value={unassignedFilterSeries}
                        onChange={(e) => setUnassignedFilterSeries(e.target.value)}
                      >
                        <option value="">All series</option>
                        {unassignedSeriesFilterOptions.map((n) => (
                          <option key={n} value={String(n)}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-4 md:p-5">
                  {filteredUnassignedEnvelopes.length === 0 ? (
                    <p className="rounded-lg border border-border/80 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                      No envelopes match the current filters.
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
                      <div className="max-h-[min(52vh,480px)] overflow-auto">
                        <table className="w-full min-w-[680px] border-collapse text-sm leading-normal">
                          <thead>
                            <tr className="sticky top-0 z-1 border-b border-border bg-muted/80 backdrop-blur-sm">
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Region
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Zone
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                School
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Series
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Envelope
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Booklets
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                              >
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="[&_tr:nth-child(even)]:bg-muted/20">
                            {filteredUnassignedEnvelopes.map((row) => (
                              <tr key={row.script_envelope_id} className="border-b border-border/70 align-top">
                                <td className="px-3 py-2 text-muted-foreground">
                                  {(row.region ?? "").trim() || "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{row.zone}</td>
                                <td className="px-3 py-2 text-foreground">
                                  {row.school_name}{" "}
                                  <span className="text-muted-foreground">({row.school_code})</span>
                                </td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.series_number}</td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.envelope_number}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                                  {row.booklet_count}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs"
                                    disabled={busy || poolRows.length === 0}
                                    onClick={() => openManualAssign(row)}
                                  >
                                    Assign…
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-end border-t border-border bg-muted/20 px-4 py-3 md:px-5">
                  <Button type="button" variant="outline" disabled={busy} onClick={closeUnassignedListModal}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {manualAssignTarget ? (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget && !busy) closeManualAssignModal();
              }}
            >
              <div
                className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="manual-assign-modal-title"
                aria-describedby="manual-assign-modal-desc"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border bg-muted/20 px-4 py-4 md:px-5">
                  <h2 id="manual-assign-modal-title" className="text-base font-semibold text-card-foreground">
                    Assign envelope
                  </h2>
                  <p id="manual-assign-modal-desc" className="mt-1 text-xs text-muted-foreground">
                    {(manualAssignTarget.region ?? "").trim()
                      ? `${manualAssignTarget.region} · zone ${manualAssignTarget.zone} · `
                      : `Zone ${manualAssignTarget.zone} · `}
                    {manualAssignTarget.school_name} ({manualAssignTarget.school_code}) · Series{" "}
                    {manualAssignTarget.series_number} · Envelope {manualAssignTarget.envelope_number} ·{" "}
                    {manualAssignTarget.booklet_count} booklets
                  </p>
                </div>
                <div className="space-y-4 p-4 md:p-5">
                  <div>
                    <label htmlFor="manual-assign-examiner" className={formLabelClass}>
                      Examiner
                    </label>
                    <div id="manual-assign-examiner" className="mt-1.5">
                      <SearchableCombobox
                        options={manualAssignExaminerOptions}
                        value={manualAssignExaminerId}
                        onChange={setManualAssignExaminerId}
                        placeholder="Select examiner…"
                        searchPlaceholder="Search examiners…"
                        showAllOption={false}
                        widthClass="w-full max-w-none"
                      />
                    </div>
                    {poolRows.length === 0 ? (
                      <p className="mt-2 text-xs text-destructive">Add examiners to this allocation before assigning.</p>
                    ) : null}
                  </div>
                  {manualAssignError ? (
                    <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {manualAssignError}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3 md:px-5">
                  <Button type="button" variant="outline" disabled={busy} onClick={closeManualAssignModal}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || !manualAssignExaminerId || poolRows.length === 0}
                    onClick={() => void confirmManualAssign()}
                  >
                    Assign
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
