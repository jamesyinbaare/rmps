"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { checkPublicResults, generateResultsPDF } from "@/lib/api";
import type { PublicResultResponse, Grade } from "@/types";
import { toast } from "sonner";
import { Printer, ArrowLeft, School, GraduationCap, Camera, Download } from "lucide-react";

export default function ResultsDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [results, setResults] = useState<PublicResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    // Get results data from URL params
    const resultsData = searchParams.get("data");
    if (resultsData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(resultsData));
        setResults(parsed);
        setLoading(false);
      } catch (e) {
        toast.error("Invalid results data");
        router.push("/results");
      }
    } else {
      // If no data in URL, redirect back to search
      router.push("/results");
    }
  }, [searchParams, router]);

  const formatGrade = (grade: Grade | null): string => {
    if (!grade) {
      return "PENDING";
    }
    return grade.toUpperCase();
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!results) return;

    try {
      const blob = await generateResultsPDF({
        index_number: results.index_number || undefined,
        registration_number: results.registration_number,
        exam_type: results.exam_type,
        exam_series: results.exam_series,
        year: results.year,
      });

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `results_${results.registration_number}_${results.year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success("PDF downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download PDF");
    }
  };

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001";
  const photoUrl = results?.photo_url
    ? `${API_BASE_URL}${results.photo_url}`
    : null;

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-5xl">
        <div className="text-center py-12">Loading results...</div>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 0.5cm;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
      <div className="container mx-auto py-8 px-4 max-w-5xl print:p-0 print:max-w-full">

      {/* Print Header - only visible when printing */}
      <div className="hidden print:block mb-2 text-center border-b pb-2">
        <h1 className="text-xl font-bold">EXAMINATION RESULTS</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {results.exam_type} - {results.exam_series} {results.year}
        </p>
      </div>

      {/* Back button - hidden when printing */}
      <div className="mb-6 no-print">
        <Button variant="outline" onClick={() => router.push("/results")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Search
        </Button>
      </div>

      {/* Results Card */}
      <Card className="shadow-lg print:shadow-none print:border-0">
        <CardContent className="p-8 print:p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 print:mb-4 print:gap-4">
            {/* Candidate Information */}
            <div className="md:col-span-2 space-y-4 print:space-y-2">
              <div>
                <h2 className="text-3xl font-bold mb-2 print:text-2xl print:mb-1">{results.candidate_name}</h2>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground print:gap-2 print:text-xs">
                  {results.index_number && (
                    <span>
                      <strong>Index:</strong> {results.index_number}
                    </span>
                  )}
                  <span>
                    <strong>Registration:</strong> {results.registration_number}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t print:grid-cols-2 print:gap-2 print:pt-2">
                {results.school_name && (
                  <div className="flex items-start gap-3 print:gap-2">
                    <School className="h-5 w-5 text-primary mt-0.5 shrink-0 print:hidden" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide print:text-[10px] print:hidden">School</p>
                      <p className="font-medium print:text-sm">{results.school_name}</p>
                    </div>
                  </div>
                )}

                {results.programme_name && (
                  <div className="flex items-start gap-3 print:gap-2">
                    <GraduationCap className="h-5 w-5 text-primary mt-0.5 shrink-0 print:hidden" />
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide print:text-[10px]">Programme</p>
                      <p className="font-medium print:text-sm">{results.programme_name}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t print:pt-2 print:hidden">
                <p className="text-sm text-muted-foreground">
                  <strong>Examination:</strong> {results.exam_type}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Series:</strong> {results.exam_series} {results.year}
                </p>
              </div>
            </div>

            {/* Photo Section */}
            <div className="flex flex-col items-center justify-start print:items-start">
              <div className="relative w-40 h-48 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100 mb-4 print:w-28 print:h-36 print:mb-2 print:border">
                {photoUrl && !photoError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl}
                    alt="Candidate Photo"
                    className="w-full h-full object-cover"
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Camera className="h-16 w-16 text-gray-400 print:h-10 print:w-10" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-center print:text-[10px] print:hidden">Passport Photograph</p>
            </div>
          </div>

          {/* Results Table */}
          <div className="border-t pt-6 print:pt-2 print:border-t-2">
            <h3 className="text-xl font-semibold mb-4 print:text-base print:mb-2">Examination Results</h3>
            {results.results.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground print:py-2 print:text-sm">
                No results available for this examination
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse print:text-sm">
                  <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-left py-3 px-4 font-semibold print:py-1 print:px-2 print:text-xs">Subject</th>
                      <th className="text-left py-3 px-4 font-semibold print:py-1 print:px-2 print:text-xs">Grade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map((result, idx) => (
                      <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50 print:hover:bg-transparent">
                        <td className="py-3 px-4 font-medium print:py-1 print:px-2 print:text-xs">
                          {result.subject_name || result.subject_code}
                        </td>
                        <td className="py-3 px-4 font-semibold print:py-1 print:px-2 print:text-xs">{formatGrade(result.grade)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons at bottom - hidden when printing */}
      <div className="flex gap-4 mt-6 no-print justify-center">
        <Button onClick={handlePrint} size="lg">
          <Printer className="mr-2 h-5 w-5" />
          Print Results
        </Button>
        <Button variant="outline" size="lg" onClick={handleDownloadPDF}>
          <Download className="mr-2 h-5 w-5" />
          Download PDF
        </Button>
      </div>

      {/* Footer - only visible when printing */}
      <div className="hidden print:block mt-2 text-center text-[10px] text-muted-foreground print:text-[9px]">
        <p>This is a computer-generated document. No signature is required.</p>
        <p className="mt-1">Generated on {new Date().toLocaleDateString()}</p>
      </div>
      </div>
    </>
  );
}
