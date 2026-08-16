"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { BankDirectoryTable, BANK_DIRECTORY_DEFAULT_PAGE_SIZE } from "@/components/bank-directory/bank-directory-table";
import { BankDirectoryUploadPanel } from "@/components/bank-directory/bank-directory-upload-panel";
import { BankDirectoryUploadResult } from "@/components/bank-directory/bank-directory-upload-result";
import { OfficialAccountsPageIntro } from "@/components/official-accounts-page-intro";
import { RoleGuard } from "@/components/role-guard";
import {
  getDistinctBankNames,
  listBankBranches,
  uploadBankBranchesBulk,
  type BankBranchBulkUploadResponse,
  type BankBranchRow,
} from "@/lib/api";
import { getMe, type UserMe } from "@/lib/auth";

/** Max branches loaded per bank for client-side filter (API cap). */
const BANK_BRANCH_FETCH_LIMIT = 500;

function BankDirectoryContent() {
  const [me, setMe] = useState<UserMe | null>(null);
  const [uploadOpen, setUploadOpen] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BankBranchBulkUploadResponse | null>(null);

  const [selectedBankName, setSelectedBankName] = useState("");
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [bankOptions, setBankOptions] = useState<{ value: string; label: string }[]>([]);
  const [branchQuery, setBranchQuery] = useState("");

  const [items, setItems] = useState<BankBranchRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(BANK_DIRECTORY_DEFAULT_PAGE_SIZE);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const canUpload = me?.role === "SUPER_ADMIN";

  useEffect(() => {
    void getMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        try {
          const names = await getDistinctBankNames(bankSearchQuery.trim() || null);
          setBankOptions(names.map((n) => ({ value: n, label: n })));
        } catch {
          setBankOptions([]);
        }
      })();
    }, 250);
    return () => clearTimeout(t);
  }, [bankSearchQuery]);

  const bankComboboxOptions = useMemo(() => {
    if (!selectedBankName.trim()) return bankOptions;
    if (bankOptions.some((o) => o.value === selectedBankName)) return bankOptions;
    return [{ value: selectedBankName, label: selectedBankName }, ...bankOptions];
  }, [bankOptions, selectedBankName]);

  const loadBranchesForBank = useCallback(async (bankName: string) => {
    if (!bankName.trim()) {
      setItems([]);
      setListBusy(false);
      setListError(null);
      return;
    }
    setListBusy(true);
    setListError(null);
    try {
      const res = await listBankBranches({
        bank_name_exact: bankName.trim(),
        skip: 0,
        limit: BANK_BRANCH_FETCH_LIMIT,
      });
      setItems(res.items);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load branches");
      setItems([]);
    } finally {
      setListBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBranchesForBank(selectedBankName);
  }, [loadBranchesForBank, selectedBankName]);

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
      await loadBranchesForBank(selectedBankName);
      try {
        const names = await getDistinctBankNames(bankSearchQuery.trim() || null);
        setBankOptions(names.map((n) => ({ value: n, label: n })));
      } catch {
        /* ignore */
      }
      if (!selectedBankName.trim() && res.successful > 0) {
        setUploadOpen(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <OfficialAccountsPageIntro
        description={
          canUpload
            ? "Pick a bank to see its branches and sort codes. You can also upload a spreadsheet to add or update entries in bulk."
            : "Pick a bank to see its branches, then type a name or sort code to find the one you need."
        }
        footerNote={
          canUpload ? (
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
          ) : undefined
        }
      />

      {canUpload ? (
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
      ) : null}

      {canUpload && result ? (
        <BankDirectoryUploadResult result={result} onDismiss={() => setResult(null)} />
      ) : null}

      {listError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          {listError}
        </p>
      ) : null}

      <BankDirectoryTable
        items={items}
        busy={listBusy}
        selectedBankName={selectedBankName}
        onSelectedBankNameChange={setSelectedBankName}
        bankOptions={bankComboboxOptions}
        onBankSearchChange={setBankSearchQuery}
        branchQuery={branchQuery}
        onBranchQueryChange={setBranchQuery}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

export default function AdminBankDirectoryPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <BankDirectoryContent />
    </RoleGuard>
  );
}
