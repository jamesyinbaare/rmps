"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Pencil } from "lucide-react";

import { SearchableCombobox } from "@/components/searchable-combobox";
import {
  FormSection,
  OfficialModal,
  officialModalFooterClass,
} from "@/components/official-modal";
import { Button } from "@/components/ui/button";
import {
  displayBankCode,
  getPublicDistinctBankNames,
  getPublicExaminerBankAccount,
  listPublicBankBranches,
  upsertPublicExaminerBankAccount,
  type BankBranchRow,
  type ExaminerBankAccountPublic,
  type ExaminerInvitationPublic,
} from "@/lib/api";
import {
  accountInputMaxLengthForEdit,
  accountValidationMessage,
  getAccountFieldCopy,
  isValidAccountInput,
  resolveBankKind,
  splitAbsaAccountForDisplay,
} from "@/lib/exam-official-account";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  officialAccountsBtnPrimary,
  officialAccountsBtnSecondary,
} from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

const FORM_ID = "examiner-bank-account-form";

type Props = {
  token: string;
  invitation: ExaminerInvitationPublic;
  className?: string;
  onSaved?: () => void;
};

function preventClipboardInsert(e: React.ClipboardEvent | React.DragEvent) {
  e.preventDefault();
}

function maskAccountNumber(n: string): string {
  const t = n.trim();
  if (t.length <= 4) return t;
  return `•••••••${t.slice(-4)}`;
}

function accountDisplayValue(row: ExaminerBankAccountPublic): string {
  return resolveBankKind(row.bank_name) === "absa"
    ? splitAbsaAccountForDisplay(row.account_number, row.bank_code)
    : row.account_number;
}

