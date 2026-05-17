"use client";

import { useCallback, useEffect, useState } from "react";

import {
  listBankBranches,
  uploadBankBranchesBulk,
  displayBankCode,
  type BankBranchBulkUploadResponse,
  type BankBranchRow,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const btnPrimary =
  "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";
const btnSecondary =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50";

const PAGE_SIZE = 100;

export default function AdminBankDirectoryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BankBranchBulkUploadResponse | null>(null);

  const [bankFilter, setBankFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [debouncedBank, setDebouncedBank] = useState("");
  const [debouncedBranch, setDebouncedBranch] = useState("");
  const [items, setItems] = useState<BankBranchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBank(bankFilter.trim()), 350);
    return () => clearTimeout(t);
  }, [bankFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedBranch(branchFilter.trim()), 350);
    return () => clearTimeout(t);
  }, [branchFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedBank, debouncedBranch]);

  const loadList = useCallback(async () => {
    setListBusy(true);
    setListError(null);
    const skip = (page - 1) * PAGE_SIZE;
    try {
      const res = await listBankBranches({
        bank_name: debouncedBank || undefined,
        branch_name: debouncedBranch || undefined,
        skip,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load bank directory");
      setItems([]);
      setTotal(0);
    } finally {
      setListBusy(false);
    }
  }, [debouncedBank, debouncedBranch, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV or Excel file.");
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await uploadBankBranchesBulk(file);
      setResult(res);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Bank directory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse all uploaded bank branches. Upload a spreadsheet with columns{" "}
          <code className="rounded bg-muted px-1">bank_code</code> (text, up to 32 characters — use text-formatted cells
          in Excel if codes can start with 0), <code className="rounded bg-muted px-1">bank_name</code>, and{" "}
          <code className="rounded bg-muted px-1">branch_name</code>. Headers are normalized (spaces become underscores,
          lowercased). Existing rows with the same <code className="rounded bg-muted px-1">bank_code</code> are updated.
        </p>
      </div>

      <form className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm" onSubmit={(e) => void onUpload(e)}>
        <div>
          <label className={formLabelClass} htmlFor="bank-dir-file">
            File (.csv, .xlsx, .xls)
          </label>
          <input
            id="bank-dir-file"
            type="file"
            accept=".csv,.xlsx,.xls"
            className={formInputClass}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </form>

      {result ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-sm shadow-sm">
          <p className="font-medium text-foreground">Results</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
            <li>Total rows in file: {result.total_rows}</li>
            <li>Successful (unique codes): {result.successful}</li>
            <li>Created: {result.created}</li>
            <li>Updated: {result.updated}</li>
            <li>Parse/validation errors: {result.failed}</li>
          </ul>
          {result.errors.length > 0 ? (
            <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-2 py-1.5">Row</th>
                    <th className="px-2 py-1.5">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((er, i) => (
                    <tr key={`${er.row_number}-${i}`} className="border-b border-border/60">
                      <td className="px-2 py-1.5 tabular-nums">{er.row_number}</td>
                      <td className="px-2 py-1.5">{er.error_message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <div className="min-w-48 flex-1">
            <label className={formLabelClass} htmlFor="bank-filter">
              Filter by bank name
            </label>
            <input
              id="bank-filter"
              className={formInputClass}
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              placeholder="Substring match…"
            />
          </div>
          <div className="min-w-48 flex-1">
            <label className={formLabelClass} htmlFor="branch-filter">
              Filter by branch name
            </label>
            <input
              id="branch-filter"
              className={formInputClass}
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              placeholder="Substring match…"
            />
          </div>
        </div>

        {listError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {listError}
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-3 py-2.5 font-semibold">Bank code</th>
                <th className="px-3 py-2.5 font-semibold">Bank name</th>
                <th className="px-3 py-2.5 font-semibold">Branch name</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {listBusy && items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : null}
              {!listBusy && items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                    No rows match these filters.
                  </td>
                </tr>
              ) : null}
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{displayBankCode(row.bank_code)}</td>
                  <td className="px-3 py-2">{row.bank_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.branch_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p>
            {total === 0 && !listBusy ? (
              "No entries."
            ) : (
              <>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </>
            )}
          </p>
          {totalPages > 1 ? (
            <div className="flex gap-2">
              <button
                type="button"
                className={btnSecondary}
                disabled={page <= 1 || listBusy}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className={btnSecondary}
                disabled={page >= totalPages || listBusy}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
