"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CreateExamDialog } from "@/components/admin/CreateExamDialog";
import { ExamTable } from "@/components/admin/ExamTable";
import { ActiveExamCards } from "@/components/admin/ActiveExamCards";
import { ExamSeriesSection } from "@/components/admin/ExamSeriesSection";
import { listExams, getActiveExams } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ExamsTab = "exams" | "series";

export default function ExamsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: ExamsTab = tabParam === "series" ? "series" : "exams";

  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [activeExams, setActiveExams] = useState<RegistrationExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingActive, setLoadingActive] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addSeriesOpen, setAddSeriesOpen] = useState(false);

  const setActiveTab = (tab: ExamsTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "exams") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`/dashboard/exams${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const loadExams = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listExams();
      setExams(data);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActive = useCallback(async () => {
    setLoadingActive(true);
    try {
      const data = await getActiveExams();
      setActiveExams(data);
    } catch (error) {
      console.error("Failed to load active exams:", error);
      setActiveExams([]);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadExams(), loadActive()]);
  }, [loadExams, loadActive]);

  useEffect(() => {
    loadExams();
    loadActive();
  }, [loadExams, loadActive]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Examinations"
        subtitle={
          activeTab === "series"
            ? "Configure examination sittings (short name and long name) used when creating examinations."
            : "Set up and manage examination registration periods"
        }
        actions={
          activeTab === "series" ? (
            <Button onClick={() => setAddSeriesOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add series
            </Button>
          ) : (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Exam
            </Button>
          )
        }
      />

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ExamsTab)}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="exams">Examinations</TabsTrigger>
          <TabsTrigger value="series">Exam Series</TabsTrigger>
        </TabsList>

        <TabsContent value="exams" className="mt-6 space-y-8">
          <section>
            <SectionLabel>Active examinations</SectionLabel>
            <ActiveExamCards exams={activeExams} loading={loadingActive} max={3} />
          </section>

          <section>
            <SectionLabel>All examinations</SectionLabel>
            <ExamTable exams={exams} loading={loading} onRefresh={refreshAll} />
          </section>

          <CreateExamDialog open={dialogOpen} onOpenChange={setDialogOpen} onSuccess={refreshAll} />
        </TabsContent>

        <TabsContent value="series" className="mt-6">
          <ExamSeriesSection
            showAddButton={false}
            addOpen={addSeriesOpen}
            onAddOpenChange={setAddSeriesOpen}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
