"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CertificateBreadcrumbs } from "@/components/certificates/CertificateBreadcrumbs";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ResultsExamPicker } from "@/components/results/ResultsExamPicker";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { getAllExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Award, Loader2 } from "lucide-react";

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
        <TopBar title="Manage certificates" showSearch={false} />
        <div className="flex-1 overflow-y-auto p-6">
          <CertificateBreadcrumbs items={[{ label: "Certificates" }]} />
          <div className="mx-auto max-w-xl">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <Award className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Select an examination</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open a school list to generate certificates, assign numbers, or download an
                  issue form. Use the ledger to manage issued certificates.
                </p>
              </div>
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
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <ResultsExamPicker
                  exams={exams}
                  confirmLabel="View schools"
                  onConfirm={(examId) => router.push(`/results/certificates/${examId}`)}
                />
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/results/certificates/issuances">Issuance ledger</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href="/results/batches">Batches</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
