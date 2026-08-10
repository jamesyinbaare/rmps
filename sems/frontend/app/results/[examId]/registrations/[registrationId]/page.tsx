"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getExamRegistrationResultDetail } from "@/lib/api";
import type { ExamRegistrationResultDetail } from "@/types/document";
import { ArrowLeft, Loader2 } from "lucide-react";

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function gradeBadgeVariant(
  grade: string | null
): "default" | "secondary" | "destructive" | "outline" {
  if (!grade || grade === "Pending") return "secondary";
  if (grade === "Fail" || grade === "Absent" || grade === "Cancelled" || grade === "Blocked") {
    return "destructive";
  }
  if (grade === "Distinction" || grade === "Upper Credit") return "default";
  return "outline";
}

export default function RegistrationResultDetailPage() {
  const params = useParams();
  const examId = Number(params.examId);
  const registrationId = Number(params.registrationId);

  const [detail, setDetail] = useState<ExamRegistrationResultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!registrationId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await getExamRegistrationResultDetail(registrationId);
        setDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load result detail");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [registrationId]);

  return (
    <DashboardLayout title="Results">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          title={
            detail
              ? `${detail.index_number} — ${detail.candidate_name}`
              : "Candidate results"
          }
        />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={
                  detail
                    ? `/results/${examId}/schools/${detail.school_id}`
                    : `/results/${examId}`
                }
              >
                <ArrowLeft className="mr-1 h-4 w-4" />
                Back to school results
              </Link>
            </Button>
            <div className="flex-1" />
            {!loading && detail && (
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/results/certificates/${examId}/registrations/${registrationId}`}
                >
                  Manage certificate
                </Link>
              </Button>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !detail ? null : (
            <>
              <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-muted-foreground">Index number</div>
                  <div className="font-mono font-medium">{detail.index_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">School</div>
                  <div className="font-medium">
                    {detail.school_code} — {detail.school_name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Programme</div>
                  <div className="font-medium">
                    {detail.programme_code
                      ? `${detail.programme_code} — ${detail.programme_name}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Results status</div>
                  <div className="mt-0.5">
                    {detail.is_fully_graded ? (
                      <Badge>
                        Complete ({detail.subjects_graded}/{detail.subjects_registered})
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        Pending ({detail.subjects_pending} of {detail.subjects_registered})
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <Tabs defaultValue="grades">
                <TabsList>
                  <TabsTrigger value="grades">Grades</TabsTrigger>
                  <TabsTrigger value="raw">Raw scores</TabsTrigger>
                  <TabsTrigger value="normalized">Normalized</TabsTrigger>
                </TabsList>

                <TabsContent value="grades" className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subjects.map((s) => (
                          <TableRow key={s.subject_registration_id}>
                            <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                            <TableCell>{s.subject_name}</TableCell>
                            <TableCell>{s.subject_type ?? "—"}</TableCell>
                            <TableCell className="text-right">{formatNum(s.total_score)}</TableCell>
                            <TableCell>
                              <Badge variant={gradeBadgeVariant(s.grade)}>{s.grade ?? "—"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="raw" className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">Obj</TableHead>
                          <TableHead className="text-right">Essay</TableHead>
                          <TableHead className="text-right">Pract</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subjects.map((s) => (
                          <TableRow key={s.subject_registration_id}>
                            <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                            <TableCell>{s.subject_name}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.obj_raw_score ?? "—"}
                              {s.obj_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.obj_max_score}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.essay_raw_score ?? "—"}
                              {s.essay_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.essay_max_score}</span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {s.pract_raw_score ?? "—"}
                              {s.pract_max_score != null ? (
                                <span className="text-muted-foreground"> / {s.pract_max_score}</span>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>

                <TabsContent value="normalized" className="mt-4">
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead className="text-right">Obj</TableHead>
                          <TableHead className="text-right">Essay</TableHead>
                          <TableHead className="text-right">Pract</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Grade</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.subjects.map((s) => (
                          <TableRow key={s.subject_registration_id}>
                            <TableCell className="font-mono text-sm">{s.subject_code}</TableCell>
                            <TableCell>{s.subject_name}</TableCell>
                            <TableCell className="text-right">{formatNum(s.obj_normalized)}</TableCell>
                            <TableCell className="text-right">{formatNum(s.essay_normalized)}</TableCell>
                            <TableCell className="text-right">{formatNum(s.pract_normalized)}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatNum(s.total_score)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={gradeBadgeVariant(s.grade)}>{s.grade ?? "—"}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
