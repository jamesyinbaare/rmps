"use client";

import { useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  apiJson,
  getDepotCenterQuestionPaperControl,
  getDepotCenters,
  verifyDepotQuestionPaperSlot,
  type DepotSchoolRow,
  type Examination,
  type MyCenterQuestionPaperControlResponse,
} from "@/lib/api";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

function slotHasInspectorData(ser: {
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
}): boolean {
  return (
    ser.copies_received > 0 ||
    ser.copies_used > 0 ||
    ser.copies_to_library > 0 ||
    ser.copies_remaining > 0
  );
}

export default function DepotKeeperQuestionPaperControlPage() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<DepotSchoolRow[]>([]);
  const [centerId, setCenterId] = useState("");
  const [data, setData] = useState<MyCenterQuestionPaperControlResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingKey, setVerifyingKey] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (examId === null || centerId.trim() === "") return;
    setLoadError(null);
    setBusy(true);
    try {
      const res = await getDepotCenterQuestionPaperControl(examId, centerId);
      setData(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load question paper control");
      setData(null);
    } finally {
      setBusy(false);
    }
  }, [examId, centerId]);

  useEffect(() => {
    async function init() {
      setLoadError(null);
      try {
        const list = await apiJson<Examination[]>("/examinations/public-list");
        setExams(list);
        setExamId((prev) => (prev === null && list.length ? list[0].id : prev));
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
        return;
      }
      try {
        const c = await getDepotCenters();
        setCenters(c.items);
        if (c.items.length === 1) setCenterId(c.items[0].id);
      } catch (e) {
        setCenters([]);
        setLoadError(e instanceof Error ? e.message : "Failed to load depot centres");
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (examId !== null && centerId.trim() !== "") void loadData();
    else setData(null);
  }, [examId, centerId, loadData]);

  async function onVerify(subjectId: number, paperNumber: number, seriesNumber: number) {
    if (examId === null || centerId.trim() === "") return;
    const key = `${subjectId}-${paperNumber}-${seriesNumber}`;
    setActionError(null);
    setVerifyingKey(key);
    try {
      await verifyDepotQuestionPaperSlot(examId, centerId, {
        subject_id: subjectId,
        paper_number: paperNumber,
        series_number: seriesNumber,
      });
      await loadData();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setVerifyingKey(null);
    }
  }

  return (
    <RoleGuard expectedRole="DEPOT_KEEPER" loginHref="/login/depot-keeper">
      <DashboardShell title="Question paper control (confirm)" staffRole="depot-keeper">
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Select an examination centre host in your depot. Confirm question paper control slots after
            inspectors have entered counts. Confirmed slots cannot be edited by the inspector.
          </p>

          {loadError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {actionError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {actionError}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="dk-qp-exam" className={formLabelClass}>
                Examination
              </label>
              <select
                id="dk-qp-exam"
                className={`mt-1 w-full ${formInputClass}`}
                value={examId ?? ""}
                onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
              >
                {exams.length === 0 ? <option value="">No examinations</option> : null}
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.year}
                    {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="dk-qp-center" className={formLabelClass}>
                Examination centre (host)
              </label>
              <select
                id="dk-qp-center"
                className={`mt-1 w-full ${formInputClass}`}
                value={centerId}
                onChange={(e) => setCenterId(e.target.value)}
              >
                <option value="">Select centre…</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {busy && data === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {data ? (
            <p className="text-sm text-muted-foreground">
              Centre: <span className="font-medium text-foreground">{data.center_name}</span> (
              {data.center_code})
            </p>
          ) : null}

          {data && data.subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rows for this selection.</p>
          ) : null}

          {data && data.subjects.length > 0 ? (
            <div className="space-y-6">
              {data.subjects.map((sub) => (
                <section key={sub.subject_id} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                  <h2 className="text-lg font-semibold text-foreground">
                    {sub.subject_code} — {sub.subject_name}
                  </h2>
                  <div className="mt-4 space-y-4">
                    {sub.papers.map((paper) => (
                      <div
                        key={paper.paper_number}
                        className="rounded-xl border border-border/80 bg-background/50 p-3"
                      >
                        <p className="text-sm font-medium text-foreground">
                          Paper {paper.paper_number}
                          {paper.examination_date ? (
                            <span className="ml-2 font-normal text-muted-foreground">
                              · {paper.examination_date}
                            </span>
                          ) : null}
                        </p>
                        <ul className="mt-2 space-y-2">
                          {paper.series.map((ser) => {
                            const key = `${sub.subject_id}-${paper.paper_number}-${ser.series_number}`;
                            const verifying = verifyingKey === key;
                            const hasRow = slotHasInspectorData(ser);
                            return (
                              <li
                                key={ser.series_number}
                                className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    Series {ser.series_number}
                                  </p>
                                  <p className="text-xs tabular-nums text-muted-foreground">
                                    Rcvd {ser.copies_received} · Used {ser.copies_used} · Lib{" "}
                                    {ser.copies_to_library} · Rem {ser.copies_remaining}
                                  </p>
                                  {ser.verified ? (
                                    <p className="mt-1 text-xs font-medium text-muted-foreground">Confirmed</p>
                                  ) : null}
                                </div>
                                <div>
                                  {hasRow && !ser.verified ? (
                                    <button
                                      type="button"
                                      className={btnPrimary}
                                      disabled={busy || verifying}
                                      onClick={() =>
                                        void onVerify(sub.subject_id, paper.paper_number, ser.series_number)
                                      }
                                    >
                                      {verifying ? "Confirming…" : "Confirm entry"}
                                    </button>
                                  ) : null}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}
