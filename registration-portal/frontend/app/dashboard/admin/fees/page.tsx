"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplicationFeeSection } from "@/components/admin/ApplicationFeeSection";
import { SubjectPricingSection } from "@/components/admin/SubjectPricingSection";
import { TieredPricingSection } from "@/components/admin/TieredPricingSection";
import { ProgrammePricingSection } from "@/components/admin/ProgrammePricingSection";
import { ImportPricingDialog } from "@/components/admin/ImportPricingDialog";
import { PricingTable } from "@/components/admin/PricingTable";
import {
  listExams,
  getExamPricing,
  getCurrentUser,
  getExam,
  updateExam,
} from "@/lib/api";
import { toast } from "sonner";
import type {
  RegistrationExam,
  ExamPricingResponse,
  User,
} from "@/types";
import { DollarSign, Download } from "lucide-react";
import { Loader2 } from "lucide-react";

export default function FeesManagementPage() {
  const router = useRouter();
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [pricingData, setPricingData] = useState<ExamPricingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("application-fee");

  // Check access on mount
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const user = await getCurrentUser();
        // Only system admin roles can access this page
        if (
          user.role === "SchoolAdmin" ||
          user.role === "SchoolStaff" ||
          user.role === "PublicUser"
        ) {
          toast.error(
            "Access denied. This page is only available to system administrators."
          );
          router.push("/dashboard/my-school");
          return;
        }
        setCurrentUser(user);
        setCheckingAccess(false);
        loadExams();
      } catch (error) {
        toast.error("Failed to verify access");
        router.push("/dashboard");
      }
    };

    checkAccess();
  }, [router]);

  const loadExams = async () => {
    setLoading(true);
    try {
      const examList = await listExams();
      setExams(examList);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadPricing = async (examId: number) => {
    setLoadingPricing(true);
    try {
      const pricing = await getExamPricing(examId);
      setPricingData(pricing);
    } catch (error) {
      toast.error("Failed to load pricing data");
      console.error(error);
    } finally {
      setLoadingPricing(false);
    }
  };

  useEffect(() => {
    if (selectedExamId) {
      loadPricing(selectedExamId);
    } else {
      setPricingData(null);
    }
  }, [selectedExamId]);

  const handlePricingUpdate = async () => {
    if (selectedExamId) {
      await loadPricing(selectedExamId);
    }
  };

  if (checkingAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="h-8 w-8" />
            Fees Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure pricing for each examination
          </p>
        </div>
      </div>

      {/* Exam Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Examination</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select
                value={selectedExamId?.toString() || ""}
                onValueChange={(value) => setSelectedExamId(value ? parseInt(value) : null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an examination" />
                </SelectTrigger>
                <SelectContent>
                  {exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id.toString()}>
                      {exam.exam_type} ({exam.exam_series} {exam.year})
                      {exam.description && ` - ${exam.description}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedExamId && (
              <Button
                variant="outline"
                onClick={() => setImportDialogOpen(true)}
              >
                <Download className="mr-2 h-4 w-4" />
                Import Pricing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Table */}
      {selectedExamId ? (
        <PricingTable examId={selectedExamId} onUpdate={handlePricingUpdate} />
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              Please select an examination to view and configure pricing
            </div>
          </CardContent>
        </Card>
      )}

      {/* Detailed Pricing Sections (in tabs) */}
      {selectedExamId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="subject-pricing">Per-Subject Pricing</TabsTrigger>
            <TabsTrigger value="tiered-pricing">Tiered Pricing</TabsTrigger>
            <TabsTrigger value="programme-pricing">Per-Programme Pricing</TabsTrigger>
          </TabsList>

          {pricingData && (
            <>
              <TabsContent value="subject-pricing" className="mt-6">
                <SubjectPricingSection
                  examId={selectedExamId}
                  subjectPricing={pricingData.subject_pricing}
                  onUpdate={handlePricingUpdate}
                />
              </TabsContent>

              <TabsContent value="tiered-pricing" className="mt-6">
                <TieredPricingSection
                  examId={selectedExamId}
                  tieredPricing={pricingData.tiered_pricing}
                  onUpdate={handlePricingUpdate}
                />
              </TabsContent>

              <TabsContent value="programme-pricing" className="mt-6">
                <ProgrammePricingSection
                  examId={selectedExamId}
                  programmePricing={pricingData.programme_pricing || []}
                  onUpdate={handlePricingUpdate}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      )}

      <ImportPricingDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        examId={selectedExamId}
        exams={exams}
        onSuccess={handlePricingUpdate}
      />
    </div>
  );
}
