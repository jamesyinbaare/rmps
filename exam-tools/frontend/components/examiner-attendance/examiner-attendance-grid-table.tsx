"use client";

import { Check, Minus, X } from "lucide-react";

import { humanizeRegion } from "@/components/examiners/utils";
import { EXAMINER_TYPE_LABELS } from "@/components/examiner-invitations/constants";
import type { AdminExaminerAllowanceRow, ExaminerAttendanceRow } from "@/lib/api";
import {
  officialAccountsTableLayoutClass,
  officialAccountsTableScrollClass,
} from "@/lib/official-accounts-zone";

export type AttendanceCellStatus = "present" | "absent" | "pending";

export type AttendanceGridRow = {
  id: string;
  name: string;
  referenceCode: string;
  region: string;
  roleLabel: string;
  phone: string;
  cells: AttendanceCellStatus[];
};

function normalizeDateKey(value: string): string {
  return value.slice(0, 10);
}

function formatDateColumn(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y!, m! - 1, d);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function todayDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildExaminerAttendanceGrid(
  roster: AdminExaminerAllowanceRow[],
  attendance: ExaminerAttendanceRow[],
  today: string = todayDateKey(),
): { dates: string[]; rows: AttendanceGridRow[] } {
  const dates = [...new Set(attendance.map((row) => normalizeDateKey(row.attendance_date)))].sort();

  const presentByExaminer = new Map<string, Set<string>>();
  const attendanceMetaByExaminer = new Map<
    string,
    { name: string; referenceCode: string; region: string; roleLabel: string }
  >();

  for (const row of attendance) {
    const dateKey = normalizeDateKey(row.attendance_date);
    if (!presentByExaminer.has(row.examiner_id)) {
      presentByExaminer.set(row.examiner_id, new Set());
    }
    presentByExaminer.get(row.examiner_id)!.add(dateKey);
    if (!attendanceMetaByExaminer.has(row.examiner_id)) {
      attendanceMetaByExaminer.set(row.examiner_id, {
        name: row.examiner_name,
        referenceCode: row.reference_code,
        region: humanizeRegion(row.region),
        roleLabel: row.examiner_type_label,
      });
    }
  }

  const rosterIds = new Set(roster.map((row) => row.id));
  const gridRows: AttendanceGridRow[] = roster.map((examiner) => ({
    id: examiner.id,
    name: examiner.full_name,
    referenceCode: "",
    region: humanizeRegion(examiner.region),
    roleLabel: EXAMINER_TYPE_LABELS[examiner.examiner_type] ?? examiner.examiner_type,
    phone: examiner.phone_number?.trim() ?? "",
    cells: dates.map((dateKey) => cellStatus(presentByExaminer.get(examiner.id), dateKey, today)),
  }));

  for (const [examinerId, meta] of attendanceMetaByExaminer) {
    if (rosterIds.has(examinerId)) continue;
    gridRows.push({
      id: examinerId,
      name: meta.name,
      referenceCode: meta.referenceCode,
      region: meta.region,
      roleLabel: meta.roleLabel,
      phone: "",
      cells: dates.map((dateKey) => cellStatus(presentByExaminer.get(examinerId), dateKey, today)),
    });
  }

  gridRows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { dates, rows: gridRows };
}

export function filterAttendanceGridRows(
  grid: { dates: string[]; rows: AttendanceGridRow[] },
  searchQuery: string,
): { dates: string[]; rows: AttendanceGridRow[] } {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return grid;
  const rows = grid.rows.filter((row) => {
    const haystack = [row.name, row.referenceCode, row.region, row.roleLabel, row.phone]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  return { dates: grid.dates, rows };
}

function cellStatus(
  presentDates: Set<string> | undefined,
  dateKey: string,
  today: string,
): AttendanceCellStatus {
  if (presentDates?.has(dateKey)) return "present";
  if (dateKey >= today) return "pending";
  return "absent";
}

function AttendanceStatusCell({ status, dateLabel }: { status: AttendanceCellStatus; dateLabel: string }) {
  if (status === "present") {
    return (
      <span className="inline-flex size-7 items-center justify-center" title={`Present · ${dateLabel}`} aria-label={`Present on ${dateLabel}`}>
        <Check className="size-4 text-emerald-600" strokeWidth={2.5} aria-hidden />
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span
        className="inline-flex size-7 items-center justify-center text-muted-foreground"
        title={`Not marked yet · ${dateLabel}`}
        aria-label={`Not marked yet on ${dateLabel}`}
      >
        <Minus className="size-4" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-7 items-center justify-center text-muted-foreground/80"
      title={`Absent · ${dateLabel}`}
      aria-label={`Absent on ${dateLabel}`}
    >
      <X className="size-4" aria-hidden />
    </span>
  );
}

function presentCount(cells: AttendanceCellStatus[]): number {
  return cells.filter((status) => status === "present").length;
}

function TableSkeleton({ dateCount }: { dateCount: number }) {
  const colSpan = 5 + Math.max(dateCount, 1);
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="animate-pulse">
          <td colSpan={colSpan} className="px-3 py-3">
            <div className="h-4 rounded bg-muted/50" />
          </td>
        </tr>
      ))}
    </>
  );
}

