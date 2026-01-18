"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { checkPublicResults, generateResultsPDF } from "@/lib/api";
import type { PublicResultResponse, Grade } from "@/types";
import { toast } from "sonner";
import { Printer, ArrowLeft, Download, Camera } from "lucide-react";
import Image from "next/image";

export default function ResultsDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const [results, setResults] = useState<PublicResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    // Get search criteria from URL params
    const indexNumber = searchParams.get("index");
    const examType = searchParams.get("exam_type");
    const examSeries = searchParams.get("exam_series");
    const year = searchParams.get("year");
    const registrationNumber = params.id as string;

    // Backward compatibility: check for old ?data= parameter
    const resultsData = searchParams.get("data");
    if (resultsData) {
      try {
        const parsed = JSON.parse(decodeURIComponent(resultsData));
        setResults(parsed);
        setLoading(false);
        return;
      } catch (e) {
        // Fall through to new logic if old format fails
      }
    }

    // Validate required parameters for new format
    if (!indexNumber || !examType || !examSeries || !year || !registrationNumber) {
      toast.error("Missing required parameters");
      router.push("/results");
      return;
    }

    // Fetch results from API
    const fetchResults = async () => {
      setLoading(true);
      try {
        const response = await checkPublicResults({
          index_number: indexNumber,
          registration_number: registrationNumber,
          exam_type: examType,
          exam_series: examSeries,
          year: parseInt(year),
        });
        setResults(response);
      } catch (e) {
        toast.error("Failed to load results");
        router.push("/results");
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [searchParams, router, params.id]);

  const formatGrade = (grade: Grade | null): string => {
    if (!grade) {
      return "PENDING";
    }
    return grade;
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
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">
          <div className="space-y-6 max-w-4xl mx-auto px-4 py-8">
            <div className="text-center py-12 text-muted-foreground">Loading results...</div>
          </div>
        </main>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <style>{`
          @media print {
            @page {
              size: A4;
              margin: 2cm;
            }
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>
        <div className="space-y-6 max-w-4xl mx-auto px-4 py-8 print:p-0 print:max-w-full">

          {/* Back button - hidden when printing */}
          <div className="no-print">
            <Button variant="ghost" onClick={() => router.push("/results")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>

          {/* Results Card */}
          <Card className="shadow-lg print:shadow-none print:border-0">
            <CardContent className="p-8 print:p-4">
              {/* Commission Title */}
              <div className="text-center mb-3 print:mb-2">
                <h1 className="text-xl font-bold print:text-xs">
                  Commission for Technical and Vocational Education and Training
                </h1>
              </div>

              {/* Document Title */}
              <div className="text-center mb-4 print:mb-3">
                <h2 className="text-base font-bold uppercase tracking-wide print:text-sm">
                  Statement of Results
                </h2>
              </div>

              {/* Logo */}
              <div className="text-center mb-6 print:mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-crest-only.png"
                  alt="CTVET Logo Crest"
                  className="inline-block max-w-[70px] h-auto print:max-w-[70px]"
                  onError={(e) => {
                    // Fallback if image doesn't exist
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>

              {/* QR Code and Photo Row */}
              <div className="flex justify-between items-center mb-6 print:mb-4">
                {results && (() => {
                  // Generate QR code content same as PDF
                  const qrContentLines = [];
                  qrContentLines.push(`Name: ${results.candidate_name}`);
                  qrContentLines.push(`Index Number: ${results.index_number || 'N/A'}`);
                  qrContentLines.push(`Examination: ${results.exam_type} ${results.exam_series} ${results.year}`);
                  qrContentLines.push("Results:");
                  results.results.forEach(result => {
                    const subjectName = result.subject_name || result.subject_code;
                    const grade = result.grade || 'Pending';
                    qrContentLines.push(`${subjectName}-${grade}`);
                  });
                  const qrContent = qrContentLines.join('\n');
                  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrContent)}`;

                  return (
                    <div className="w-24 h-24 border-2 border-black overflow-hidden print:w-20 print:h-20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCodeUrl}
                        alt="QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  );
                })()}
                <div className="w-24 h-24 overflow-hidden print:w-20 print:h-20 bg-white">
                  {photoUrl && !photoError ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl}
                      alt="Candidate Photo"
                      className="w-full h-full object-contain"
                      onError={() => setPhotoError(true)}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Camera className="h-8 w-8 text-gray-400 print:h-6 print:w-6" />
                    </div>
                  )}
                </div>
              </div>

              {/* Candidate Info and Exam Details Row */}
              <div className="grid grid-cols-2 gap-4 mb-6 print:mb-4 print:gap-3">
                {/* Candidate Information Box */}
                <div className="border border-black p-3 print:p-2">
                  <div className="font-bold text-xs mb-2 pb-1 border-b border-black uppercase tracking-wide print:text-[10px]">
                    Candidate Information
                  </div>
                  <div className="space-y-1.5 print:space-y-1">
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">Index Number:</span>
                      <span>{results.index_number || 'N/A'}</span>
                    </div>
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">Name:</span>
                      <span>{results.candidate_name}</span>
                    </div>
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">School:</span>
                      <span>{results.school_name || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Examination Details Box */}
                <div className="border border-black p-3 print:p-2">
                  <div className="font-bold text-xs mb-2 pb-1 border-b border-black uppercase tracking-wide print:text-[10px]">
                    Examination Details
                  </div>
                  <div className="space-y-1.5 print:space-y-1">
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">Exam Type:</span>
                      <span>{results.exam_type}</span>
                    </div>
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">Series:</span>
                      <span>{results.exam_series}</span>
                    </div>
                    <div className="text-xs print:text-[10px]">
                      <span className="font-semibold mr-2">Year:</span>
                      <span>{results.year}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t-2 border-black my-6 print:my-4"></div>

              {/* Results Section Title */}
              <div className="mb-3 print:mb-2">
                <h3 className="text-sm font-bold uppercase tracking-wide print:text-xs">
                  Subject Results
                </h3>
              </div>

              {/* Results Table */}
              {results.results.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground print:py-2 print:text-xs">
                  No results available for this examination
                </div>
              ) : (
                <div className="overflow-x-auto mb-6 print:mb-4">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="border border-black py-2 px-3 text-xs font-bold uppercase print:py-1 print:px-2 print:text-[10px]">
                          Code
                        </th>
                        <th className="border border-black py-2 px-3 text-xs font-bold uppercase print:py-1 print:px-2 print:text-[10px]">
                          Subject
                        </th>
                        <th className="border border-black py-2 px-3 text-xs font-bold uppercase text-center print:py-1 print:px-2 print:text-[10px]">
                          Grade
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.results.map((result, idx) => (
                        <tr
                          key={idx}
                          className={idx % 2 === 0 ? "bg-gray-50 print:bg-gray-50" : ""}
                        >
                          <td className="border border-black py-2 px-3 text-xs font-semibold print:py-1 print:px-2 print:text-[10px]">
                            {result.subject_code}
                          </td>
                          <td className="border border-black py-2 px-3 text-xs print:py-1 print:px-2 print:text-[10px]">
                            {result.subject_name || result.subject_code}
                          </td>
                          <td className="border border-black py-2 px-3 text-xs font-semibold text-center print:py-1 print:px-2 print:text-[10px]">
                            {formatGrade(result.grade)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Disclaimer */}
              <div className="border-2 border-black p-3 bg-yellow-50 text-center print:p-2 print:bg-yellow-50">
                <p className="text-xs font-bold uppercase print:text-[10px] leading-relaxed">
                  THE RESULTS GIVEN ABOVE ARE PROVISIONAL. THE FINAL RESULTS ARE THOSE WHICH WILL BE PRINTED ON YOUR CERTIFICATE.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons at bottom - hidden when printing */}
          <div className="flex gap-4 no-print justify-center">
            <Button onClick={handlePrint} size="lg">
              <Printer className="mr-2 h-5 w-5" />
              Print Results
            </Button>
            <Button variant="outline" size="lg" onClick={handleDownloadPDF}>
              <Download className="mr-2 h-5 w-5" />
              Download PDF
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
