"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ExamRegistrationResultDetail, SubjectResultDetail } from "@/types/document";

export type ResultDetailTab = "grades" | "raw" | "normalized";

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function gradeClass(grade: string | null): string {
  if (!grade || grade === "Pending") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  if (grade === "Fail" || grade === "Absent" || grade === "Cancelled" || grade === "Blocked") {
    return "border-transparent bg-destructive text-white";
  }
  if (grade === "Distinction") {
    return "border-transparent bg-emerald-600 text-white";
  }
  if (grade === "Upper Credit" || grade === "Credit") {
    return "border-transparent bg-sky-600 text-white";
  }
  return "border-border bg-background text-foreground";
}

function ScoreCell({
  value,
  max,
}: {
  value: string | number | null | undefined;
  max?: number | null;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <span className="tabular-nums">
      {empty ? "—" : String(value)}
      {!empty && max != null ? (
        <span className="text-muted-foreground"> / {max}</span>
      ) : null}
    </span>
  );
}

function SubjectsTable({
  subjects,
  columns,
}: {
  subjects: SubjectResultDetail[];
  columns: "grades" | "raw" | "normalized";
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="bg-muted/40">Subject</TableHead>
            {columns === "grades" && (
              <>
                <TableHead className="bg-muted/40">Type</TableHead>
                <TableHead className="bg-muted/40 text-right">Total</TableHead>
                <TableHead className="bg-muted/40">Grade</TableHead>
              </>
            )}
            {columns === "raw" && (
              <>
                <TableHead className="bg-muted/40 text-right">Obj</TableHead>
                <TableHead className="bg-muted/40 text-right">Essay</TableHead>
                <TableHead className="bg-muted/40 text-right">Pract</TableHead>
              </>
            )}
            {columns === "normalized" && (
              <>
                <TableHead className="bg-muted/40 text-right">Obj</TableHead>
                <TableHead className="bg-muted/40 text-right">Essay</TableHead>
                <TableHead className="bg-muted/40 text-right">Pract</TableHead>
                <TableHead className="bg-muted/40 text-right">Total</TableHead>
                <TableHead className="bg-muted/40">Grade</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {subjects.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">
                No subjects registered.
              </TableCell>
            </TableRow>
          ) : (
            subjects.map((s) => (
              <TableRow key={s.subject_registration_id}>
                <TableCell>
                  <div className="font-medium">{s.subject_name}</div>
                  <div className="font-mono text-xs text-muted-foreground">{s.subject_code}</div>
                </TableCell>
                {columns === "grades" && (
                  <>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.subject_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNum(s.total_score)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(gradeClass(s.grade))}>
                        {s.grade ?? "—"}
                      </Badge>
                    </TableCell>
                  </>
                )}
                {columns === "raw" && (
                  <>
                    <TableCell className="text-right font-mono text-sm">
                      <ScoreCell value={s.obj_raw_score} max={s.obj_max_score} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <ScoreCell value={s.essay_raw_score} max={s.essay_max_score} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <ScoreCell value={s.pract_raw_score} max={s.pract_max_score} />
                    </TableCell>
                  </>
                )}
                {columns === "normalized" && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {formatNum(s.obj_normalized)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNum(s.essay_normalized)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNum(s.pract_normalized)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNum(s.total_score)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(gradeClass(s.grade))}>
                        {s.grade ?? "—"}
                      </Badge>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function CandidateResultDetail({
  detail,
  tab,
  onTabChange,
}: {
  detail: ExamRegistrationResultDetail;
  tab?: ResultDetailTab;
  onTabChange?: (tab: ResultDetailTab) => void;
}) {
  const isControlled = tab != null && onTabChange != null;

  return (
    <Tabs
      {...(isControlled
        ? {
            value: tab,
            onValueChange: (value) => onTabChange(value as ResultDetailTab),
          }
        : { defaultValue: "grades" as const })}
    >
      <TabsList>
        <TabsTrigger value="grades">Grades</TabsTrigger>
        <TabsTrigger value="raw">Raw scores</TabsTrigger>
        <TabsTrigger value="normalized">Normalized</TabsTrigger>
      </TabsList>
      <TabsContent value="grades" className="mt-4">
        <SubjectsTable subjects={detail.subjects} columns="grades" />
      </TabsContent>
      <TabsContent value="raw" className="mt-4">
        <SubjectsTable subjects={detail.subjects} columns="raw" />
      </TabsContent>
      <TabsContent value="normalized" className="mt-4">
        <SubjectsTable subjects={detail.subjects} columns="normalized" />
      </TabsContent>
    </Tabs>
  );
}