type Props = {
  rows: AttendanceGridRow[];
  dates: string[];
  busy: boolean;
  emptyLabel: string;
};

export function ExaminerAttendanceGridTable({ rows, dates, busy, emptyLabel }: Props) {
  const hasRows = rows.length > 0;
  const hasDates = dates.length > 0;

  return (
    <div className={officialAccountsTableLayoutClass}>
      <div className={officialAccountsTableScrollClass}>
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
            <tr className="border-b border-border text-left">
              <th className="sticky left-0 z-20 w-10 min-w-10 bg-muted/95 px-2 py-2.5 text-center font-medium">
                #
              </th>
              <th className="sticky left-10 z-20 min-w-[10rem] bg-muted/95 px-3 py-2.5 font-medium">Examiner</th>
              <th className="min-w-[5rem] px-3 py-2.5 font-medium">Role</th>
              <th className="min-w-[6rem] px-3 py-2.5 font-medium">Region</th>
              {dates.map((dateKey) => (
                <th
                  key={dateKey}
                  className="min-w-[4.5rem] px-2 py-2.5 text-center font-medium whitespace-nowrap"
                >
                  {formatDateColumn(dateKey)}
                </th>
              ))}
              {!hasDates && !busy ? (
                <th className="px-3 py-2.5 font-medium text-muted-foreground">Attendance days</th>
              ) : null}
              <th className="min-w-[3.5rem] px-3 py-2.5 text-center font-medium">Count</th>
            </tr>
          </thead>
          <tbody>
            {busy ? <TableSkeleton dateCount={dates.length} /> : null}
            {!busy && !hasRows ? (
              <tr>
                <td
                  colSpan={5 + Math.max(dates.length, 1)}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {emptyLabel}
                </td>
              </tr>
            ) : null}
            {!busy && hasRows && !hasDates
              ? rows.map((row, index) => (
                <tr key={row.id} className="border-b border-border/60">
                  <td className="sticky left-0 z-[1] bg-card px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  <td className="sticky left-10 z-[1] bg-card px-3 py-2.5">
                    <div className="font-medium">{row.name}</div>
                    {row.referenceCode ? (
                      <div className="text-xs text-muted-foreground">{row.referenceCode}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.roleLabel}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{row.region}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">—</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">0</td>
                </tr>
              ))
              : null}
            {!busy && hasRows && hasDates
              ? rows.map((row, index) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="sticky left-0 z-[1] bg-card px-2 py-2.5 text-center tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="sticky left-10 z-[1] bg-card px-3 py-2.5">
                      <div className="font-medium">{row.name}</div>
                      {row.referenceCode ? (
                        <div className="text-xs text-muted-foreground">{row.referenceCode}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.roleLabel}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{row.region}</td>
                    {row.cells.map((status, index) => {
                      const dateKey = dates[index]!;
                      const dateLabel = formatDateColumn(dateKey);
                      return (
                        <td key={dateKey} className="px-2 py-2.5 text-center">
                          <AttendanceStatusCell status={status} dateLabel={dateLabel} />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-center font-medium tabular-nums">
                      {presentCount(row.cells)}
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      {!busy && hasDates ? (
        <div className="flex shrink-0 flex-wrap items-center gap-4 border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-3.5 text-emerald-600" aria-hidden />
            Present
          </span>
          <span className="inline-flex items-center gap-1.5">
            <X className="size-3.5" aria-hidden />
            Absent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Minus className="size-3.5" aria-hidden />
            Not marked yet
          </span>
        </div>
      ) : null}
    </div>
  );
}

export { formatDateColumn, normalizeDateKey, todayDateKey };