export function ExaminerBankAccountForm({ token, invitation, className, onSaved }: Props) {
  const bankDetailsAvailable = invitation.bank_details_available === true;
  const bankPendingMessage = invitation.bank_details_pending_message;
  const formId = useId();
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const titleId = `${formId}-modal-title`;
  const subtitleId = `${formId}-modal-subtitle`;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<ExaminerBankAccountPublic | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editBankOpen, setEditBankOpen] = useState(true);
  const [editAccountOpen, setEditAccountOpen] = useState(true);

  const [bankNameQuery, setBankNameQuery] = useState("");
  const [bankNameSuggestions, setBankNameSuggestions] = useState<string[]>([]);
  const [selectedBankName, setSelectedBankName] = useState("");
  const [branchRows, setBranchRows] = useState<BankBranchRow[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountConfirm, setAccountConfirm] = useState("");

  const editing = saved !== null;

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setCardError(null);
    try {
      const row = await getPublicExaminerBankAccount(token);
      setSaved(row);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : "Could not load bank details");
      setSaved(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    async function run() {
      if (!bankNameQuery.trim()) {
        setBankNameSuggestions([]);
        return;
      }
      try {
        const names = await getPublicDistinctBankNames(token, bankNameQuery.trim());
        if (!cancelled) setBankNameSuggestions(names);
      } catch {
        if (!cancelled) setBankNameSuggestions([]);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [bankNameQuery, modalOpen, token]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    async function run() {
      if (!selectedBankName.trim()) {
        setBranchRows([]);
        return;
      }
      setBranchesLoading(true);
      try {
        const res = await listPublicBankBranches(token, {
          bank_name_exact: selectedBankName.trim(),
          limit: 500,
        });
        if (!cancelled) setBranchRows(res.items);
      } catch {
        if (!cancelled) setBranchRows([]);
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, selectedBankName, token]);

  function scrollModalToTop() {
    requestAnimationFrame(() => {
      modalScrollRef.current?.scrollTo(0, 0);
    });
  }

  function populateFormFromSaved(row: ExaminerBankAccountPublic) {
    setEditBankOpen(false);
    setEditAccountOpen(false);
    setSelectedBankName(row.bank_name);
    setBankNameQuery(row.bank_name);
    setSelectedBranchId(row.bank_branch_id);
    const acct = accountDisplayValue(row);
    setAccountNumber(acct);
    setAccountConfirm(acct);
  }

  function resetFormForAdd() {
    setEditBankOpen(true);
    setEditAccountOpen(true);
    setBankNameQuery("");
    setBankNameSuggestions([]);
    setSelectedBankName("");
    setBranchRows([]);
    setBranchesLoading(false);
    setSelectedBranchId("");
    setAccountNumber("");
    setAccountConfirm("");
  }

  function openModal() {
    setFormError(null);
    if (saved) {
      populateFormFromSaved(saved);
    } else {
      resetFormForAdd();
    }
    setModalOpen(true);
    scrollModalToTop();
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
    setFormError(null);
  }

  const accountFieldCopy = getAccountFieldCopy(selectedBankName, editing);
  const accountMaxLen = editing
    ? accountInputMaxLengthForEdit(selectedBankName)
    : accountFieldCopy.targetLen;

  const acctLen = accountNumber.replace(/\D/g, "").length;
  const acctConfirmLen = accountConfirm.replace(/\D/g, "").length;
  const acctValid = isValidAccountInput(accountNumber, selectedBankName, {
    forUpdate: editing,
  });
  const acctMatch =
    acctValid &&
    accountNumber.trim() === accountConfirm.trim() &&
    accountConfirm.trim().length > 0;

  const bankComboboxOptions = useMemo(
    () => bankNameSuggestions.map((n) => ({ value: n, label: n })),
    [bankNameSuggestions],
  );

  const branchComboboxOptions = useMemo(
    () =>
      branchRows.map((b) => ({
        value: b.id,
        label: `${b.branch_name} (${displayBankCode(b.bank_code)})`,
      })),
    [branchRows],
  );

  const selectedBranchLabel =
    branchComboboxOptions.find((o) => o.value === selectedBranchId)?.label ??
    (saved && selectedBranchId === saved.bank_branch_id
      ? `${saved.branch_name} (${displayBankCode(saved.bank_code)})`
      : "");

  const showBankFields = !editing || editBankOpen;
  const showAccountFields = !editing || editAccountOpen;

  const branchSelectHint = !selectedBankName.trim()
    ? "Choose a bank name first."
    : branchesLoading
      ? "Loading branches…"
      : branchRows.length === 0
        ? "No branches found for this bank name."
        : "Select branch…";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!selectedBranchId.trim()) {
      setFormError("Select a bank and branch.");
      return;
    }
    if (!isValidAccountInput(accountNumber, selectedBankName, { forUpdate: editing })) {
      setFormError(accountValidationMessage(selectedBankName, editing));
      return;
    }
    if (accountNumber.trim() !== accountConfirm.trim()) {
      setFormError("Account number and confirmation do not match.");
      return;
    }

    setBusy(true);
    try {
      const row = await upsertPublicExaminerBankAccount(token, {
        bank_branch_id: selectedBranchId.trim(),
        account_number: accountNumber.trim(),
      });
      setSaved(row);
      setModalOpen(false);
      setSuccessMessage(
        editing ? "Your bank details have been updated." : "Your bank details have been saved.",
      );
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-5 animate-pulse space-y-3 rounded-2xl border border-border/70 bg-card/90 p-4">
        <div className="h-5 w-40 rounded bg-muted" />
        <div className="h-16 rounded bg-muted/80" />
        <div className="h-11 rounded bg-muted/60" />
      </div>
    );
  }

  return (
    <>
      <section
        className={cn(
          "mt-5 rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm sm:p-5",
          className,
        )}
        aria-labelledby={`${formId}-card-title`}
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={`${formId}-card-title`} className="text-base font-semibold text-foreground">
              Bank account for allowances
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {saved
                ? "Your allowance will be paid to the account below. You can update it anytime."
                : "Add the bank account where your examiner allowance should be paid."}
            </p>
          </div>
        </div>

        {bankPendingMessage && !bankDetailsAvailable ? (
          <p
            className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-foreground"
            role="status"
          >
            {bankPendingMessage}
          </p>
        ) : null}

        {cardError ? (
          <p
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {cardError}
          </p>
        ) : null}

        {successMessage ? (
          <p
            className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-foreground"
            role="status"
          >
            {successMessage}
          </p>
        ) : null}

        {saved ? (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3">
            <p className="text-sm font-medium text-foreground">{saved.bank_name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {saved.branch_name} ({displayBankCode(saved.bank_code)})
            </p>
            <p className="mt-2 font-mono text-sm tabular-nums text-foreground">
              {maskAccountNumber(saved.account_number)}
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-muted/10 px-3.5 py-4 text-center">
            <p className="text-sm text-muted-foreground">No bank details on file yet.</p>
          </div>
        )}

        <Button
          type="button"
          className="mt-4 min-h-11 w-full"
          onClick={openModal}
          disabled={busy || !bankDetailsAvailable}
        >
          {saved ? (
            <>
              <Pencil className="mr-2 size-4" aria-hidden />
              Update bank details
            </>
          ) : (
            "Add bank details"
          )}
        </Button>
      </section>

      {modalOpen ? (
        <OfficialModal
          title={editing ? "Update bank details" : "Add bank details"}
          subtitle={invitation.examination_name}
          titleId={titleId}
          subtitleId={subtitleId}
          onRequestClose={closeModal}
          formError={formError}
          scrollRef={modalScrollRef}
          focusNameOnMount={false}
          footer={
            <div className={officialModalFooterClass()}>
              <button
                type="button"
                className={officialAccountsBtnSecondary}
                onClick={closeModal}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                form={FORM_ID}
                className={`${officialAccountsBtnPrimary} min-h-11 w-full shrink-0 sm:min-h-10 sm:w-auto`}
                disabled={busy}
              >
                {busy ? "Saving…" : editing ? "Save changes" : "Save bank details"}
              </button>
            </div>
          }
        >
          <form
            id={FORM_ID}
            className="space-y-6 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-6 md:space-y-0"
            onSubmit={(e) => void onSubmit(e)}
          >
            <FormSection title="Official">
              <div className="md:col-span-2">
                <label className={formLabelClass} htmlFor={`${formId}-name`}>
                  Full name
                </label>
                <input
                  id={`${formId}-name`}
                  className={`${formInputClass} bg-muted/40`}
                  value={invitation.invitee_name}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor={`${formId}-phone`}>
                  Phone number
                </label>
                <input
                  id={`${formId}-phone`}
                  className={`${formInputClass} bg-muted/40`}
                  value={invitation.phone_number}
                  readOnly
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className={formLabelClass} htmlFor={`${formId}-designation`}>
                  Designation
                </label>
                <input
                  id={`${formId}-designation`}
                  className={`${formInputClass} bg-muted/40`}
                  value={invitation.examiner_type_label}
                  readOnly
                  tabIndex={-1}
                />
              </div>
            </FormSection>

            <FormSection title="Bank account details" description={accountFieldCopy.description}>
              {editing && !editBankOpen ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">
                    Bank and branch are hidden until you choose to update them.
                  </p>
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{selectedBankName}</span>
                    {selectedBranchLabel ? (
                      <>
                        <span className="text-muted-foreground"> · </span>
                        {selectedBranchLabel}
                      </>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => setEditBankOpen(true)}
                  >
                    Change bank details
                  </button>
                </div>
              ) : null}

              {showBankFields ? (
                <>
                  <div className="md:col-span-2">
                    <label className={formLabelClass} id={`${formId}-bank-label`}>
                      Bank name
                    </label>
                    <p className="mb-1.5 text-xs text-muted-foreground">Search and select your bank.</p>
                    <SearchableCombobox
                      options={bankComboboxOptions}
                      value={selectedBankName}
                      onChange={(name) => {
                        setSelectedBankName(name);
                        setBankNameQuery(name);
                        setSelectedBranchId("");
                        setAccountNumber("");
                        setAccountConfirm("");
                        setFormError(null);
                      }}
                      onSearchChange={(q) => {
                        setBankNameQuery(q);
                        if (!q.trim()) {
                          setSelectedBankName("");
                          setSelectedBranchId("");
                        }
                      }}
                      placeholder="Search banks…"
                      searchPlaceholder="Type bank name…"
                      emptyText={bankNameQuery.trim() ? "No banks found." : "Type to search banks."}
                      widthClass="w-full"
                      showAllOption={false}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={formLabelClass} id={`${formId}-branch-label`}>
                      Branch (for this bank)
                    </label>
                    <SearchableCombobox
                      options={branchComboboxOptions}
                      value={selectedBranchId}
                      onChange={(id) => {
                        setSelectedBranchId(id);
                        if (resolveBankKind(selectedBankName) === "absa") {
                          setAccountNumber("");
                          setAccountConfirm("");
                        }
                      }}
                      placeholder={branchSelectHint}
                      searchPlaceholder="Search branches…"
                      emptyText={
                        !selectedBankName.trim()
                          ? "Choose a bank first."
                          : branchesLoading
                            ? "Loading…"
                            : "No branches found."
                      }
                      widthClass="w-full"
                      showAllOption={false}
                      disabled={!selectedBankName.trim() || branchesLoading || branchRows.length === 0}
                    />
                    {branchesLoading ? (
                      <p className="mt-1 text-xs text-muted-foreground">Loading branch list…</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {editing && !editAccountOpen ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border border-border bg-muted/20 px-3 py-3">
                  <p className="text-xs text-muted-foreground">
                    Account number is hidden until you choose to update it.
                  </p>
                  <p className="font-mono text-sm text-foreground">{maskAccountNumber(accountNumber)}</p>
                  <button
                    type="button"
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setEditAccountOpen(true);
                      setAccountNumber("");
                      setAccountConfirm("");
                    }}
                  >
                    Change account number
                  </button>
                </div>
              ) : null}

              {showAccountFields ? (
                <>
                  <div>
                    <label className={formLabelClass} htmlFor={`${formId}-acct`}>
                      {accountFieldCopy.label}
                    </label>
                    <input
                      id={`${formId}-acct`}
                      className={`${formInputClass} font-mono tracking-wide`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={accountNumber}
                      onChange={(e) =>
                        setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, accountMaxLen))
                      }
                      enterKeyHint="next"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {acctLen}/{accountMaxLen} digits
                      {accountFieldCopy.helper ? ` · ${accountFieldCopy.helper}` : ""}
                      {acctValid ? " · format OK" : acctLen > 0 && acctLen < accountMaxLen ? " · keep typing" : ""}
                    </p>
                  </div>
                  <div>
                    <label className={formLabelClass} htmlFor={`${formId}-acct2`}>
                      Confirm account number
                    </label>
                    <input
                      id={`${formId}-acct2`}
                      className={`${formInputClass} font-mono tracking-wide`}
                      inputMode="numeric"
                      autoComplete="off"
                      value={accountConfirm}
                      onChange={(e) =>
                        setAccountConfirm(e.target.value.replace(/\D/g, "").slice(0, accountMaxLen))
                      }
                      onPaste={preventClipboardInsert}
                      onDrop={preventClipboardInsert}
                      enterKeyHint="done"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Re-type this value
                      {acctConfirmLen > 0 ? (
                        <span className={acctMatch ? " text-success" : " text-destructive"}>
                          {acctMatch ? " · matches confirmation" : " · does not match confirmation"}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </>
              ) : null}
            </FormSection>
          </form>
        </OfficialModal>
      ) : null}
    </>
  );
}
