"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  apiJson,
  displayBankCode,
  downloadAdminExamCentreOfficialsExport,
  listAdminExamCentreOfficials,
  type AdminExamCentreOfficialRow,
  type Examination,
  type ExaminationCenterListResponse,
} from "@/lib/api";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { OfficialAccountsPanelHeader } from "@/components/official-accounts-panel-header";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
  officialAccountsPanelClass,
  officialAccountsPanelFooterClass,
  officialAccountsPanelToolbarClass,
} from "@/lib/official-accounts-zone";

const PAGE_SIZE = 50;

function exportFilenameBase(exam: Examination | null): string {
  if (!exam) return "exam";
  const parts = [String(exam.year), exam.exam_series?.trim() || "", exam.exam_type.trim()].filter(Boolean);
  const raw = `${exam.id}_${parts.join("_")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || `exam_${exam.id}`;
}

function AdminExamOfficialsContent() {
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<ExaminationCenterListResponse["items"]>([]);
  const [centerId, setCenterId] = useState<string>("");
  const [urlHydrated, setUrlHydrated] = useState(false);
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
        if (!urlHydrated) {
          const rawExam = searchParams.get("exam");
          if (rawExam) {
            const n = Number.parseInt(rawExam, 10);
            if (!Number.isNaN(n) && list.some((e) => e.id === n)) {
              setExamId(n);
            } else {
              setExamId(list.length ? list[0]!.id : null);
            }
          } else {
            setExamId(list.length ? list[0]!.id : null);
          }
          const cid = searchParams.get("centerId")?.trim();
          if (cid) setCenterId(cid);
          setUrlHydrated(true);
        } else {
          setExamId((cur) => (cur === null && list.length ? list[0]!.id : cur));
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, urlHydrated]);

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

  const centerOptions = useMemo(
    () =>
      centers.map((c) => ({
        value: c.school.id,
        label: `${c.school.code} — ${c.school.name}`,
      })),
    [centers],
  );

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
      <OfficialAccountsPageIntro description="View and export bank account and contact records for examination officials at each centre." />

      <div className={officialAccountsPanelClass}>
        <div className={officialAccountsPanelToolbarClass}>
          <div className="min-w-48 flex-1 sm:max-w-xs">
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
          <p className={formLabelClass}>Examination centre</p>
          <SearchableCombobox
            options={centerOptions}
            value={centerId}
            onChange={setCenterId}
            placeholder="All centres"
            searchPlaceholder="Code or name…"
            emptyText={centers.length ? "No match." : "No centres."}
            widthClass="w-full min-w-0"
            allOptionLabel="All centres"
            disabled={centers.length === 0}
          />
        </div>
          <div className="flex w-full flex-col gap-2 sm:ml-auto sm:w-auto sm:flex-row">
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={examId === null || !!exportBusy}
              onClick={() => void onExport("zip")}
            >
              {exportBusy === "zip" ? "Preparing…" : "Zip per centre"}
            </button>
            <button
              type="button"
              className={officialAccountsBtnPrimary}
              disabled={examId === null || !!exportBusy}
              onClick={() => void onExport("combined")}
            >
              {exportBusy === "combined" ? "Preparing…" : "Single workbook"}
            </button>
          </div>
        </div>

        {loadError ? (
          <p className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5">
            {loadError}
          </p>
        ) : null}

        <OfficialAccountsPanelHeader count={total} busy={busy} />

        <div className="overflow-x-auto">
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
                <td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-muted-foreground">Loading records…</p>
                </td>
              </tr>
            ) : null}
            {!busy && items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">No records match this filter</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try another centre or examination.</p>
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
          <div className={officialAccountsPanelFooterClass}>
            <p className="text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
              {total.toLocaleString()}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                disabled={page <= 1 || busy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                disabled={page >= totalPages || busy}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminExamOfficialsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <AdminExamOfficialsContent />
    </RoleGuard>
  );
}
