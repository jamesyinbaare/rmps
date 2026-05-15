"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  displayBankCode,
  downloadAdminExamCentreOfficialsExport,
  listAdminExamCentreOfficials,
  type AdminExamCentreOfficialRow,
  type Examination,
  type ExaminationCenterListResponse,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const PAGE_SIZE = 50;

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

function exportFilenameBase(exam: Examination | null): string {
  if (!exam) return "exam";
  const parts = [String(exam.year), exam.exam_series?.trim() || "", exam.exam_type.trim()].filter(Boolean);
  const raw = `${exam.id}_${parts.join("_")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || `exam_${exam.id}`;
}

function AdminExamOfficialsContent() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<ExaminationCenterListResponse["items"]>([]);
  const [centerId, setCenterId] = useState<string>("");
  const [items, setItems] = useState<AdminExamCentreOfficialRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<"zip" | "combined" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
        setExamId((cur) => (cur === null && list.length ? list[0]!.id : cur));
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiJson<ExaminationCenterListResponse>("/schools/examination-centers?skip=0&limit=500");
        if (cancelled) return;
        setCenters(data.items);
      } catch {
        if (!cancelled) setCenters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [exams, examId]);

  const loadRows = useCallback(async () => {
    if (examId === null) return;
    setBusy(true);
    setLoadError(null);
    const skip = (page - 1) * PAGE_SIZE;
    try {
      const res = await listAdminExamCentreOfficials({
        examination_id: examId,
        center_id: centerId || null,
        skip,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load officials");
      setItems([]);
      setTotal(0);
    } finally {
      setBusy(false);
    }
  }, [examId, centerId, page]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setPage(1);
  }, [examId, centerId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function onExport(layout: "zip" | "combined") {
    if (examId === null) return;
    setExportBusy(layout);
    setLoadError(null);
    const base = exportFilenameBase(selectedExam);
    const suffix = centerId.trim() ? `_center_${centerId.trim().slice(0, 8)}` : "";
    const filename =
      layout === "zip" ? `${base}${suffix}_officials_by_centre.zip` : `${base}${suffix}_officials_all_centres.xlsx`;
    try {
      await downloadAdminExamCentreOfficialsExport({
        examination_id: examId,
        layout,
        center_id: centerId || null,
        filename,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Official account details</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bank account and contact records for examination officials at each centre. All centres for the selected
          examination. Filter by examination centre, then export as a zip of one workbook per centre or as a single
          workbook with each centre section titled and spaced.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-48 flex-1">
          <label className={formLabelClass} htmlFor="admin-eo-exam">
            Examination
          </label>
          <select
            id="admin-eo-exam"
            className={formInputClass}
            value={examId ?? ""}
            onChange={(e) => setExamId(e.target.value ? Number(e.target.value) : null)}
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.year}
                {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-56 flex-1">
          <label className={formLabelClass} htmlFor="admin-eo-center">
            Examination centre
          </label>
          <select
            id="admin-eo-center"
            className={formInputClass}
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
          >
            <option value="">All centres</option>
            {centers.map((c) => (
              <option key={c.school.id} value={c.school.id}>
                {c.school.code} — {c.school.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnSecondary}
            disabled={examId === null || !!exportBusy}
            onClick={() => void onExport("zip")}
          >
            {exportBusy === "zip" ? "Preparing zip…" : "Export zip (one Excel per centre)"}
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={examId === null || !!exportBusy}
            onClick={() => void onExport("combined")}
          >
            {exportBusy === "combined" ? "Preparing workbook…" : "Export one Excel (all centres)"}
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/30 text-left">
              <th colSpan={3} className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Centre & official
              </th>
              <th
                colSpan={4}
                className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Bank account
              </th>
              <th
                colSpan={2}
                className="border-l border-border/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Contact & duty
              </th>
            </tr>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-3 py-2.5 font-semibold">Centre</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Designation</th>
              <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Bank</th>
              <th className="px-3 py-2.5 font-semibold">Branch</th>
              <th className="px-3 py-2.5 font-semibold">Code</th>
              <th className="px-3 py-2.5 font-semibold">Account no.</th>
              <th className="border-l border-border/60 px-3 py-2.5 font-semibold">Days</th>
              <th className="px-3 py-2.5 font-semibold">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {busy && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
            {!busy && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No account records for this filter.
                </td>
              </tr>
            ) : null}
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs text-muted-foreground" title={row.center_name}>
                  <span className="font-mono text-foreground">{row.center_code}</span>
                  <br />
                  <span className="line-clamp-2">{row.center_name}</span>
                </td>
                <td className="px-3 py-2 font-medium">{row.full_name}</td>
                <td className="px-3 py-2">{row.designation}</td>
                <td className="max-w-[10rem] truncate px-3 py-2" title={row.bank_name}>
                  {row.bank_name}
                </td>
                <td className="max-w-[10rem] truncate px-3 py-2" title={row.branch_name}>
                  {row.branch_name}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{displayBankCode(row.bank_code)}</td>
                <td className="px-3 py-2 font-mono text-xs tabular-nums">{row.account_number}</td>
                <td className="px-3 py-2 tabular-nums">{row.num_days}</td>
                <td className="px-3 py-2 tabular-nums">{row.telephone_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={page <= 1 || busy}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className={btnSecondary}
              disabled={page >= totalPages || busy}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminExamOfficialsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN"]} loginHref="/login/admin">
      <AdminExamOfficialsContent />
    </RoleGuard>
  );
}
