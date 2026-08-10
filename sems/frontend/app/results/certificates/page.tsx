"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAllExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Award, ChevronRight, Loader2 } from "lucide-react";

function examLabel(exam: Exam): string {
  const typeLabel =
    exam.exam_type === "Certificate II Examinations" ||
    exam.exam_type === "Certificate II Examination"
      ? "Certificate II"
      : exam.exam_type;
  return `${typeLabel} — ${exam.series} ${exam.year}`;
}

export default function ManageCertificatesIndexPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const list = await getAllExams();
        setExams(list.sort((a, b) => b.year - a.year || a.exam_type.localeCompare(b.exam_type)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load examinations");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <DashboardLayout title="Certificates">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Manage certificates" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Select an examination, then a school, to generate certificates for one candidate or
              the whole school. Candidate pages show grades for confirmation. Assign certificate
              numbers on the candidate page or the ledger.
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/results/certificates/issuances">Issuance ledger</Link>
            </Button>
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
          ) : exams.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              No examinations found.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Examination</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Series</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead className="w-[120px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((exam) => (
                    <TableRow
                      key={exam.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/results/certificates/${exam.id}`)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-muted-foreground" />
                          {examLabel(exam)}
                        </div>
                      </TableCell>
                      <TableCell>{exam.exam_type}</TableCell>
                      <TableCell>{exam.series}</TableCell>
                      <TableCell>{exam.year}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                          <Link href={`/results/certificates/${exam.id}`}>
                            View
                            <ChevronRight className="ml-1 h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
