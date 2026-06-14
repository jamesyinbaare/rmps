"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { BankDirectoryTable, BANK_DIRECTORY_DEFAULT_PAGE_SIZE } from "@/components/bank-directory/bank-directory-table";
import { BankDirectoryUploadPanel } from "@/components/bank-directory/bank-directory-upload-panel";
import { BankDirectoryUploadResult } from "@/components/bank-directory/bank-directory-upload-result";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import {
  listBankBranches,
  uploadBankBranchesBulk,
  type BankBranchBulkUploadResponse,
  type BankBranchRow,
} from "@/lib/api";

export default function AdminBankDirectoryPage() {
  const [uploadOpen, setUploadOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BankBranchBulkUploadResponse | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [items, setItems] = useState<BankBranchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(BANK_DIRECTORY_DEFAULT_PAGE_SIZE);
  const [listBusy, setListBusy] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const loadList = useCallback(async () => {
    setListBusy(true);
    setListError(null);
    const skip = (page - 1) * pageSize;
    try {
      const res = await listBankBranches({
        search: debouncedSearch || undefined,
        skip,
        limit: pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
      if (res.total === 0 && !debouncedSearch) {
        setUploadOpen(true);
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load bank directory");
      setItems([]);
      setTotal(0);
    } finally {
      setListBusy(false);
    }
  }, [debouncedSearch, page, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function onUpload() {
    if (!file) {
      setError("Choose a CSV or Excel file first.");
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await uploadBankBranchesBulk(file);
      setResult(res);
      setFile(null);
      if (res.failed === 0) {
        setUploadOpen(false);
      }
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <OfficialAccountsPageIntro
        description="The bank directory powers branch pickers when examiners and officials enter their account details. Search below to find a branch, or upload a spreadsheet to add or update entries in bulk."
        footerNote={
          <span className="flex items-start gap-2.5">
            <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              <span className="font-medium text-foreground">Spreadsheet format. </span>
              Include three columns:{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">bank_code</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">bank_name</code>, and{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">branch_name</code>. Headers can use spaces
              or underscores — they are normalised automatically. Format bank codes as{" "}
              <strong className="font-medium text-foreground">text</strong> in Excel so leading zeros are kept. Rows
              with an existing bank code are updated rather than duplicated.
            </span>
          </span>
        }
      />

      <BankDirectoryUploadPanel
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        file={file}
        onFileChange={(next) => {
          setFile(next);
          setError(null);
        }}
        busy={busy}
        error={error}
        onSubmit={() => void onUpload()}
      />

      {result ? <BankDirectoryUploadResult result={result} onDismiss={() => setResult(null)} /> : null}

      {listError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {listError}
        </p>
      ) : null}

      <BankDirectoryTable
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        busy={listBusy}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
