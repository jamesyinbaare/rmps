"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Receipt, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listExams, listSchools } from "@/lib/api";
import type { RegistrationExam, School } from "@/types";
import {
  downloadAdminFreeTvetInvoicePdfBySchool,
  downloadAdminReferralInvoicePdfBySchool,
  downloadAdminFreeTvetInvoiceSummaryPdf,
  downloadAdminReferralInvoiceSummaryPdf,
} from "@/lib/api";

export default function AdminInvoicesPage() {
  const router = useRouter();
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [examsData, schoolsData] = await Promise.all([
          listExams(),
          listSchools(),
        ]);
        setExams(examsData);
        setSchools(schoolsData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getDownloadKey = (type: "free-tvet" | "referral", summary: boolean): string => {
    const examIdStr = selectedExamId ? String(selectedExamId) : "";
    const schoolIdStr = summary ? "summary" : (selectedSchoolId === "all" ? "summary" : String(selectedSchoolId));
    return `${type}-${examIdStr}-${schoolIdStr}`;
  };

  const handleDownload = async (
    type: "free-tvet" | "referral",
    summary: boolean = false
  ) => {
    if (!selectedExamId) {
      alert("Please select an examination first");
      return;
    }

    if (!summary && selectedSchoolId === "all") {
      alert("Please select a school first");
      return;
    }

    const downloadKey = getDownloadKey(type, summary);
    setDownloading(downloadKey);

    try {
      let blob: Blob;
      if (summary) {
        if (type === "free-tvet") {
          blob = await downloadAdminFreeTvetInvoiceSummaryPdf(selectedExamId);
        } else {
          blob = await downloadAdminReferralInvoiceSummaryPdf(selectedExamId);
        }
        } else {
          if (selectedSchoolId === "all") {
            throw new Error("School ID is required for per-school invoices");
          }
          if (type === "free-tvet") {
            blob = await downloadAdminFreeTvetInvoicePdfBySchool(selectedExamId, selectedSchoolId);
          } else {
            blob = await downloadAdminReferralInvoicePdfBySchool(selectedExamId, selectedSchoolId);
          }
        }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = summary
        ? `${type}_invoice_summary_exam_${selectedExamId}.pdf`
        : `${type}_invoice_exam_${selectedExamId}_school_${selectedSchoolId === "all" ? "all" : selectedSchoolId}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download invoice:", error);
      alert("Failed to download invoice. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Invoices</h1>
        <p className="text-muted-foreground">Generate and download invoices for schools</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Select Examination</CardTitle>
            <CardDescription>Choose an examination to generate invoices for</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedExamId?.toString() || ""}
              onValueChange={(value) => setSelectedExamId(parseInt(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select an examination" />
              </SelectTrigger>
              <SelectContent>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} {exam.exam_series || ""} {exam.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Select School (Optional)</CardTitle>
            <CardDescription>Leave empty for summary across all schools</CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedSchoolId === "all" ? "all" : selectedSchoolId.toString()}
              onValueChange={(value) => setSelectedSchoolId(value === "all" ? "all" : parseInt(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All schools (summary)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All schools (summary)</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id.toString()}>
                    {school.code} - {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      {selectedExamId && (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Free TVET Invoices
                </CardTitle>
                <CardDescription>
                  Generate invoices for free TVET candidates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedSchoolId !== "all" ? (
                  <Button
                    className="w-full"
                    onClick={() => handleDownload("free-tvet", false)}
                    disabled={downloading !== null}
                  >
                    {downloading === getDownloadKey("free-tvet", false) ? (
                      "Downloading..."
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download School Invoice
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleDownload("free-tvet", true)}
                    disabled={downloading !== null}
                  >
                    {downloading === getDownloadKey("free-tvet", true) ? (
                      "Downloading..."
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Summary (All Schools)
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Referral Invoices
                </CardTitle>
                <CardDescription>
                  Generate invoices for referral candidates
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedSchoolId !== "all" ? (
                  <Button
                    className="w-full"
                    onClick={() => handleDownload("referral", false)}
                    disabled={downloading !== null}
                  >
                    {downloading === getDownloadKey("referral", false) ? (
                      "Downloading..."
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download School Invoice
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleDownload("referral", true)}
                    disabled={downloading !== null}
                  >
                    {downloading === `referral-${selectedExamId}-summary` ? (
                      "Downloading..."
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download Summary (All Schools)
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!selectedExamId && (
        <Alert>
          <AlertDescription>
            Please select an examination to generate invoices.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
