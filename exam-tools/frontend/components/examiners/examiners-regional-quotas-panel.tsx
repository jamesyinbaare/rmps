"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Layers, Loader2, MapPin, Target, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EXAMINERS_PANEL_CLASS } from "@/components/examiners/constants";
import {
  ExaminerQuotaRegionGroupsEditor,
  QuotaRegionGroupsSummary,
} from "@/components/examiners/examiner-quota-region-groups-editor";
import { EXAMINER_TYPE_LABELS, EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExaminerTypeApi, ExaminationExaminerQuotaRegionGroupsResponse, Subject } from "@/lib/api";
import {
  getSubjectExaminerRegionQuotas,
  putSubjectExaminerRegionQuotas,
  type ExaminerQuotaRegionGroupRow,
  type SubjectExaminerRegionQuotaItem,
} from "@/lib/api";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import {
  SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS,
  type ScriptControlSubjectTypeFilter,
} from "@/lib/script-control-subjects";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type Props = {
  examId: number | null;
  subjects: Subject[];
  embedded?: boolean;
  pageScroll?: boolean;
  usePageSubjectScope?: boolean;
  pageSubjectTypeFilter?: ScriptControlSubjectTypeFilter;
  pageSubjectId?: string;
};

type DraftCell = { total: string; roles: Record<ExaminerTypeApi, string> };

function emptyRoles(): Record<ExaminerTypeApi, string> {
  return {
    chief_examiner: "",
    assistant_chief_examiner: "",
    assistant_examiner: "",
    team_leader: "",
  };
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function sumGroupTotals(draft: Record<string, DraftCell>, groups: ExaminerQuotaRegionGroupRow[]): number {
  return groups.reduce((sum, group) => {
    const val = parseNonNegativeInt(draft[group.id]?.total ?? "");
    return sum + (val ?? 0);
  }, 0);
}

function distributeEvenly(total: number, groups: ExaminerQuotaRegionGroupRow[]): Record<string, DraftCell> {
  if (groups.length === 0) return {};
  const base = Math.floor(total / groups.length);
  let remainder = total - base * groups.length;
  const next: Record<string, DraftCell> = {};
  for (const group of groups) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    next[group.id] = { total: String(base + extra), roles: emptyRoles() };
  }
  return next;
}

