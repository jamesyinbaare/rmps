"use client";

import { SearchableCombobox } from "@/components/searchable-combobox";
import { FormSection, OfficialModal, officialModalFooterClass } from "@/components/official-modal";
import { EXAMINER_TYPE_OPTIONS } from "@/components/examiner-invitations/constants";
import { InvitationModalShell } from "@/components/examiner-invitations/invitation-modal-shell";
import type { ExaminerBulkImportResponse } from "@/lib/allocation-examiners-upload";
import type { ExaminerTypeApi } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { officialAccountsBtnPrimary, officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";

const FORM_ID = "roster-examiner-form";

type Option = { value: string; label: string };

type ExaminerFormModalProps = {
  open: boolean;
  editing: boolean;
  busy: boolean;
  error: string | null;
  name: string;
  phone: string;
  examinerType: ExaminerTypeApi;
  subjectId: string;
  region: string;
  subjectOptions: Option[];
  regionOptions: Option[];
  onClose: () => void;
  onSubmit: () => void;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onExaminerTypeChange: (v: ExaminerTypeApi) => void;
  onSubjectIdChange: (v: string) => void;
  onRegionChange: (v: string) => void;
};

export function RosterExaminerFormModal({
  open,
  editing,
  busy,
  error,
  name,
  phone,
  examinerType,
  subjectId,
  region,
  subjectOptions,
  regionOptions,
  onClose,
  onSubmit,
  onNameChange,
  onPhoneChange,
  onExaminerTypeChange,
  onSubjectIdChange,
  onRegionChange,
}: ExaminerFormModalProps) {
  if (!open) return null;

  return (
    <OfficialModal
      title={editing ? "Edit examiner" : "Add examiner"}
      subtitle="One subject per examiner. Region is the examiner's home region."
      titleId="roster-examiner-modal-title"
      subtitleId="roster-examiner-modal-subtitle"
      onRequestClose={onClose}
      formError={error}
      focusNameOnMount
      initialFocusSelector="#roster-name"
      footer={
        <div className={officialModalFooterClass()}>
          <button type="button" className={officialAccountsBtnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className={`${officialAccountsBtnPrimary} min-h-11 w-full shrink-0 sm:min-h-10 sm:w-auto`}
            disabled={busy}
          >
            {busy ? "Saving…" : editing ? "Save changes" : "Add examiner"}
          </button>
        </div>
      }
    >
      <form
        id={FORM_ID}
        className="space-y-6 md:grid md:grid-cols-2 md:gap-x-4 md:gap-y-6 md:space-y-0"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <FormSection title="Examiner">
          <div className="md:col-span-2">
            <label className={formLabelClass} htmlFor="roster-name">
              Full name
            </label>
            <input
              id="roster-name"
              className={formInputClass}
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="roster-phone">
              Phone number
            </label>
            <input
              id="roster-phone"
              className={formInputClass}
              inputMode="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="e.g. 0551234567"
              required
            />
          </div>
          <div>
            <label className={formLabelClass} htmlFor="roster-type">
              Role
            </label>
            <select
              id="roster-type"
              className={formInputClass}
              value={examinerType}
              onChange={(e) => onExaminerTypeChange(e.target.value as ExaminerTypeApi)}
            >
              {EXAMINER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={formLabelClass} id="roster-subject-label">
              Subject
            </label>
            <SearchableCombobox
              options={subjectOptions}
              value={subjectId}
              onChange={onSubjectIdChange}
              placeholder="Select subject…"
              searchPlaceholder="Search subject…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
          <div className="md:col-span-2">
            <label className={formLabelClass} id="roster-region-label">
              Region
            </label>
            <p className="mb-1.5 text-xs text-muted-foreground">Required — examiner&apos;s home region.</p>
            <SearchableCombobox
              options={regionOptions}
              value={region}
              onChange={onRegionChange}
              placeholder="Select region…"
              searchPlaceholder="Search region…"
              widthClass="w-full"
              showAllOption={false}
            />
          </div>
        </FormSection>
      </form>
    </OfficialModal>
  );
}

type BulkUploadModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  result: ExaminerBulkImportResponse | null;
  onClose: () => void;
  onDownloadTemplate: () => void;
  onFileSelected: (file: File) => void;
};

export function RosterBulkUploadModal({
  open,
  busy,
  error,
  result,
  onClose,
  onDownloadTemplate,
  onFileSelected,
}: BulkUploadModalProps) {
  if (!open) return null;

  return (
    <InvitationModalShell
      title="Bulk upload roster"
      titleId="roster-bulk-upload-title"
      onClose={onClose}
      canClose={!busy}
      footer={
        <button type="button" className={officialAccountsBtnSecondary} onClick={onClose} disabled={busy}>
          {result ? "Close" : "Cancel"}
        </button>
      }
    >
      <p className="text-xs text-muted-foreground">
        CSV or XLSX with columns: <span className="font-mono">name</span>,{" "}
        <span className="font-mono">subject_code</span>, <span className="font-mono">examiner_type</span>,{" "}
        <span className="font-mono">region</span>, <span className="font-mono">phone_number</span>.
      </p>
      <div className="mt-3">
        <button type="button" className={officialAccountsBtnSecondary} disabled={busy} onClick={onDownloadTemplate}>
          Download Excel template
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-4">
        <input
          type="file"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={busy}
          className="text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFileSelected(f);
          }}
        />
      </div>
      {result ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">Created {result.created_count} examiner(s).</p>
          {result.errors.length ? (
            <ul className="mt-2 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive">
              {result.errors.map((err, i) => (
                <li key={`${err.row_number}-${i}`}>
                  Row {err.row_number}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </InvitationModalShell>
  );
}
