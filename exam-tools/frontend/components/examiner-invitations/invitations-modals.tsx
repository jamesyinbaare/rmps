"use client";

import { useRef } from "react";

import {
  EXAMINER_TYPE_OPTIONS,
  INPUT_FOCUS_RING,
  SMS_PLACEHOLDER_TOKENS,
} from "@/components/examiner-invitations/constants";
import { InvitationModalShell } from "@/components/examiner-invitations/invitation-modal-shell";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { Button } from "@/components/ui/button";
import type {
  ExaminerInvitationBulkImportResponse,
  ExaminerTypeApi,
} from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { cn } from "@/lib/utils";

type ComboboxOption = { value: string; label: string };

export type InviteModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  name: string;
  phone: string;
  subjectId: string;
  examinerType: ExaminerTypeApi;
  region: string;
  responseDeadlineInput: string;
  coordinationDateInput: string;
  sendSms: boolean;
  subjectOptions: ComboboxOption[];
  regionOptions: ComboboxOption[];
  onClose: () => void;
  onSubmit: () => void;
  onNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onSubjectIdChange: (v: string) => void;
  onExaminerTypeChange: (v: ExaminerTypeApi) => void;
  onRegionChange: (v: string) => void;
  onResponseDeadlineChange: (v: string) => void;
  onCoordinationDateChange: (v: string) => void;
  onSendSmsChange: (v: boolean) => void;
};

