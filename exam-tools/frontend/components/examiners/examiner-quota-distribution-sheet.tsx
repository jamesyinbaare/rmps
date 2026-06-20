"use client";

import { ChevronDown, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ExaminerQuotaRegionBreakdownView } from "@/components/examiners/examiner-quota-region-breakdown-view";
import {
  QuotaDetailViewToggle,
  QuotaOutlookAlert,
  QuotaOutlookHero,
  QuotaOutlookLoadingSkeleton,
  QuotaOutlookMetricStrip,
  QuotaScenarioPicker,
  sortGroupsByUrgency,
  type DetailView,
  type QuotaOutlookScenarioId,
} from "@/components/examiners/examiner-quota-outlook-ui";
import {
  ExaminerQuotaUploadPanel,
  type QuotaUploadFooterState,
} from "@/components/examiners/examiner-quota-upload-panel";
import {
  ExaminerQuotaProjectionTable,
  formatQuotaPercent,
  quotaPercentTotal,
} from "@/components/examiners/examiner-quota-projection-table";
import { OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExaminerQuotaUtilizationBar } from "@/components/examiners/examiner-quota-utilization-bar";
import {
  getSubjectExaminerQuotaProjection,
  getSubjectExaminerQuotaStatus,
  type QuotaProjectionResponse,
  type QuotaProjectionScenario,
  type Subject,
  type SubjectExaminerRegionBreakdownRow,
  type SubjectExaminerRegionQuotaSummaryRow,
  type SubjectExaminerRegionQuotasResponse,
} from "@/lib/api";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { subjectDisplayLabel } from "@/lib/subject-display";
import { cn } from "@/lib/utils";

type QuotaOutlookScenario = QuotaOutlookScenarioId;

type Props = {
  open: boolean;
  examId: number | null;
  subjectId: number | null;
  subjects: Subject[];
  onOpenChange: (open: boolean) => void;
};

function RegionDetailSection({
  rows,
  projectionMode,
  regionFilter,
  onRegionFilterChange,
}: {
  rows: SubjectExaminerRegionBreakdownRow[];
  projectionMode: boolean;
  regionFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
}) {
  if (rows.length === 0) {
    return (
      <QuotaOutlookAlert variant="info" title="No regions configured in quota region groups for this examination." />
    );
  }
  return (
    <ExaminerQuotaRegionBreakdownView
      rows={rows}
      projectionMode={projectionMode}
      regionFilter={regionFilter}
      onRegionFilterChange={onRegionFilterChange}
    />
  );
}

function isOverCap(current: number, quota: number | null | undefined): boolean {
  return quota != null && current > quota;
}

function fillPct(count: number, quota: number | null | undefined): number {
  if (quota == null || quota <= 0) return 0;
  return Math.round((count / quota) * 100);
}

