"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ResultsExamPicker } from "@/components/results/ResultsExamPicker";
import { getAllExams } from "@/lib/api";
import type { Exam } from "@/types/document";
import { Award, Loader2 } from "lucide-react";

export default function ResultsIndexPage() {
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
    <DashboardLayout title="Results">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Browse Results" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-xl">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-md bg-muted p-2">
                <Award className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">Select an examination</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Confirm an examination to open its results dashboard, then optionally
                  search a school to browse candidate grades.
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
                  onConfirm={(examId) => router.push(`/results/${examId}`)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
