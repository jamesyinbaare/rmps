"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Search } from "lucide-react";

import { ExaminerAllowanceBreakdownCell } from "@/components/examiner-allowance-breakdown";
import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  apiJson,
  downloadAdminExaminerAllowancesBogExport,
  downloadAdminExaminerAllowancesExport,
  listAdminExaminerAllowances,
  listAllSubjects,
  type AdminExaminerAllowanceRow,
  type Examination,
  type Subject,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { formatExamLabel } from "@/lib/examiner-rates-draft";
import { officialAccountsBtnSecondary, officialAccountsPanelClass } from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

function formatExaminationLabel(x: Examination): string {
  return `${x.exam_type} ${x.year}${x.exam_series ? ` (${x.exam_series})` : ""} — #${x.id}`;
}

function ExaminerPayoutsContent() {
  const [exams, setExams] = useState<Examination[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [role, setRole] = useState("");
  const [region, setRegion] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminExaminerAllowanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"detail" | "bog" | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [examList, subjectList] = await Promise.all([
          apiJson<Examination[]>("/examinations"),
          listAllSubjects(),
        ]);
        setExams(examList);
        setSubjects(subjectList);
        if (examList.length > 0) setExamId(examList[0]!.id);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Failed to load examinations.");
      }
    })();
  }, []);

  const examOptions = useMemo(
    () => exams.map((e) => ({ value: String(e.id), label: formatExaminationLabel(e) })),
    [exams],
  );

  const subjectOptions = useMemo(
    () => [
      { value: "", label: "All subjects" },
      ...subjects.map((s) => ({
        value: String(s.id),
        label: `${s.original_code || s.code} — ${s.name}`,
      })),
    ],
    [subjects],
  );

  const loadRows = useCallback(async () => {
    if (examId == null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listAdminExaminerAllowances({
        examination_id: examId,
        role: role || null,
        region: region || null,
        subject_id: subjectId ? Number.parseInt(subjectId, 10) : null,
        search: search.trim() || null,
        limit: PAGE_SIZE,
      });
      setRows(data.items);
      setTotal(data.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load examiner payouts.");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [examId, role, region, subjectId, search]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const selectedExam = exams.find((e) => e.id === examId) ?? null;

  async function handleExport(kind: "detail" | "bog") {
    if (examId == null || !selectedExam) return;
    setExportBusy(kind);
    try {
      const base = formatExamLabel(selectedExam).replace(/\s+/g, "_");
      if (kind === "detail") {
        await downloadAdminExaminerAllowancesExport({
          examination_id: examId,
          role: role || null,
          region: region || null,
          subject_id: subjectId ? Number.parseInt(subjectId, 10) : null,
          search: search.trim() || null,
          filename: `${base}_examiner_allowances.xlsx`,
        });
      } else {
        await downloadAdminExaminerAllowancesBogExport({
          examination_id: examId,
          role: role || null,
          region: region || null,
          subject_id: subjectId ? Number.parseInt(subjectId, 10) : null,
          search: search.trim() || null,
          filename: `${base}_examiner_bog.xlsx`,
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <OfficialAccountsPageIntro description="Review computed examiner allowances, bank details, and export payment files." />

      <div className={cn(officialAccountsPanelClass, "p-4 sm:p-5")}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className={formLabelClass}>Examination</label>
            <SearchableCombobox
              options={examOptions}
              value={examId != null ? String(examId) : ""}
              onChange={(v) => setExamId(v ? Number.parseInt(v, 10) : null)}
              placeholder="Select examination"
            />
          </div>
          <div>
            <label className={formLabelClass}>Role</label>
            <select
              className={formInputClass}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="">All roles</option>
              {EXAMINER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={formLabelClass}>Region</label>
            <select
              className={formInputClass}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="">All regions</option>
              {REGION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={formLabelClass}>Subject</label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectId}
              onChange={setSubjectId}
              placeholder="All subjects"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-md flex-1">
            <label className={formLabelClass} htmlFor="examiner-payouts-search">
              Search
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="examiner-payouts-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(formInputClass, "pl-9")}
                placeholder="Name or phone"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={examId == null || exportBusy != null}
              onClick={() => void handleExport("detail")}
            >
              {exportBusy === "detail" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
              Export Excel
            </button>
            <button
              type="button"
              className={officialAccountsBtnSecondary}
              disabled={examId == null || exportBusy != null}
              onClick={() => void handleExport("bog")}
            >
              {exportBusy === "bog" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileDown className="mr-2 size-4" />}
              BoG export
            </button>
          </div>
        </div>

        {loadError ? <p className="mt-4 text-sm text-destructive">{loadError}</p> : null}

        <p className="mt-4 text-sm text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} shown of ${total} examiner${total === 1 ? "" : "s"}`}
        </p>

        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2.5 font-semibold">Name</th>
                <th className="px-3 py-2.5 font-semibold">Role</th>
                <th className="px-3 py-2.5 font-semibold">Region</th>
                <th className="px-3 py-2.5 font-semibold">Subjects</th>
                <th className="px-3 py-2.5 font-semibold text-right">Scripts</th>
                <th className="px-3 py-2.5 font-semibold text-right">Total</th>
                <th className="px-3 py-2.5 font-semibold">Bank</th>
                <th className="px-3 py-2.5 font-semibold">Account</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">
                    No examiners match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2.5 font-medium">{row.full_name}</td>
                    <td className="px-3 py-2.5">{EXAMINER_TYPE_OPTIONS.find((o) => o.value === row.examiner_type)?.label ?? row.examiner_type}</td>
                    <td className="px-3 py-2.5">{row.region}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5" title={row.subject_names}>
                      {row.subject_codes || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.total_allocated_scripts}</td>
                    <td className="px-3 py-2.5 text-right">
                      <ExaminerAllowanceBreakdownCell row={row} examinerName={row.full_name} />
                    </td>
                    <td className="px-3 py-2.5">{row.bank_name ?? "—"}</td>
                    <td className="px-3 py-2.5 tabular-nums">{row.account_number ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ExaminerPayoutsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <ExaminerPayoutsContent />
    </RoleGuard>
  );
}