function ProjectionOutlookBody({
  data,
  detailView,
  regionFilter,
  onRegionFilterChange,
}: {
  data: QuotaProjectionResponse;
  detailView: DetailView;
  regionFilter: string[];
  onRegionFilterChange: (values: string[]) => void;
}) {
  const groupTotalRows = data.summary_by_group.filter((r) => r.examiner_type == null);
  const roleRows = data.summary_by_group.filter((r) => r.examiner_type != null);
  const genderRows = data.summary_by_gender ?? [];
  const overCapRows = data.summary_by_group.filter((r) => r.over_cap);
  const overCapGender = genderRows.filter((r) => r.over_cap);
  const anyOverCap =
    data.subject_over_cap || overCapRows.length > 0 || overCapGender.length > 0 || !data.valid;

  const invitationBadge =
    data.scenario === "pending"
      ? `${data.invitation_breakdown.pending} pending`
      : `${data.invitation_breakdown.pending} pending + ${data.invitation_breakdown.quota_waitlisted} waitlisted`;

  return (
    <div className="space-y-5">
      <QuotaOutlookHero
        title="Subject total after projection"
        count={data.combined_roster_total}
        cap={data.total_quota}
        overCap={data.subject_over_cap}
        delta={data.proposed_count > 0 ? data.proposed_count : null}
        badge={invitationBadge}
        subtitle={`${data.roster_total.toLocaleString()} on roster now${data.proposed_count > 0 ? ` · +${data.proposed_count} from invitations` : ""}`}
      />

      <QuotaOutlookMetricStrip
        items={[
          { label: "On roster", value: data.roster_total.toLocaleString() },
          {
            label: "Added",
            value: `+${data.proposed_count}`,
            tone: data.proposed_count > 0 ? "default" : undefined,
          },
          {
            label: "Groups over",
            value: String(overCapRows.filter((r) => r.examiner_type == null).length),
            tone: overCapRows.length > 0 ? "danger" : "success",
          },
          {
            label: "Status",
            value: anyOverCap ? "Over cap" : "Fits",
            tone: anyOverCap ? "danger" : "success",
          },
        ]}
      />

      {data.invitation_count === 0 ? (
        <QuotaOutlookAlert
          variant="info"
          title="No matching invitations for this subject — projection matches the current roster."
        />
      ) : null}

      {anyOverCap ? (
        <QuotaOutlookAlert variant="danger" title="Projection would exceed configured quotas">
          {data.subject_over_cap ? (
            <p>
              {data.combined_roster_total.toLocaleString()} after acceptance vs{" "}
              {data.total_quota!.toLocaleString()} subject cap.
            </p>
          ) : null}
          {data.violations.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4">
              {data.violations.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
        </QuotaOutlookAlert>
      ) : data.invitation_count > 0 ? (
        <QuotaOutlookAlert variant="success" title={`All ${data.proposed_count} projected invitation${data.proposed_count === 1 ? "" : "s"} fit within caps.`} />
      ) : null}

      {detailView === "regions" ? (
        <RegionDetailSection
          rows={data.region_breakdown ?? []}
          projectionMode
          regionFilter={regionFilter}
          onRegionFilterChange={onRegionFilterChange}
        />
      ) : (
        <>
          {groupTotalRows.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Regional group caps</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Quota share across groups ({formatQuotaPercent(quotaPercentTotal(groupTotalRows))} allocated)
              </p>
              <ExaminerQuotaProjectionTable rows={groupTotalRows} showRole={false} proposedColumnLabel="+Pending" />
            </section>
          ) : null}

          {roleRows.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-foreground">Role caps by region</h3>
              <p className="mb-2 text-xs text-muted-foreground">Only configured role caps are shown.</p>
              <ExaminerQuotaProjectionTable rows={roleRows} showRole proposedColumnLabel="+Pending" />
            </section>
          ) : null}

          {genderRows.length > 0 ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Nationwide gender caps</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Quota share ({formatQuotaPercent(quotaPercentTotal(genderRows))} allocated)
              </p>
              <ExaminerQuotaProjectionTable rows={genderRows} showRole={false} genderMode proposedColumnLabel="+Pending" />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function ExaminerQuotaDistributionSheet({
  open,
  examId,
  subjectId,
  subjects,
  onOpenChange,
}: Props) {
  const [scenario, setScenario] = useState<QuotaOutlookScenario>("current");
  const [detailView, setDetailView] = useState<DetailView>("groups");
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFooter, setUploadFooter] = useState<QuotaUploadFooterState | null>(null);
  const [data, setData] = useState<SubjectExaminerRegionQuotasResponse | null>(null);
  const [projectionData, setProjectionData] = useState<QuotaProjectionResponse | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});

  const isUploadScenario = scenario === "upload";

  const subjectLabel = useMemo(() => {
    if (subjectId == null) return null;
    const subject = subjects.find((s) => s.id === subjectId);
    return subject ? subjectDisplayLabel(subject) : `Subject #${subjectId}`;
  }, [subjectId, subjects]);

  const loadOutlook = useCallback(async () => {
    if (examId == null || subjectId == null || scenario === "upload") return;
    setLoading(true);
    setError(null);
    try {
      if (scenario === "current") {
        const res = await getSubjectExaminerQuotaStatus(examId, subjectId);
        setData(res);
        setProjectionData(null);
      } else {
        const res = await getSubjectExaminerQuotaProjection(examId, subjectId, scenario as QuotaProjectionScenario);
        setProjectionData(res);
        setData(null);
      }
    } catch (e) {
      setData(null);
      setProjectionData(null);
      setError(e instanceof Error ? e.message : "Failed to load quota outlook");
    } finally {
      setLoading(false);
    }
  }, [examId, subjectId, scenario]);

  useEffect(() => {
    if (!open) {
      setScenario("current");
      setDetailView("groups");
      setRegionFilter([]);
      setUploadFooter(null);
      return;
    }
    if (scenario === "upload") {
      setData(null);
      setProjectionData(null);
      setLoading(false);
      setError(null);
      return;
    }
    void loadOutlook();
  }, [open, loadOutlook, scenario]);

  const groupTotalRows = useMemo(
    () => (data?.summary ?? []).filter((row) => row.examiner_type == null),
    [data?.summary],
  );

  const roleRowsByGroup = useMemo(() => {
    const map = new Map<string, SubjectExaminerRegionQuotaSummaryRow[]>();
    for (const row of data?.summary ?? []) {
      if (row.examiner_type == null) continue;
      const list = map.get(row.group_id) ?? [];
      list.push(row);
      map.set(row.group_id, list);
    }
    return map;
  }, [data?.summary]);

  const genderRows = data?.gender_summary ?? [];
  const groups = data?.groups ?? [];

  const subjectOverCap = data?.total_quota != null && data.roster_total > data.total_quota;
  const groupsOverCap = groupTotalRows.filter((row) => isOverCap(row.current_count, row.quota));
  const maleRow = genderRows.find((r) => r.gender === "male" || r.gender === "Male");
  const femaleRow = genderRows.find((r) => r.gender === "female" || r.gender === "Female");
  const maleOverCap = maleRow != null && isOverCap(maleRow.current_count, maleRow.quota);
  const femaleOverCap = femaleRow != null && isOverCap(femaleRow.current_count, femaleRow.quota);
  const anyRosterOverQuota =
    subjectOverCap || groupsOverCap.length > 0 || maleOverCap || femaleOverCap;

  const sortedGroupCards = useMemo(() => {
    return sortGroupsByUrgency(
      groups.map((group) => {
        const totalRow = groupTotalRows.find((r) => r.group_id === group.id);
        const current = totalRow?.current_count ?? 0;
        const quota = totalRow?.quota;
        return {
          group,
          totalRow,
          roleRows: roleRowsByGroup.get(group.id) ?? [],
          current,
          quota,
          overCap: isOverCap(current, quota),
          fillPct: fillPct(current, quota),
        };
      }),
    );
  }, [groupTotalRows, groups, roleRowsByGroup]);

  const hasCapsConfigured =
    data != null &&
    (data.total_quota != null ||
      data.male_quota != null ||
      data.female_quota != null ||
      (data.items?.length ?? 0) > 0);

  const hasProjectionCaps =
    projectionData != null &&
    (projectionData.total_quota != null ||
      projectionData.summary_by_group.length > 0 ||
      (projectionData.summary_by_gender?.length ?? 0) > 0);

  const toolbar = examId != null && subjectId != null ? (
    <div className="space-y-3">
      <QuotaScenarioPicker value={scenario} onChange={setScenario} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isUploadScenario ? (
          <QuotaDetailViewToggle value={detailView} onChange={setDetailView} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Upload a roster file to preview quota impact before adding examiners.
          </p>
        )}
        {!isUploadScenario && detailView === "regions" && regionFilter.length > 0 ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => setRegionFilter([])}
          >
            Clear region filter
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  if (!open) return null;

  return (
    <OfficialModal
      title="Quota outlook"
      subtitle={
        subjectLabel ? `${subjectLabel} — roster vs caps` : "Roster vs configured caps"
      }
      titleId="quota-distribution-title"
      subtitleId="quota-distribution-subtitle"
      onRequestClose={() => onOpenChange(false)}
      formError={error}
      size="xlarge"
      mobileFillHeight
      toolbar={toolbar}
      footer={
        <div className={officialModalFooterClass()}>
          {isUploadScenario && uploadFooter ? (
            uploadFooter.showSetup ? (
              <Button
                type="button"
                className={officialAccountsBtnPrimary}
                disabled={!uploadFooter.canAssess}
                onClick={uploadFooter.runAssess}
              >
                {uploadFooter.busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Checking quotas…
                  </>
                ) : (
                  "Run assessment"
                )}
              </Button>
            ) : (
              <Button type="button" className={officialAccountsBtnPrimary} onClick={uploadFooter.resetUpload}>
                <RotateCcw className="mr-2 size-4" />
                Test another file
              </Button>
            )
          ) : !isUploadScenario ? (
            <Button
              type="button"
              variant="outline"
              className={officialAccountsBtnSecondary}
              disabled={loading || examId == null || subjectId == null}
              onClick={() => void loadOutlook()}
            >
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
              Refresh
            </Button>
          ) : null}
          <Button type="button" variant="outline" className={officialAccountsBtnSecondary} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      }
    >
      {examId == null || subjectId == null ? (
        <QuotaOutlookAlert variant="info" title="Select a subject to view quota outlook for this examination." />
      ) : isUploadScenario ? (
        <ExaminerQuotaUploadPanel
          examId={examId}
          subjectId={subjectId}
          subjectLabel={subjectLabel}
          active={open && isUploadScenario}
          onError={setError}
          onFooterStateChange={setUploadFooter}
        />
      ) : loading && data == null && projectionData == null ? (
        <QuotaOutlookLoadingSkeleton />
      ) : scenario !== "current" && projectionData ? (
        !hasProjectionCaps ? (
          <QuotaOutlookAlert variant="info" title="No quota caps configured for this subject yet." />
        ) : (
          <ProjectionOutlookBody
            data={projectionData}
            detailView={detailView}
            regionFilter={regionFilter}
            onRegionFilterChange={setRegionFilter}
          />
        )
      ) : data ? (
        groups.length === 0 ? (
          <QuotaOutlookAlert variant="info" title="Admin has not set up quota region groups for this examination yet." />
        ) : !hasCapsConfigured ? (
          <QuotaOutlookAlert variant="info" title="No quota caps configured for this subject yet." />
        ) : (
          <div className="space-y-5">
            <QuotaOutlookHero
              title="Subject total"
              count={data.roster_total}
              cap={data.total_quota}
              overCap={subjectOverCap ?? false}
            />

            <QuotaOutlookMetricStrip
              items={[
                { label: "Region groups", value: String(groups.length) },
                {
                  label: "Groups over cap",
                  value: String(groupsOverCap.length),
                  tone: groupsOverCap.length > 0 ? "danger" : "success",
                },
                {
                  label: "Male",
                  value: maleRow
                    ? `${maleRow.current_count}${maleRow.quota != null ? ` / ${maleRow.quota}` : ""}`
                    : "—",
                  tone: maleOverCap ? "danger" : undefined,
                },
                {
                  label: "Female",
                  value: femaleRow
                    ? `${femaleRow.current_count}${femaleRow.quota != null ? ` / ${femaleRow.quota}` : ""}`
                    : "—",
                  tone: femaleOverCap ? "danger" : undefined,
                },
              ]}
            />

            {anyRosterOverQuota ? (
              <QuotaOutlookAlert variant="danger" title="Roster exceeds configured quotas">
                {subjectOverCap ? (
                  <p>
                    {data.roster_total.toLocaleString()} on roster vs {data.total_quota!.toLocaleString()} subject cap.
                  </p>
                ) : null}
                {groupsOverCap.length > 0 ? (
                  <p>
                    {groupsOverCap.length} region group{groupsOverCap.length === 1 ? "" : "s"} over cap.
                  </p>
                ) : null}
                {maleOverCap || femaleOverCap ? (
                  <p>
                    Nationwide gender cap exceeded
                    {maleOverCap && femaleOverCap ? " (Male and Female)" : maleOverCap ? " (Male)" : " (Female)"}.
                  </p>
                ) : null}
              </QuotaOutlookAlert>
            ) : (
              <QuotaOutlookAlert variant="success" title="All configured quotas are within limits." />
            )}

            {detailView === "regions" ? (
              <RegionDetailSection
                rows={data.region_breakdown ?? []}
                projectionMode={false}
                regionFilter={regionFilter}
                onRegionFilterChange={setRegionFilter}
              />
            ) : (
              <>
                {genderRows.length > 0 ? (
                  <section>
                    <h3 className="text-sm font-semibold text-foreground">Nationwide gender</h3>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {genderRows.map((row) => {
                        const overCap = isOverCap(row.current_count, row.quota);
                        return (
                          <div
                            key={row.gender}
                            className={cn(
                              "flex flex-col gap-2 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between",
                              overCap ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/10",
                            )}
                          >
                            <div>
                              <p className="text-sm font-medium">{row.gender_label}</p>
                              <p className={cn("text-sm tabular-nums", overCap && "text-destructive")}>
                                {row.current_count.toLocaleString()}
                                {row.quota != null ? ` / ${row.quota.toLocaleString()}` : " · no cap"}
                              </p>
                            </div>
                            <ExaminerQuotaUtilizationBar
                              combined={row.current_count}
                              quota={row.quota}
                              overCap={overCap}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                <section>
                  <h3 className="text-sm font-semibold text-foreground">By region group</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Over-cap groups shown first. Expand a group to see role-level caps.
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {sortedGroupCards.map(({ group, roleRows, current, quota, overCap }) => {
                      const showRoles = expandedRoles[group.id] ?? roleRows.length > 0;
                      const remaining = quota != null ? quota - current : null;

                      return (
                        <article
                          key={group.id}
                          className={cn(
                            "rounded-xl border p-4 shadow-sm transition-colors",
                            overCap ? "border-destructive/50 bg-destructive/4" : "border-border bg-muted/10",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="font-medium text-foreground">{group.name}</h4>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                {group.regions.join(", ")}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "tabular-nums",
                                  overCap &&
                                    "border-red-300/60 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100",
                                )}
                              >
                                {current}{quota != null ? ` / ${quota}` : ""}
                              </Badge>
                              {remaining != null && !overCap ? (
                                <span className="text-[10px] tabular-nums text-emerald-700 dark:text-emerald-300">
                                  {remaining} left
                                </span>
                              ) : overCap && remaining != null ? (
                                <span className="text-[10px] tabular-nums text-destructive">
                                  {Math.abs(remaining)} over
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-3">
                            <ExaminerQuotaUtilizationBar combined={current} quota={quota} overCap={overCap} size="lg" />
                          </div>

                          {roleRows.length > 0 ? (
                            <>
                              <button
                                type="button"
                                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                onClick={() =>
                                  setExpandedRoles((prev) => ({ ...prev, [group.id]: !showRoles }))
                                }
                              >
                                <ChevronDown
                                  className={cn("size-3.5 transition-transform", showRoles && "rotate-180")}
                                  aria-hidden
                                />
                                {showRoles ? "Hide role caps" : "Show role caps"}
                              </button>
                              {showRoles ? (
                                <div className="mt-3 space-y-2 border-t border-border/80 pt-3">
                                  {roleRows.map((row) => {
                                    const roleOverCap = isOverCap(row.current_count, row.quota);
                                    return (
                                      <div
                                        key={`${row.group_id}-${row.examiner_type}`}
                                        className={cn(
                                          "flex flex-col gap-2 rounded-md border px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between",
                                          roleOverCap
                                            ? "border-destructive/40 bg-destructive/5"
                                            : "border-border/60 bg-background/80",
                                        )}
                                      >
                                        <div>
                                          <p className="text-xs font-medium">{row.examiner_type_label}</p>
                                          <p
                                            className={cn(
                                              "text-xs tabular-nums text-muted-foreground",
                                              roleOverCap && "text-destructive",
                                            )}
                                          >
                                            {row.current_count}
                                            {row.quota != null ? ` / ${row.quota}` : ""}
                                          </p>
                                        </div>
                                        <ExaminerQuotaUtilizationBar
                                          combined={row.current_count}
                                          quota={row.quota}
                                          overCap={roleOverCap}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              </>
            )}
          </div>
        )
      ) : null}
    </OfficialModal>
  );
}