export function InviteExaminerModal(props: InviteModalProps) {
  if (!props.open) return null;
  return (
    <InvitationModalShell
      title="Invite examiner"
      titleId="ei-invite-title"
      canClose={!props.busy}
      onClose={props.onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={props.busy} onClick={props.onSubmit}>
            {props.busy ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground">One subject per invitation.</p>
      {props.error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
      <div className="mt-4 space-y-4">
        <div>
          <label className={formLabelClass} htmlFor="ei-name">
            Name
          </label>
          <input
            id="ei-name"
            className={cn(formInputClass, "mt-1")}
            value={props.name}
            disabled={props.busy}
            onChange={(e) => props.onNameChange(e.target.value)}
          />
        </div>
        <div>
          <label className={formLabelClass} htmlFor="ei-phone">
            Phone number
          </label>
          <input
            id="ei-phone"
            className={cn(formInputClass, "mt-1")}
            value={props.phone}
            disabled={props.busy}
            placeholder="e.g. 0551234567"
            onChange={(e) => props.onPhoneChange(e.target.value)}
          />
        </div>
        <div>
          <p className={formLabelClass}>Subject</p>
          <div className="mt-1">
            <SearchableCombobox
              options={props.subjectOptions}
              value={props.subjectId}
              onChange={props.onSubjectIdChange}
              placeholder="Select subject"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
              disabled={props.busy}
            />
          </div>
        </div>
        <div>
          <label className={formLabelClass} htmlFor="ei-type">
            Examiner type
          </label>
          <select
            id="ei-type"
            className={cn(formInputClass, "mt-1")}
            value={props.examinerType}
            disabled={props.busy}
            onChange={(e) => props.onExaminerTypeChange(e.target.value as ExaminerTypeApi)}
          >
            {EXAMINER_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className={formLabelClass}>Region</p>
          <div className="mt-1">
            <SearchableCombobox
              options={props.regionOptions}
              value={props.region}
              onChange={props.onRegionChange}
              placeholder="Select region"
              searchPlaceholder="Search…"
              widthClass="w-full"
              showAllOption={false}
              disabled={props.busy}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={formLabelClass} htmlFor="ei-deadline">
              Respond by
            </label>
            <input
              id="ei-deadline"
              type="datetime-local"
              required
              className={cn(formInputClass, "mt-1")}
              value={props.responseDeadlineInput}
              disabled={props.busy}
              onChange={(e) => props.onResponseDeadlineChange(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Required — last date/time the invitee can accept or decline.
            </p>
          </div>
          <div>
            <label className={formLabelClass} htmlFor="ei-coordination">
              Coordination date
            </label>
            <input
              id="ei-coordination"
              type="date"
              className={cn(formInputClass, "mt-1")}
              value={props.coordinationDateInput}
              disabled={props.busy}
              onChange={(e) => props.onCoordinationDateChange(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Optional — can be set later when coordination is scheduled for this group.
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.sendSms}
            disabled={props.busy}
            onChange={(e) => props.onSendSmsChange(e.target.checked)}
          />
          Send invitation by SMS
        </label>
      </div>
    </InvitationModalShell>
  );
}

export type BulkUploadModalProps = {
  open: boolean;
  busy: boolean;
  examId: number | null;
  error: string | null;
  result: ExaminerInvitationBulkImportResponse | null;
  bulkFile: File | null;
  sendSmsOnBulk: boolean;
  bulkResponseDeadlineInput: string;
  bulkCoordinationDateInput: string;
  onClose: () => void;
  onSubmit: () => void;
  onDownloadTemplate: () => void;
  onFileChange: (file: File | null) => void;
  onSendSmsOnBulkChange: (v: boolean) => void;
  onBulkResponseDeadlineChange: (v: string) => void;
  onBulkCoordinationDateChange: (v: string) => void;
};

export function BulkUploadModal(props: BulkUploadModalProps) {
  if (!props.open) return null;
  return (
    <InvitationModalShell
      title="Bulk upload invitations"
      titleId="ei-upload-title"
      canClose={!props.busy}
      onClose={props.onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onClose}>
            {props.result ? "Close" : "Cancel"}
          </Button>
          {!props.result ? (
            <Button type="button" disabled={props.busy || !props.bulkFile} onClick={props.onSubmit}>
              {props.busy ? "Uploading…" : "Upload file"}
            </Button>
          ) : null}
        </div>
      }
    >
      <p className="text-xs text-muted-foreground">
        CSV or XLSX. Columns: name, phone_number, subject_code, examiner_type, region. One subject per row.
      </p>
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.busy || props.examId == null}
          onClick={props.onDownloadTemplate}
        >
          Download Excel template
        </Button>
      </div>
      {props.error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={formLabelClass} htmlFor="ei-bulk-deadline">
            Respond by
          </label>
          <input
            id="ei-bulk-deadline"
            type="datetime-local"
            required
            className={cn(formInputClass, "mt-1")}
            value={props.bulkResponseDeadlineInput}
            disabled={props.busy}
            onChange={(e) => props.onBulkResponseDeadlineChange(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Required — last date/time invitees can accept or decline.
          </p>
        </div>
        <div>
          <label className={formLabelClass} htmlFor="ei-bulk-coordination">
            Coordination date
          </label>
          <input
            id="ei-bulk-coordination"
            type="date"
            className={cn(formInputClass, "mt-1")}
            value={props.bulkCoordinationDateInput}
            disabled={props.busy}
            onChange={(e) => props.onBulkCoordinationDateChange(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Optional — can be set later per batch when coordination is scheduled.
          </p>
        </div>
      </div>
      <div className="mt-4">
        <input
          type="file"
          accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          disabled={props.busy}
          className={cn("text-sm", INPUT_FOCUS_RING)}
          onChange={(e) => props.onFileChange(e.target.files?.[0] ?? null)}
        />
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={props.sendSmsOnBulk}
          disabled={props.busy}
          onChange={(e) => props.onSendSmsOnBulkChange(e.target.checked)}
        />
        Send invitation SMS for each row
      </label>
      {props.result ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            Created {props.result.created_count} invitation(s).
            {props.result.sms_sent_count > 0 || props.result.sms_failed_count > 0
              ? ` SMS sent: ${props.result.sms_sent_count}, failed: ${props.result.sms_failed_count}.`
              : null}
          </p>
          {props.result.errors.length ? (
            <ul className="mt-2 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive">
              {props.result.errors.map((err, i) => (
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

export type SetCoordinationDateModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  recipientCount: number;
  coordinationDateInput: string;
  onClose: () => void;
  onSubmit: () => void;
  onCoordinationDateChange: (v: string) => void;
};

export function SetCoordinationDateModal(props: SetCoordinationDateModalProps) {
  if (!props.open) return null;
  return (
    <InvitationModalShell
      title="Set coordination date"
      titleId="ei-coordination-set-title"
      canClose={!props.busy}
      onClose={props.onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={props.busy || !props.coordinationDateInput.trim()} onClick={props.onSubmit}>
            {props.busy ? "Saving…" : "Save date"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Set the coordination meeting date for {props.recipientCount} selected invitation
        {props.recipientCount === 1 ? "" : "s"}. You can notify invitees afterward with custom SMS using{" "}
        <span className="font-mono text-xs">{`{coordination_date}`}</span>.
      </p>
      {props.error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {props.error}
        </p>
      ) : null}
      <div className="mt-4">
        <label className={formLabelClass} htmlFor="ei-set-coordination">
          Coordination date
        </label>
        <input
          id="ei-set-coordination"
          type="date"
          required
          className={cn(formInputClass, "mt-1")}
          value={props.coordinationDateInput}
          disabled={props.busy}
          onChange={(e) => props.onCoordinationDateChange(e.target.value)}
        />
      </div>
    </InvitationModalShell>
  );
}

export type CustomSmsModalProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  result: CustomSmsBulkResult | null;
  message: string;
  recipientCount: number;
  recipientLabel: string;
  recipientNoun?: string;
  submitBlockedReason?: string | null;
  onClose: () => void;
  onSubmit: () => void;
  onMessageChange: (v: string) => void;
};

export type CustomSmsBulkResult = {
  sent_count: number;
  failed_count: number;
  errors: CustomSmsBulkRowError[];
};

export type CustomSmsBulkRowError = {
  message: string;
  invitation_id?: string;
  examiner_id?: string;
};

export function CustomSmsModal(props: CustomSmsModalProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!props.open) return null;

  function insertToken(token: string) {
    const el = textareaRef.current;
    if (!el) {
      props.onMessageChange(`${props.message}${token}`);
      return;
    }
    const start = el.selectionStart ?? props.message.length;
    const end = el.selectionEnd ?? props.message.length;
    const next = props.message.slice(0, start) + token + props.message.slice(end);
    props.onMessageChange(next);
  }

  const charCount = props.message.length;
  const overLimit = charCount > 160;
  const submitBlockedReason = props.submitBlockedReason?.trim() || null;
  const displayError = props.error ?? submitBlockedReason;

  const recipientNoun = props.recipientNoun ?? "invitee";

  return (
    <InvitationModalShell
      title="Send custom SMS"
      titleId="ei-sms-title"
      canClose={!props.busy}
      onClose={props.onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={props.busy} onClick={props.onClose}>
            {props.result ? "Close" : "Cancel"}
          </Button>
          {!props.result ? (
            <Button
              type="button"
              disabled={
                props.busy || !props.message.trim() || props.recipientCount === 0 || Boolean(submitBlockedReason)
              }
              onClick={props.onSubmit}
            >
              {props.busy ? "Sending…" : "Send SMS"}
            </Button>
          ) : null}
        </div>
      }
    >
      <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
        Sending to {props.recipientCount} {recipientNoun}
        {props.recipientCount === 1 ? "" : "s"} ({props.recipientLabel})
      </p>
      {displayError ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {displayError}
        </p>
      ) : null}
      <div className="mt-4 space-y-2">
        <label className={formLabelClass} htmlFor="ei-custom-sms">
          Message
        </label>
        <textarea
          ref={textareaRef}
          id="ei-custom-sms"
          className={cn(formInputClass, "min-h-32 resize-y")}
          value={props.message}
          disabled={props.busy || Boolean(props.result)}
          onChange={(e) => props.onMessageChange(e.target.value)}
          placeholder="Hi {name}, please confirm by {response_deadline}. Link: {link}"
        />
        <div className="flex flex-wrap gap-1.5">
          {SMS_PLACEHOLDER_TOKENS.map((token) => (
            <button
              key={token}
              type="button"
              disabled={props.busy || Boolean(props.result)}
              className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] hover:bg-muted"
              onClick={() => insertToken(token)}
            >
              {token}
            </button>
          ))}
        </div>
        <p className={cn("text-xs tabular-nums", overLimit ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {charCount} characters{overLimit ? " — may split into multiple SMS segments" : ""}
        </p>
      </div>
      {props.result ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            Sent {props.result.sent_count}, failed {props.result.failed_count}.
          </p>
          {props.result.errors.length ? (
            <ul className="mt-2 max-h-48 list-inside list-disc space-y-1 overflow-y-auto text-xs text-destructive">
              {props.result.errors.map((err, index) => (
                <li key={err.invitation_id ?? err.examiner_id ?? `${err.message}-${index}`}>{err.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </InvitationModalShell>
  );
}
