"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { CandidateResultDetail } from "@/components/results/CandidateResultDetail";
import { getExamRegistrationResultDetail } from "@/lib/api";
import type { ExamRegistrationResultDetail } from "@/types/document";
import { ArrowLeft, Loader2 } from "lucide-react";

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
          ) : detail ? (
            <CandidateResultDetail detail={detail} />
          ) : null}
        </div>
      </div>
    </DashboardLayout>
  );
}
