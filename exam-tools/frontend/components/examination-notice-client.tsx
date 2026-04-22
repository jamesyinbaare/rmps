"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { StaffDepotNoticeBanner } from "@/components/staff-depot-notice-banner";
import { StaffExamCentreNotice } from "@/components/staff-exam-centre-notice";
import { StaffInspectorNoticeBanner } from "@/components/staff-inspector-notice-banner";
import {
  apiJson,
  getMyCenterProgrammes,
  getMyDepotProgrammes,
  getMyDepotSchools,
  getStaffCentreOverview,
  getStaffDepotOverview,
  type CenterScopeSchoolItem,
  type CentreScopeProgrammeItem,
  type Examination,
  type StaffCentreOverviewResponse,
  type StaffDepotOverviewResponse,
} from "@/lib/api";
import {
  depotExaminationAppointmentHeading,
  depotExaminationClosing,
  depotExaminationContactsHeading,
  depotExaminationContactsIntro,
  depotExaminationContactLines,
  depotExaminationDocumentsChecklist,
  depotExaminationJobDescriptionHeading,
  depotExaminationJobDescriptionIntro,
  depotExaminationJobDescriptionItems,
  depotExaminationSummaryHeading,
  depotExaminationSummaryParagraphs,
  depotExaminationSecurityHeading,
  depotExaminationSecurityIntro,
  depotExaminationSecurityItems,
  depotExaminationSignatoryLines,
  depotExaminationSignOff,
} from "@/lib/examination-notice-depot-content";
import {
  formatOrdinalLongDate,
  inspectorAppointmentIntro,
  inspectorExaminationAppointmentHeading,
  inspectorExaminationClosing,
  inspectorExaminationSignOff,
  inspectorExaminationSignatoryLines,
  inspectorExaminationSummaryHeading,
  inspectorExaminationSummaryParagraphs,
  inspectorExaminationWindowSentence,
  inspectorJobDescriptionHeading,
  inspectorJobDescriptionIntro,
  inspectorJobDescriptionItems,
  inspectorNumberedNotifications,
  inspectorPleaseNoteLead,
} from "@/lib/examination-notice-inspector-content";
import {
  examDayInstructions,
  examinationNoticeIntro,
  examinationNoticeTitle,
  postExamInstructions,
  preExamInstructions,
  requiredDocumentsChecklist,
} from "@/lib/examination-notice-content";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

export type ExaminationNoticeDataScope = "centre" | "depot";

export type CentreNoticeRole = "supervisor" | "inspector";

type Props = {
  dataScope: ExaminationNoticeDataScope;
  /** When `dataScope` is `"centre"`, selects supervisor vs inspector notice copy. Ignored for depot. */
  centreRole?: CentreNoticeRole;
};

const DEPOT_SCHOOLS_LIST_CAP = 20;
const DEPOT_PROGRAMMES_SHOW = 12;

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

function printExaminationNotice() {
  document.body.classList.add("printing-examination-notice");
  const onAfterPrint = () => {
    document.body.classList.remove("printing-examination-notice");
    window.removeEventListener("afterprint", onAfterPrint);
  };
  window.addEventListener("afterprint", onAfterPrint);
  window.print();
  setTimeout(() => {
    document.body.classList.remove("printing-examination-notice");
    window.removeEventListener("afterprint", onAfterPrint);
  }, 2_000);
}

function sortedProgrammes(items: CentreScopeProgrammeItem[]): CentreScopeProgrammeItem[] {
  return [...items].sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));
}