export function ExaminersRegionalQuotasPanel({
  examId,
  subjects,
  pageScroll = false,
  usePageSubjectScope = false,
  pageSubjectTypeFilter = "all",
  pageSubjectId = "",
}: Props) {
  const [regionsComplete, setRegionsComplete] = useState(false);
  const [savedGroups, setSavedGroups] = useState<ExaminerQuotaRegionGroupRow[]>([]);
  const [groupsSectionOpen, setGroupsSectionOpen] = useState(true);

  const [subjectTypeFilter, setSubjectTypeFilter] = useState<ScriptControlSubjectTypeFilter>("all");
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [subjectTotal, setSubjectTotal] = useState("");
  const [maleQuota, setMaleQuota] = useState("");
  const [femaleQuota, setFemaleQuota] = useState("");
  const [genderOnRoster, setGenderOnRoster] = useState({ male: 0, female: 0 });
  const [rosterTotal, setRosterTotal] = useState(0);
  const [draft, setDraft] = useState<Record<string, DraftCell>>({});
  const [summary, setSummary] = useState<Record<string, { total: number; roles: Record<string, number> }>>({});
  const [loadingQuotas, setLoadingQuotas] = useState(false);
  const [savingQuotas, setSavingQuotas] = useState(false);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!usePageSubjectScope) return;
    setSubjectTypeFilter(pageSubjectTypeFilter);
    const parsed = Number.parseInt(pageSubjectId, 10);
    setSubjectId(Number.isNaN(parsed) ? null : parsed);
  }, [pageSubjectId, pageSubjectTypeFilter, usePageSubjectScope]);

  const filteredSubjects = useMemo(() => {
    return subjects
      .filter((s) => subjectTypeFilter === "all" || s.subject_type === subjectTypeFilter)
      .sort((a, b) => subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b)));
  }, [subjects, subjectTypeFilter]);

  const subjectOptions = useMemo(
    () =>
      filteredSubjects.map((s) => ({
        value: String(s.id),
        label: subjectDisplayLabel(s),
      })),
    [filteredSubjects],
  );

  const selectedSubject = useMemo(
    () => filteredSubjects.find((s) => s.id === subjectId) ?? null,
    [filteredSubjects, subjectId],
  );

  const handleGroupsSaved = useCallback(
    (res: ExaminationExaminerQuotaRegionGroupsResponse) => {
      setRegionsComplete(res.regions_complete);
      setSavedGroups(res.groups);
      if (examId != null && subjectId != null && res.regions_complete) {
        void getSubjectExaminerRegionQuotas(examId, subjectId)
          .then((quotaRes) => {
            setRosterTotal(quotaRes.roster_total);
            setSubjectTotal(quotaRes.total_quota != null ? String(quotaRes.total_quota) : "");
            setMaleQuota(quotaRes.male_quota != null ? String(quotaRes.male_quota) : "");
            setFemaleQuota(quotaRes.female_quota != null ? String(quotaRes.female_quota) : "");
            setGenderOnRoster({
              male: quotaRes.gender_summary?.find((g) => g.gender === "Male")?.current_count ?? 0,
              female: quotaRes.gender_summary?.find((g) => g.gender === "Female")?.current_count ?? 0,
            });
            const nextDraft: Record<string, DraftCell> = {};
            const nextSummary: Record<string, { total: number; roles: Record<string, number> }> = {};
            for (const g of quotaRes.groups) {
              nextDraft[g.id] = { total: "", roles: emptyRoles() };
              nextSummary[g.id] = { total: 0, roles: {} };
            }
            for (const item of quotaRes.items) {
              const cell = nextDraft[item.group_id] ?? { total: "", roles: emptyRoles() };
              if (item.examiner_type == null) cell.total = String(item.quota_count);
              else cell.roles[item.examiner_type] = String(item.quota_count);
              nextDraft[item.group_id] = cell;
            }
            for (const row of quotaRes.summary) {
              const s = nextSummary[row.group_id] ?? { total: 0, roles: {} };
              if (row.examiner_type == null) s.total = row.current_count;
              else s.roles[row.examiner_type] = row.current_count;
              nextSummary[row.group_id] = s;
            }
            setDraft(nextDraft);
            setSummary(nextSummary);
          })
          .catch(() => undefined);
      }
    },
    [examId, subjectId],
  );

  const loadQuotas = useCallback(async () => {
    if (examId == null || subjectId == null || !regionsComplete || savedGroups.length === 0) return;
    setLoadingQuotas(true);
    setQuotaError(null);
    setQuotaMessage(null);
    try {
      const res = await getSubjectExaminerRegionQuotas(examId, subjectId);
      setRosterTotal(res.roster_total);
      setSubjectTotal(res.total_quota != null ? String(res.total_quota) : "");
      setMaleQuota(res.male_quota != null ? String(res.male_quota) : "");
      setFemaleQuota(res.female_quota != null ? String(res.female_quota) : "");
      setGenderOnRoster({
        male: res.gender_summary?.find((g) => g.gender === "Male")?.current_count ?? 0,
        female: res.gender_summary?.find((g) => g.gender === "Female")?.current_count ?? 0,
      });
      const nextDraft: Record<string, DraftCell> = {};
      const nextSummary: Record<string, { total: number; roles: Record<string, number> }> = {};
      for (const g of res.groups) {
        nextDraft[g.id] = { total: "", roles: emptyRoles() };
        nextSummary[g.id] = { total: 0, roles: {} };
      }
      for (const item of res.items) {
        const cell = nextDraft[item.group_id] ?? { total: "", roles: emptyRoles() };
        if (item.examiner_type == null) {
          cell.total = String(item.quota_count);
        } else {
          cell.roles[item.examiner_type] = String(item.quota_count);
        }
        nextDraft[item.group_id] = cell;
      }
      for (const row of res.summary) {
        const s = nextSummary[row.group_id] ?? { total: 0, roles: {} };
        if (row.examiner_type == null) {
          s.total = row.current_count;
        } else {
          s.roles[row.examiner_type] = row.current_count;
        }
        nextSummary[row.group_id] = s;
      }
      setDraft(nextDraft);
      setSummary(nextSummary);
    } catch (e) {
      setQuotaError(e instanceof Error ? e.message : "Failed to load quotas");
    } finally {
      setLoadingQuotas(false);
    }
  }, [examId, regionsComplete, savedGroups.length, subjectId]);

  useEffect(() => {
    if (subjectId != null && !filteredSubjects.some((s) => s.id === subjectId)) {
      setSubjectId(filteredSubjects[0]?.id ?? null);
    } else if (subjectId == null && filteredSubjects.length > 0) {
      setSubjectId(filteredSubjects[0].id);
    }
  }, [filteredSubjects, subjectId]);

  useEffect(() => {
    if (examId != null && subjectId != null && regionsComplete) void loadQuotas();
  }, [examId, subjectId, regionsComplete, loadQuotas]);

  const subjectTotalNum = parseNonNegativeInt(subjectTotal);
  const allocatedTotal = useMemo(() => sumGroupTotals(draft, savedGroups), [draft, savedGroups]);
  const remainingToAllocate =
    subjectTotalNum != null ? subjectTotalNum - allocatedTotal : null;
  const allocationBalanced = subjectTotalNum != null && remainingToAllocate === 0;
  const allocationOver = remainingToAllocate != null && remainingToAllocate < 0;

  const subjectRosterOverQuota =
    subjectTotalNum != null && !loadingQuotas && rosterTotal > subjectTotalNum;
  const subjectRosterOverBy =
    subjectTotalNum != null ? Math.max(0, rosterTotal - subjectTotalNum) : 0;

  const maleQuotaNum = parseNonNegativeInt(maleQuota);
  const femaleQuotaNum = parseNonNegativeInt(femaleQuota);
  const maleRosterOverQuota = maleQuotaNum != null && !loadingQuotas && genderOnRoster.male > maleQuotaNum;
  const femaleRosterOverQuota =
    femaleQuotaNum != null && !loadingQuotas && genderOnRoster.female > femaleQuotaNum;

  const groupsOverRosterQuota = useMemo(() => {
    const over = new Set<string>();
    for (const group of savedGroups) {
      const cell = draft[group.id];
      const cap = parseNonNegativeInt(cell?.total ?? "");
      const onRoster = summary[group.id]?.total ?? 0;
      if (cap != null && onRoster > cap) over.add(group.id);
    }
    return over;
  }, [draft, savedGroups, summary]);

  const anyRosterOverQuota =
    subjectRosterOverQuota || groupsOverRosterQuota.size > 0 || maleRosterOverQuota || femaleRosterOverQuota;

  async function handleSaveQuotas() {
    if (examId == null || subjectId == null) return;
    if (subjectTotalNum == null) {
      setQuotaError("Enter the total number of examiners required for this subject.");
      return;
    }
    if (!allocationBalanced) {
      setQuotaError(
        `Regional group caps must sum to ${subjectTotalNum.toLocaleString()} (currently ${allocatedTotal.toLocaleString()}).`,
      );
      return;
    }

    setSavingQuotas(true);
    setQuotaError(null);
    setQuotaMessage(null);
    try {
      const items: SubjectExaminerRegionQuotaItem[] = [];
      for (const group of savedGroups) {
        const cell = draft[group.id];
        if (!cell) continue;
        const groupTotal = parseNonNegativeInt(cell.total);
        if (groupTotal != null) {
          items.push({
            group_id: group.id,
            examiner_type: null,
            quota_count: groupTotal,
          });
        }
        for (const opt of EXAMINER_TYPE_OPTIONS) {
          const val = cell.roles[opt.value]?.trim() ?? "";
          if (val !== "") {
            items.push({
              group_id: group.id,
              examiner_type: opt.value,
              quota_count: Number(val),
            });
          }
        }
      }
      await putSubjectExaminerRegionQuotas(examId, subjectId, {
        total_quota: subjectTotalNum,
        male_quota: maleQuota.trim() === "" ? null : maleQuotaNum,
        female_quota: femaleQuota.trim() === "" ? null : femaleQuotaNum,
        items,
      });
      setQuotaMessage("Regional quotas saved.");
      await loadQuotas();
    } catch (e) {
      setQuotaError(e instanceof Error ? e.message : "Failed to save quotas");
    } finally {
      setSavingQuotas(false);
    }
  }

  function handleDistributeEvenly() {
    if (subjectTotalNum == null || savedGroups.length === 0) return;
    setDraft((prev) => {
      const even = distributeEvenly(subjectTotalNum, savedGroups);
      const next = { ...prev };
      for (const group of savedGroups) {
        next[group.id] = {
          ...even[group.id],
          roles: prev[group.id]?.roles ?? emptyRoles(),
        };
      }
      return next;
    });
    setQuotaError(null);
  }

  const quotasDisabled = !regionsComplete || savedGroups.length === 0;
  const allocationPercent =
    subjectTotalNum != null && subjectTotalNum > 0
      ? Math.min(100, Math.round((allocatedTotal / subjectTotalNum) * 100))
      : 0;

  return (
    <section
      className={cn(
        EXAMINERS_PANEL_CLASS,
        pageScroll ? "flex flex-col" : "flex min-h-0 flex-1 flex-col overflow-hidden",
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-6 p-4 sm:p-6",
          pageScroll ? "" : "min-h-0 flex-1 overflow-auto",
        )}
      >
        <header className="rounded-xl border border-border bg-gradient-to-br from-card to-muted/20 px-4 py-4 sm:px-5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Regional quotas</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configure quota region groups, then set per-subject headcount targets. Reference codes use separate
            groups on the <span className="font-medium text-foreground">Roster</span> tab.
          </p>
        </header>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 sm:px-5"
            onClick={() => setGroupsSectionOpen((open) => !open)}
            aria-expanded={groupsSectionOpen}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="size-4" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-foreground">Quota region groups</h2>
                  {regionsComplete ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800">
                      <CheckCircle2 className="mr-1 size-3" aria-hidden />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-900">
                      Setup required
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {savedGroups.length} group{savedGroups.length === 1 ? "" : "s"} · all 16 regions must be
                  assigned · editable anytime
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", groupsSectionOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {!groupsSectionOpen && savedGroups.length > 0 ? (
            <div className="border-t border-border px-4 py-3 sm:px-5">
              <QuotaRegionGroupsSummary
                groups={savedGroups}
                regionsComplete={regionsComplete}
                onEdit={() => setGroupsSectionOpen(true)}
              />
            </div>
          ) : null}
          {groupsSectionOpen ? (
            <div className="border-t border-border px-4 py-4 sm:px-5 sm:py-5">
              <ExaminerQuotaRegionGroupsEditor
                examId={examId}
                hideHeader
                onGroupsSaved={handleGroupsSaved}
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-start gap-3 border-b border-border px-4 py-4 sm:px-5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Target className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Subject quotas</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Set the total examiners needed per subject, then distribute across your quota region groups.
              </p>
            </div>
          </div>

          {quotasDisabled ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <MapPin className="size-8 text-muted-foreground/50" aria-hidden />
              <p className="text-sm font-medium text-foreground">Quota region groups not ready</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create and save quota region groups with all regions assigned before configuring subject quotas.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => setGroupsSectionOpen(true)}>
                Set up quota region groups
              </Button>
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-5">
              {!usePageSubjectScope ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Subject type</p>
                  <div className="flex flex-wrap gap-2">
                    {SCRIPT_CONTROL_SUBJECT_TYPE_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        type="button"
                        size="sm"
                        variant={subjectTypeFilter === opt.value ? "default" : "outline"}
                        onClick={() => setSubjectTypeFilter(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground" htmlFor="quota-subject">
                    Subject
                  </label>
                  {filteredSubjects.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                      No subjects match this type.
                    </p>
                  ) : (
                    <SearchableCombobox
                      id="quota-subject"
                      options={subjectOptions}
                      value={subjectId != null ? String(subjectId) : ""}
                      onChange={(value) => setSubjectId(Number(value))}
                      placeholder="Select subject"
                      searchPlaceholder="Search subjects…"
                      widthClass="w-full"
                      showAllOption={false}
                      disabled={loadingQuotas || savingQuotas}
                    />
                  )}
                </div>
              </div>
              ) : null}

              {selectedSubject && subjectId != null ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-normal">
                      {subjectDisplayLabel(selectedSubject)}
                    </Badge>
                    <span className="text-xs text-muted-foreground capitalize">
                      {selectedSubject.subject_type?.toLowerCase() ?? "subject"}
                    </span>
                  </div>

                  <div className="grid gap-4 rounded-xl border border-primary/15 bg-primary/4 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                      <label className="text-xs font-medium text-muted-foreground" htmlFor="subject-total-quota">
                        Total examiners for subject
                      </label>
                      <input
                        id="subject-total-quota"
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-lg font-semibold tabular-nums text-foreground"
                        value={subjectTotal}
                        onChange={(e) => {
                          setSubjectTotal(e.target.value);
                          setQuotaError(null);
                        }}
                        disabled={loadingQuotas || savingQuotas}
                        placeholder="e.g. 120"
                      />
                    </div>
                    <div
                      className={cn(
                        "flex flex-col justify-center gap-1 rounded-lg border px-3 py-2",
                        subjectRosterOverQuota
                          ? "border-destructive/50 bg-destructive/10"
                          : "border-border/80 bg-background/80",
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="size-3.5" aria-hidden />
                        On roster now
                        {subjectRosterOverQuota ? (
                          <Badge
                            variant="outline"
                            className="h-5 border-red-300/60 bg-red-50 px-1.5 text-[10px] font-semibold uppercase text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
                          >
                            Over quota
                          </Badge>
                        ) : null}
                      </div>
                      <p
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          subjectRosterOverQuota ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {loadingQuotas ? "—" : rosterTotal.toLocaleString()}
                        {subjectRosterOverQuota && subjectTotalNum != null ? (
                          <span className="text-base font-normal text-destructive/80">
                            {" "}
                            / {subjectTotalNum.toLocaleString()}
                          </span>
                        ) : null}
                      </p>
                      {subjectRosterOverQuota ? (
                        <p className="text-xs font-medium text-destructive">
                          {subjectRosterOverBy.toLocaleString()} above subject cap
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col justify-center gap-1 rounded-lg border border-border/80 bg-background/80 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Allocated across groups</p>
                      <p
                        className={cn(
                          "text-2xl font-semibold tabular-nums",
                          allocationBalanced
                            ? "text-emerald-700"
                            : allocationOver
                              ? "text-destructive"
                              : "text-foreground",
                        )}
                      >
                        {allocatedTotal.toLocaleString()}
                        {subjectTotalNum != null ? (
                          <span className="text-base font-normal text-muted-foreground">
                            {" "}
                            / {subjectTotalNum.toLocaleString()}
                          </span>
                        ) : null}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/80 bg-muted/15 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">Nationwide gender caps</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Optional limits across all regions for this subject. Only examiners with gender set count
                          toward these caps.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      {(
                        [
                          {
                            id: "male-quota",
                            label: "Male cap",
                            value: maleQuota,
                            onChange: setMaleQuota,
                            onRoster: genderOnRoster.male,
                            over: maleRosterOverQuota,
                            cap: maleQuotaNum,
                          },
                          {
                            id: "female-quota",
                            label: "Female cap",
                            value: femaleQuota,
                            onChange: setFemaleQuota,
                            onRoster: genderOnRoster.female,
                            over: femaleRosterOverQuota,
                            cap: femaleQuotaNum,
                          },
                        ] as const
                      ).map((field) => (
                        <div
                          key={field.id}
                          className={cn(
                            "rounded-lg border px-3 py-3",
                            field.over ? "border-destructive/50 bg-destructive/10" : "border-border bg-background/80",
                          )}
                        >
                          <label className="text-xs font-medium text-muted-foreground" htmlFor={field.id}>
                            {field.label}
                          </label>
                          <input
                            id={field.id}
                            type="number"
                            min={0}
                            step={1}
                            inputMode="numeric"
                            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold tabular-nums"
                            value={field.value}
                            placeholder="Not set"
                            onChange={(e) => {
                              field.onChange(e.target.value);
                              setQuotaError(null);
                            }}
                            disabled={loadingQuotas || savingQuotas}
                          />
                          <p
                            className={cn(
                              "mt-2 text-xs tabular-nums",
                              field.over ? "font-medium text-destructive" : "text-muted-foreground",
                            )}
                          >
                            On roster: {loadingQuotas ? "—" : field.onRoster.toLocaleString()}
                            {field.cap != null ? ` / ${field.cap.toLocaleString()}` : ""}
                            {field.over ? " · over cap" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {subjectTotalNum != null ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Distribution progress</span>
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            allocationBalanced
                              ? "text-emerald-700"
                              : allocationOver
                                ? "text-destructive"
                                : "text-foreground",
                          )}
                        >
                          {allocationBalanced
                            ? "Balanced"
                            : allocationOver
                              ? `${Math.abs(remainingToAllocate ?? 0).toLocaleString()} over`
                              : `${(remainingToAllocate ?? 0).toLocaleString()} remaining`}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            allocationBalanced
                              ? "bg-emerald-500"
                              : allocationOver
                                ? "bg-destructive"
                                : "bg-primary",
                          )}
                          style={{ width: `${allocationPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {anyRosterOverQuota ? (
                    <div
                      className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                      role="alert"
                    >
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <div className="space-y-1">
                        <p className="font-medium">Roster exceeds configured quotas</p>
                        {subjectRosterOverQuota ? (
                          <p>
                            {rosterTotal.toLocaleString()} on roster vs {subjectTotalNum!.toLocaleString()}{" "}
                            subject cap ({subjectRosterOverBy.toLocaleString()} over).
                          </p>
                        ) : null}
                        {groupsOverRosterQuota.size > 0 ? (
                          <p>
                            {groupsOverRosterQuota.size} region group
                            {groupsOverRosterQuota.size === 1 ? "" : "s"} over cap — see highlighted cards below.
                          </p>
                        ) : null}
                        {maleRosterOverQuota || femaleRosterOverQuota ? (
                          <p>
                            Nationwide gender cap exceeded
                            {maleRosterOverQuota && femaleRosterOverQuota
                              ? " (Male and Female)"
                              : maleRosterOverQuota
                                ? " (Male)"
                                : " (Female)"}
                            .
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {quotaError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>{quotaError}</span>
                    </div>
                  ) : null}

                  {loadingQuotas ? (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      <Loader2 className="mr-2 size-5 animate-spin" />
                      Loading quotas…
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">Region group allocation</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={subjectTotalNum == null || savingQuotas}
                          onClick={handleDistributeEvenly}
                        >
                          Split evenly
                        </Button>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        {savedGroups.map((group) => {
                          const cell = draft[group.id] ?? { total: "", roles: emptyRoles() };
                          const sum = summary[group.id];
                          const groupAllocated = parseNonNegativeInt(cell.total) ?? 0;
                          const groupCap = parseNonNegativeInt(cell.total);
                          const rosterOnGroup = sum?.total ?? 0;
                          const groupRosterOverQuota =
                            groupCap != null && rosterOnGroup > groupCap;
                          const groupRosterOverBy =
                            groupCap != null ? Math.max(0, rosterOnGroup - groupCap) : 0;
                          const showRoles = expandedRoles[group.id] ?? false;
                          return (
                            <article
                              key={group.id}
                              className={cn(
                                "rounded-xl border p-4 shadow-sm",
                                groupRosterOverQuota
                                  ? "border-destructive/50 bg-destructive/6"
                                  : "border-border bg-muted/15",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="font-medium text-foreground">{group.name}</h3>
                                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                    {group.regions.join(", ")}
                                  </p>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "shrink-0 tabular-nums",
                                    groupRosterOverQuota &&
                                      "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
                                  )}
                                >
                                  {rosterOnGroup} on roster
                                  {groupRosterOverQuota && groupCap != null
                                    ? ` / ${groupCap}`
                                    : ""}
                                </Badge>
                              </div>
                              {groupRosterOverQuota ? (
                                <p className="mt-2 text-xs font-medium text-destructive">
                                  {groupRosterOverBy.toLocaleString()} above group cap
                                </p>
                              ) : null}

                              <div className="mt-4">
                                <label
                                  className="text-xs font-medium text-muted-foreground"
                                  htmlFor={`group-total-${group.id}`}
                                >
                                  Group cap
                                </label>
                                <input
                                  id={`group-total-${group.id}`}
                                  type="number"
                                  min={0}
                                  step={1}
                                  className={cn(
                                    "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm font-medium tabular-nums",
                                    groupRosterOverQuota && "border-destructive/60 ring-1 ring-destructive/20",
                                    !groupRosterOverQuota &&
                                      subjectTotalNum != null &&
                                      groupAllocated > 0 &&
                                      !allocationBalanced &&
                                      "border-amber-400/80",
                                  )}
                                  value={cell.total}
                                  onChange={(e) => {
                                    setDraft((d) => ({
                                      ...d,
                                      [group.id]: { ...cell, total: e.target.value },
                                    }));
                                    setQuotaError(null);
                                  }}
                                  disabled={savingQuotas}
                                />
                              </div>

                              <button
                                type="button"
                                className="mt-3 text-xs font-medium text-primary hover:underline"
                                onClick={() =>
                                  setExpandedRoles((prev) => ({ ...prev, [group.id]: !showRoles }))
                                }
                              >
                                {showRoles ? "Hide role caps" : "Optional role caps"}
                              </button>

                              {showRoles ? (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  {EXAMINER_TYPE_OPTIONS.map((o) => {
                                    const roleOnRoster = sum?.roles?.[o.value] ?? 0;
                                    const roleCap = parseNonNegativeInt(cell.roles[o.value] ?? "");
                                    const roleOverQuota =
                                      roleCap != null && roleOnRoster > roleCap;
                                    return (
                                    <label key={o.value} className="space-y-1 text-xs">
                                      <span
                                        className={cn(
                                          "font-medium",
                                          roleOverQuota ? "text-destructive" : "text-muted-foreground",
                                        )}
                                      >
                                        {EXAMINER_TYPE_LABELS[o.value]}
                                        <span className="ml-1 font-normal">
                                          ({roleOnRoster} now
                                          {roleOverQuota && roleCap != null ? ` / ${roleCap} cap` : ""})
                                        </span>
                                      </span>
                                      <input
                                        type="number"
                                        min={0}
                                        className={cn(
                                          "w-full rounded-md border bg-background px-2 py-1.5 text-sm tabular-nums",
                                          roleOverQuota && "border-destructive/60",
                                        )}
                                        value={cell.roles[o.value]}
                                        onChange={(e) =>
                                          setDraft((d) => ({
                                            ...d,
                                            [group.id]: {
                                              ...cell,
                                              roles: { ...cell.roles, [o.value]: e.target.value },
                                            },
                                          }))
                                        }
                                        disabled={savingQuotas}
                                      />
                                    </label>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {quotaMessage ? (
                    <p className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="size-4" aria-hidden />
                      {quotaMessage}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-xs text-muted-foreground">
                      {anyRosterOverQuota
                        ? "Current roster exceeds one or more caps — remove examiners or raise quotas."
                        : subjectTotalNum != null
                          ? allocationBalanced
                            ? "Ready to save — group caps match the subject total."
                            : "Group caps must sum exactly to the subject total before saving."
                          : "Enter a subject total, then allocate across all region groups."}
                    </p>
                    <Button
                      type="button"
                      className={officialAccountsBtnPrimary}
                      disabled={savingQuotas || loadingQuotas || !allocationBalanced || subjectTotalNum == null}
                      onClick={() => void handleSaveQuotas()}
                    >
                      {savingQuotas ? "Saving…" : "Save quotas"}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
