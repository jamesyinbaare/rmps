"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Download, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAllExams } from "@/lib/api";
import type { RegistrationExam } from "@/types";
import {
  downloadFreeTvetInvoicePdf,
  downloadReferralInvoicePdf,
} from "@/lib/api";

export default function InvoicesPage() {
  const router = useRouter();
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const loadExams = async () => {
      try {
        const examsData = await listAllExams();
        setExams(examsData);
      } catch (error) {
        console.error("Failed to load exams:", error);
      } finally {
        setLoading(false);
      }
    };

    loadExams();
  }, []);

  const handleDownload = async (type: "free-tvet" | "referral", groupByProgramme: boolean = false) => {
    if (!selectedExamId) {
      alert("Please select an examination first");
      return;
    }

    const downloadKey = `${type}-${selectedExamId}-${groupByProgramme}`;
    setDownloading(downloadKey);

    try {
      let blob: Blob;
      if (type === "free-tvet") {
        blob = await downloadFreeTvetInvoicePdf(selectedExamId, groupByProgramme);
      } else {
        blob = await downloadReferralInvoicePdf(selectedExamId);
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}_invoice_exam_${selectedExamId}${groupByProgramme ? "_by_programme" : ""}.pdf`;
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
        <p className="text-muted-foreground">Generate and download invoices for candidates</p>
      </div>

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
                <Button
                  className="w-full"
                  onClick={() => handleDownload("free-tvet", false)}
                  disabled={downloading !== null}
                >
                  {downloading === `free-tvet-${selectedExamId}-false` ? (
                    "Downloading..."
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download by Examination
                    </>
                  )}
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => handleDownload("free-tvet", true)}
                  disabled={downloading !== null}
                >
                  {downloading === `free-tvet-${selectedExamId}-true` ? (
                    "Downloading..."
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download by Programme
                    </>
                  )}
                </Button>
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
                <Button
                  className="w-full"
                  onClick={() => handleDownload("referral", false)}
                  disabled={downloading !== null}
                >
                  {downloading === `referral-${selectedExamId}-false` ? (
                    "Downloading..."
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Download Invoice
                    </>
                  )}
                </Button>
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
