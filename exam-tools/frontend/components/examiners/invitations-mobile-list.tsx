"use client";

import type { PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import {
  ContactCardOverflowTrigger,
  ExaminerContactCard,
} from "@/components/examiners/examiner-contact-card";
import { InvitationRowActionsMenu } from "@/components/examiner-invitations/invitation-row-actions-menu";
import { InvitationStatusBadge } from "@/components/examiner-invitations/invitation-status-badge";
import { humanizeRegion } from "@/components/examiner-invitations/utils";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import {
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiner-invitations/constants";
import type { ResendUiState } from "@/components/examiner-invitations/types";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import type { ExaminerInvitationRow, ExaminerTypeApi } from "@/lib/api";
import { displaySubjectCode } from "@/lib/script-control-completion";

type Props = {
  rows: ExaminerInvitationRow[];
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  showCustomPageSizeInput: boolean;
  customPageSizeInput: string;
  onPageSizeSelectChange: (value: string) => void;
  onCustomPageSizeChange: (value: string) => void;
  onCustomPageSizeBlur: () => void;
  busy: boolean;
  resendUi: Record<string, ResendUiState>;
  resendErrors: Record<string, string>;
  onInAppSms: (row: ExaminerInvitationRow) => void;
  onResend: (inv: ExaminerInvitationRow) => void;
  onRenew?: (inv: ExaminerInvitationRow) => void;
  onCopyLink?: (inv: ExaminerInvitationRow) => void;
  copyLinkUi?: Record<string, "copied" | "error">;
  onViewAllocation?: (inv: ExaminerInvitationRow) => void;
};

export function InvitationsMobileList({
  rows,
  pagination,
  onPaginationChange,
  showCustomPageSizeInput,
  customPageSizeInput,
  onPageSizeSelectChange,
  onCustomPageSizeChange,
  onCustomPageSizeBlur,
  busy,
  resendUi,
  resendErrors,
  onInAppSms,
  onResend,
  onRenew,
  onCopyLink,
  copyLinkUi = {},
  onViewAllocation,
}: Props) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  const pageRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return rows.slice(start, start + pagination.pageSize);
  }, [rows, pagination.pageIndex, pagination.pageSize]);

  const page = pagination.pageIndex + 1;

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <ul className="space-y-3">
        {pageRows.map((inv) => {
          const roleLabel = EXAMINER_TYPE_LABELS[inv.examiner_type as ExaminerTypeApi] ?? inv.examiner_type;
          const subjectLabel = `${displaySubjectCode(inv)} — ${inv.subject_name}`;
          const metaParts = [roleLabel, subjectLabel, humanizeRegion(inv.region)].filter(Boolean);
          const embeddedMenu = (
            <InvitationRowActionsMenu
              inv={inv}
              open={openActionsId === inv.id}
              onOpenChange={(next) => setOpenActionsId(next ? inv.id : null)}
              busy={busy}
              resendUi={resendUi[inv.id]}
              resendError={resendErrors[inv.id]}
              copyLinkState={copyLinkUi[inv.id]}
              onCopyLink={onCopyLink}
              onResend={onResend}
              onRenew={onRenew}
              onViewAllocation={onViewAllocation}
              embedded
            />
          );

          return (
            <li key={inv.id}>
              <ExaminerContactCard
                name={inv.name}
                phone={inv.phone_number}
                metaLine={metaParts.join(" · ")}
                statusBadge={<InvitationStatusBadge status={inv.status} />}
                onInAppSms={() => onInAppSms(inv)}
                disabled={busy}
                overflowMenu={
                  embeddedMenu ? (
                    <ContactCardOverflowTrigger
                      open={openActionsId === inv.id}
                      onOpenChange={(next) => setOpenActionsId(next ? inv.id : null)}
                      disabled={busy}
                    >
                      {embeddedMenu}
                    </ContactCardOverflowTrigger>
                  ) : null
                }
              />
            </li>
          );
        })}
      </ul>

      <OfficialAccountsPagination
        page={page}
        pageSize={pagination.pageSize}
        total={rows.length}
        busy={busy}
        recordLabel="invitation"
        pageSizeOptions={[...PAGE_SIZE_PRESETS]}
        showCustomPageSizeInput={showCustomPageSizeInput}
        customPageSizeInput={customPageSizeInput}
        onPageSizeSelectChange={onPageSizeSelectChange}
        onCustomPageSizeChange={onCustomPageSizeChange}
        onCustomPageSizeBlur={onCustomPageSizeBlur}
        maxCustomPageSize={MAX_CUSTOM_PAGE_SIZE}
        onPageChange={(p) => onPaginationChange({ ...pagination, pageIndex: p - 1 })}
        onPageSizeChange={(size) => onPaginationChange({ pageIndex: 0, pageSize: size })}
      />
    </div>
  );
}
