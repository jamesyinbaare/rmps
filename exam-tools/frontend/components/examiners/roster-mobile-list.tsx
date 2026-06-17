"use client";

import type { PaginationState } from "@tanstack/react-table";
import { useMemo, useState } from "react";

import {
  ContactCardOverflowTrigger,
  ExaminerContactCard,
} from "@/components/examiners/examiner-contact-card";
import { RosterRowActionsMenu } from "@/components/examiners/roster-row-actions-menu";
import type { RosterTableRow } from "@/components/examiners/types";
import { humanizeRegion } from "@/components/examiners/utils";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import {
  MAX_CUSTOM_PAGE_SIZE,
  PAGE_SIZE_PRESETS,
} from "@/components/examiners/constants";
import { OfficialAccountsPagination } from "@/components/official-accounts-pagination";
import type { ExaminerTypeApi } from "@/lib/api";

type Props = {
  rows: RosterTableRow[];
  pagination: PaginationState;
  onPaginationChange: (pagination: PaginationState) => void;
  showCustomPageSizeInput: boolean;
  customPageSizeInput: string;
  onPageSizeSelectChange: (value: string) => void;
  onCustomPageSizeChange: (value: string) => void;
  onCustomPageSizeBlur: () => void;
  busy: boolean;
  canEditRoster?: boolean;
  onInAppSms: (row: RosterTableRow) => void;
  onEdit: (row: RosterTableRow) => void;
  onRemove: (row: RosterTableRow) => void;
  onViewAllocation?: (row: RosterTableRow) => void;
};

export function RosterMobileList({
  rows,
  pagination,
  onPaginationChange,
  showCustomPageSizeInput,
  customPageSizeInput,
  onPageSizeSelectChange,
  onCustomPageSizeChange,
  onCustomPageSizeBlur,
  busy,
  canEditRoster = true,
  onInAppSms,
  onEdit,
  onRemove,
  onViewAllocation,
}: Props) {
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [copyUi, setCopyUi] = useState<Record<string, "copied" | "error">>({});

  const pageRows = useMemo(() => {
    const start = pagination.pageIndex * pagination.pageSize;
    return rows.slice(start, start + pagination.pageSize);
  }, [rows, pagination.pageIndex, pagination.pageSize]);

  async function handleCopyPortalLink(row: RosterTableRow) {
    if (!row.portal_url) {
      setCopyUi((prev) => ({ ...prev, [row.id]: "error" }));
      return;
    }
    try {
      await navigator.clipboard.writeText(row.portal_url);
      setCopyUi((prev) => ({ ...prev, [row.id]: "copied" }));
      window.setTimeout(() => {
        setCopyUi((prev) => {
          if (prev[row.id] !== "copied") return prev;
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }, 2500);
    } catch {
      setCopyUi((prev) => ({ ...prev, [row.id]: "error" }));
    }
  }

  const page = pagination.pageIndex + 1;

  return (
    <div className="flex flex-col gap-3 md:hidden">
      <ul className="space-y-3">
        {pageRows.map((row) => {
          const roleLabel = EXAMINER_TYPE_LABELS[row.examiner_type as ExaminerTypeApi] ?? row.examiner_type;
          const metaParts = [roleLabel, row.subjectLabel, humanizeRegion(row.region)].filter(Boolean);
          const embeddedMenu = (
            <RosterRowActionsMenu
              row={row}
              open={openActionsId === row.id}
              onOpenChange={(next) => setOpenActionsId(next ? row.id : null)}
              busy={busy}
              copyLinkState={copyUi[row.id]}
              onEdit={onEdit}
              onRemove={onRemove}
              canEditRoster={canEditRoster}
              onCopyPortalLink={handleCopyPortalLink}
              onViewAllocation={onViewAllocation}
              embedded
            />
          );

          return (
            <li key={row.id}>
              <ExaminerContactCard
                name={row.name}
                phone={row.phone_number}
                referenceCode={row.reference_code}
                metaLine={metaParts.join(" · ")}
                onInAppSms={() => onInAppSms(row)}
                disabled={busy}
                overflowMenu={
                  embeddedMenu ? (
                    <ContactCardOverflowTrigger
                      open={openActionsId === row.id}
                      onOpenChange={(next) => setOpenActionsId(next ? row.id : null)}
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
        recordLabel="examiner"
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