export function ExaminationNoticeClient({ dataScope, centreRole = "supervisor" }: Props) {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [overviewCentre, setOverviewCentre] = useState<StaffCentreOverviewResponse | null>(null);
  const [overviewDepot, setOverviewDepot] = useState<StaffDepotOverviewResponse | null>(null);
  const [programmes, setProgrammes] = useState<CentreScopeProgrammeItem[]>([]);
  const [depotSchools, setDepotSchools] = useState<CenterScopeSchoolItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExams = useCallback(async () => {
    setError(null);
    try {
      const list = await apiJson<Examination[]>("/examinations/public-list");
      setExams(list);
      setExamId((prev) => {
        if (prev != null && list.some((it) => it.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (e) {
      setExams([]);
      setExamId(null);
      setError(e instanceof Error ? e.message : "Could not load examinations");
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  useEffect(() => {
    if (examId == null) {
      setOverviewCentre(null);
      setOverviewDepot(null);
      setProgrammes([]);
      setDepotSchools([]);
      return;
    }
    const examIdResolved = examId;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setDepotSchools([]);

    async function loadNoticeData() {
      try {
        if (dataScope === "depot") {
          const [overviewData, programmesData, schoolsData] = await Promise.all([
            getStaffDepotOverview(examIdResolved),
            getMyDepotProgrammes(),
            getMyDepotSchools(),
          ]);
          if (cancelled) return;
          setOverviewDepot(overviewData);
          setOverviewCentre(null);
          setProgrammes(sortedProgrammes(programmesData.programmes));
          setDepotSchools(schoolsData.schools);
        } else {
          const [overviewData, programmesData] = await Promise.all([
            getStaffCentreOverview(examIdResolved),
            getMyCenterProgrammes(),
          ]);
          if (cancelled) return;
          setOverviewCentre(overviewData);
          setOverviewDepot(null);
          setProgrammes(sortedProgrammes(programmesData.programmes));
          setDepotSchools([]);
        }
      } catch (e) {
        if (!cancelled) {
          setOverviewCentre(null);
          setOverviewDepot(null);
          setProgrammes([]);
          setDepotSchools([]);
          setError(e instanceof Error ? e.message : "Could not load examination notice data");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void loadNoticeData();
    return () => {
      cancelled = true;
    };
  }, [examId, dataScope]);

  const activeExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [exams, examId]);
  const hasOverview = dataScope === "depot" ? overviewDepot != null : overviewCentre != null;
  const candidateCount =
    dataScope === "depot" ? (overviewDepot?.candidate_count ?? 0) : (overviewCentre?.candidate_count ?? 0);
  const schoolCount =
    dataScope === "depot" ? (overviewDepot?.school_count ?? 0) : (overviewCentre?.school_count ?? 0);

  const depotSchoolsShown = depotSchools.slice(0, DEPOT_SCHOOLS_LIST_CAP);
  const depotSchoolsRest = Math.max(0, depotSchools.length - depotSchoolsShown.length);
  const programmeCatalogueSubjectLinks = useMemo(
    () => programmes.reduce((sum, p) => sum + p.subject_count, 0),
    [programmes],
  );

  const isInspectorCentre = dataScope === "centre" && centreRole === "inspector";

  const inspectorWindowSentence = useMemo(
    () =>
      overviewCentre
        ? inspectorExaminationWindowSentence(
            overviewCentre.examination_window_start,
            overviewCentre.examination_window_end,
          )
        : "",
    [overviewCentre],
  );

  const inspectorNotificationList = useMemo(
    () => inspectorNumberedNotifications(inspectorWindowSentence),
    [inspectorWindowSentence],
  );

  return (
    <div className="space-y-5">
      <div className="max-w-md">
        <label htmlFor="examination-notice-exam" className={formLabelClass}>
          Examination
        </label>
        <select
          id="examination-notice-exam"
          className={`mt-1 w-full ${formInputClass}`}
          value={examId ?? ""}
          onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
          disabled={exams.length === 0 || busy}
        >
          {exams.length === 0 ? <option value="">No examinations</option> : null}
          {exams.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {formatExamLabel(ex)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {busy && !hasOverview ? <p className="text-sm text-muted-foreground">Loading notice…</p> : null}

      {activeExam && hasOverview ? (
        <article className="examination-notice-onepage mx-auto rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <header className="mb-4 border-b border-border pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {dataScope === "depot"
                    ? "Depot keeper notice"
                    : isInspectorCentre
                      ? "Inspector notice"
                      : "Examination notice"}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">
                  {activeExam.exam_type} {activeExam.exam_series ? `${activeExam.exam_series} ` : ""}
                  {activeExam.year}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => printExaminationNotice()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center self-start rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden"
              >
                Print notice
              </button>
            </div>
            {dataScope === "depot" && activeExam && overviewDepot ? (
              <>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {depotExaminationAppointmentHeading({
                    year: activeExam.year,
                    examType: activeExam.exam_type,
                    examSeries: activeExam.exam_series,
                  })}
                </p>
                <div className="mt-3">
                  <StaffDepotNoticeBanner overview={overviewDepot} />
                </div>
              </>
            ) : isInspectorCentre && activeExam && overviewCentre ? (
              <>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {inspectorExaminationAppointmentHeading({
                    year: activeExam.year,
                    examType: activeExam.exam_type,
                    examSeries: activeExam.exam_series,
                  })}
                </p>
                <div className="mt-3">
                  <StaffInspectorNoticeBanner overview={overviewCentre} />
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm font-medium text-foreground">{examinationNoticeTitle}</p>
                <p className="mt-2 text-sm text-foreground">{examinationNoticeIntro}</p>
                <div className="mt-3">
                  <StaffExamCentreNotice overview={overviewCentre} />
                </div>
              </>
            )}
          </header>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
            {dataScope === "depot" && overviewDepot ? (
              <section className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{depotExaminationSummaryHeading}</h3>
                  <div className="mt-2 space-y-2 text-sm text-foreground">
                    {depotExaminationSummaryParagraphs.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{depotExaminationSecurityHeading}</h3>
                  <p className="mt-2 text-sm text-foreground">{depotExaminationSecurityIntro}</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                    {depotExaminationSecurityItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{depotExaminationJobDescriptionHeading}</h3>
                  <p className="mt-2 text-sm text-foreground">{depotExaminationJobDescriptionIntro}</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                    {depotExaminationJobDescriptionItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ol>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{depotExaminationContactsHeading}</h3>
                  <p className="mt-2 text-sm text-foreground">{depotExaminationContactsIntro}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {depotExaminationContactLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-foreground">{depotExaminationClosing}</p>
                  <p className="mt-4 text-sm font-semibold text-foreground">{depotExaminationSignOff}</p>
                  {depotExaminationSignatoryLines.map((line, idx) =>
                    line === "" ? (
                      <br key={`br-${idx}`} />
                    ) : (
                      <p key={idx} className="text-sm font-medium text-foreground">
                        {line}
                      </p>
                    ),
                  )}
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">Documents for your attention</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {depotExaminationDocumentsChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : isInspectorCentre && overviewCentre && activeExam ? (
              <section className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{inspectorExaminationSummaryHeading}</h3>
                  <div className="mt-2 space-y-2 text-sm text-foreground">
                    {inspectorExaminationSummaryParagraphs.map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <p className="text-sm text-foreground">
                    {inspectorAppointmentIntro({
                      year: activeExam.year,
                      examType: activeExam.exam_type,
                      examSeries: activeExam.exam_series,
                      centreName: overviewCentre.examination_centre_host_name,
                      centreCode: overviewCentre.examination_centre_host_code,
                      region: overviewCentre.examination_centre_region,
                    })}
                  </p>
                  <p className="mt-3 text-sm font-semibold text-foreground">{inspectorPleaseNoteLead}</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                    {inspectorNotificationList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ol>
                  <p className="mt-4 text-sm text-foreground">{inspectorExaminationClosing}</p>
                  <p className="mt-4 text-sm font-semibold text-foreground">{inspectorExaminationSignOff}</p>
                  {inspectorExaminationSignatoryLines.map((line, idx) =>
                    line === "" ? (
                      <br key={`insp-br-${idx}`} />
                    ) : (
                      <p key={`insp-sig-${idx}`} className="text-sm font-medium text-foreground">
                        {line}
                      </p>
                    ),
                  )}
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">{inspectorJobDescriptionHeading}</h3>
                  <p className="mt-2 text-sm text-foreground">{inspectorJobDescriptionIntro}</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-foreground">
                    {inspectorJobDescriptionItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ol>
                </div>
              </section>
            ) : (
              <section className="space-y-4">
                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    As a Principal and Supervisor, you are responsible for
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {preExamInstructions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">During the examination period</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {examDayInstructions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">After the examinations</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {postExamInstructions.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border/80 bg-muted/20 p-3">
                  <h3 className="text-sm font-semibold text-foreground">Documents/details for your attention</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
                    {requiredDocumentsChecklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            <section className="space-y-4">
              <div className="rounded-xl border border-border p-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {dataScope === "depot" ? "Depot summary" : "Centre summary"}
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  {dataScope === "depot" && overviewDepot ? (
                    <>
                      <dt className="text-muted-foreground">Depot</dt>
                      <dd className="text-right font-semibold text-foreground">
                        <span className="block truncate" title={`${overviewDepot.depot_name} (${overviewDepot.depot_code})`}>
                          {overviewDepot.depot_name}{" "}
                          <span className="font-mono text-xs font-normal text-muted-foreground">
                            ({overviewDepot.depot_code})
                          </span>
                        </span>
                      </dd>
                      {overviewDepot.region_summary ? (
                        <>
                          <dt className="text-muted-foreground">Region</dt>
                          <dd className="text-right text-sm font-medium text-foreground">{overviewDepot.region_summary}</dd>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {dataScope === "centre" && overviewCentre && isInspectorCentre ? (
                    <>
                      <dt className="text-muted-foreground">Examination centre</dt>
                      <dd className="text-right font-semibold text-foreground">
                        <span
                          className="block truncate"
                          title={`${overviewCentre.examination_centre_host_name} (${overviewCentre.examination_centre_host_code})`}
                        >
                          {overviewCentre.examination_centre_host_name}{" "}
                          <span className="font-mono text-xs font-normal text-muted-foreground">
                            ({overviewCentre.examination_centre_host_code})
                          </span>
                        </span>
                      </dd>
                      <dt className="text-muted-foreground">Region</dt>
                      <dd className="text-right text-sm font-medium text-foreground">
                        {overviewCentre.examination_centre_region}
                      </dd>
                      <dt className="text-muted-foreground">Examination period</dt>
                      <dd className="text-right text-sm text-foreground">
                        {overviewCentre.examination_window_start && overviewCentre.examination_window_end
                          ? overviewCentre.examination_window_start === overviewCentre.examination_window_end
                            ? formatOrdinalLongDate(overviewCentre.examination_window_start)
                            : `${formatOrdinalLongDate(overviewCentre.examination_window_start)} – ${formatOrdinalLongDate(overviewCentre.examination_window_end)}`
                          : "See timetable"}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Candidates</dt>
                  <dd className="text-right font-semibold text-foreground">{candidateCount.toLocaleString()}</dd>
                  <dt className="text-muted-foreground">Schools</dt>
                  <dd className="text-right font-semibold text-foreground">{schoolCount.toLocaleString()}</dd>
                  {dataScope === "depot" && overviewDepot ? (
                    <>
                      <dt className="text-muted-foreground">Subjects (timetable)</dt>
                      <dd className="text-right font-semibold text-foreground">
                        {overviewDepot.timetable_distinct_subject_count.toLocaleString()}
                      </dd>
                      <dt className="text-muted-foreground">Subject links (programmes)</dt>
                      <dd className="text-right font-semibold text-foreground">
                        {programmeCatalogueSubjectLinks.toLocaleString()}
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Programmes</dt>
                  <dd className="text-right font-semibold text-foreground">{programmes.length.toLocaleString()}</dd>
                </dl>
              </div>

              {dataScope === "depot" && depotSchools.length > 0 ? (
                <div className="rounded-xl border border-border p-3">
                  <h3 className="text-sm font-semibold text-foreground">Schools in this depot</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {depotSchoolsShown.map((s) => (
                      <li key={s.id} className="text-foreground">
                        <span className="font-mono tabular-nums text-muted-foreground">{s.code}</span> — {s.name}
                      </li>
                    ))}
                  </ul>
                  {depotSchoolsRest > 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">and {depotSchoolsRest.toLocaleString()} more…</p>
                  ) : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-border p-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {dataScope === "depot" ? "Programmes in depot" : "Programmes at centre"}
                </h3>
                {programmes.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No programmes found.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {(dataScope === "depot" ? programmes.slice(0, DEPOT_PROGRAMMES_SHOW) : programmes.slice(0, 8)).map(
                      (p) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="truncate text-foreground" title={`${p.code} — ${p.name}`}>
                            {p.code} — {p.name}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{p.subject_count}</span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
                {dataScope === "depot" && programmes.length > DEPOT_PROGRAMMES_SHOW ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Showing first {DEPOT_PROGRAMMES_SHOW} of {programmes.length.toLocaleString()} programmes.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </article>
      ) : null}
    </div>
  );
}
