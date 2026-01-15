"use client";

import { useState, useEffect } from "react";
import {
  verifyCandidate,
  verifyCandidatesBulk,
  getCreditBalance,
  type PublicResultCheckRequest,
  type PublicResultResponse,
  type BulkVerificationResponse,
  type CreditBalance,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Upload, Download, AlertCircle, Info, FileText, CheckCircle2, BookOpen, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function VerifyPage() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [loading, setLoading] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);

  // Single verification state
  const [singleData, setSingleData] = useState<PublicResultCheckRequest>({
    index_number: "",
    exam_type: "",
    exam_series: "",
    year: new Date().getFullYear(),
  });
  const [singleResult, setSingleResult] = useState<PublicResultResponse | null>(null);

  // Exam type and series options
  const examTypes = [
    "Certificate II Examinations",
    "Advance",
    "Technician Part I",
    "Technician Part II",
    "Technician Part III",
    "Diploma",
  ];
  const examSeriesOptions = ["MAY/JUNE", "NOV/DEC"];

  const isCertificateII = singleData.exam_type === "Certificate II Examinations";

  // Bulk verification state
  const [bulkResults, setBulkResults] = useState<BulkVerificationResponse | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  // Load credit balance on mount
  useEffect(() => {
    loadCreditBalance();
  }, []);

  // Clear exam_series when exam_type changes away from Certificate II
  useEffect(() => {
    if (singleData.exam_type !== "Certificate II Examinations" && singleData.exam_series) {
      setSingleData((prev) => ({ ...prev, exam_series: "" }));
    }
  }, [singleData.exam_type]);

  const loadCreditBalance = async () => {
    try {
      const balance = await getCreditBalance();
      setCreditBalance(balance);
    } catch (error) {
      // Ignore errors for credit balance
    }
  };

  const handleSingleVerify = async () => {
    if (!singleData.index_number) {
      toast.error("Index number is required");
      return;
    }
    if (!singleData.exam_type) {
      toast.error("Please select an exam type");
      return;
    }
    if (isCertificateII && !singleData.exam_series) {
      toast.error("Please select an exam series for Certificate II Examinations");
      return;
    }
    if (!singleData.year) {
      toast.error("Please enter a year");
      return;
    }

    try {
      setLoading(true);
      const result = await verifyCandidate(singleData);
      setSingleResult(result);
      await loadCreditBalance();
      toast.success("Verification successful");
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
      setSingleResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkVerify = async () => {
    if (!bulkFile) {
      toast.error("Please select a CSV file");
      return;
    }

    try {
      setLoading(true);
      const text = await bulkFile.text();
      const lines = text.split("\n").filter((line) => line.trim());
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      // Find column indices
      const indexNumIdx = headers.findIndex((h) => h.includes("index"));
      const examTypeIdx = headers.findIndex((h) => h.includes("exam_type") || h.includes("type"));
      const examSeriesIdx = headers.findIndex((h) => h.includes("exam_series") || h.includes("series"));
      const yearIdx = headers.findIndex((h) => h.includes("year"));

      if (indexNumIdx === -1) {
        toast.error("CSV must contain index_number column");
        return;
      }

      if (examTypeIdx === -1) {
        toast.error("CSV must contain exam_type column");
        return;
      }

      if (examSeriesIdx === -1) {
        toast.error("CSV must contain exam_series column");
        return;
      }

      if (yearIdx === -1) {
        toast.error("CSV must contain year column");
        return;
      }

      const items: PublicResultCheckRequest[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const indexNumber = values[indexNumIdx];
        const examType = values[examTypeIdx];
        const examSeries = values[examSeriesIdx];
        const year = yearIdx >= 0 ? parseInt(values[yearIdx]) || new Date().getFullYear() : new Date().getFullYear();

        if (!indexNumber || !examType || !examSeries) {
          toast.error(`Row ${i + 1}: Missing required fields (index_number, exam_type, exam_series)`);
          continue;
        }

        items.push({
          index_number: indexNumber,
          exam_type: examType,
          exam_series: examSeries,
          year: year,
        });
      }

      if (items.length === 0) {
        toast.error("No valid rows found in CSV");
        return;
      }

      const result = await verifyCandidatesBulk({ items });
      setBulkResults(result);
      await loadCreditBalance();
      toast.success(`Verified ${result.successful} of ${result.total} candidates`);
    } catch (error: any) {
      toast.error(error.message || "Bulk verification failed");
      setBulkResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (mode === "single" && singleResult) {
      const data = JSON.stringify(singleResult, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `verification-${singleResult.index_number || singleResult.registration_number}.json`;
      a.click();
    } else if (mode === "bulk" && bulkResults) {
      const data = JSON.stringify(bulkResults, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bulk-verification-${new Date().toISOString()}.json`;
      a.click();
    }
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Verify Results</h1>
          <p className="text-gray-600 mt-1">Verify candidate examination results</p>
        </div>
        {creditBalance && (
          <div className="text-right">
            <div className="text-sm text-gray-600">Credit Balance</div>
            <div className="text-2xl font-bold">{creditBalance.balance.toFixed(2)}</div>
            {creditBalance.balance < 10 && (
              <div className="flex items-center gap-1 text-sm text-orange-600 mt-1">
                <AlertCircle className="h-4 w-4" />
                Low balance
              </div>
            )}
            <div className="flex items-start gap-1 text-xs text-gray-500 mt-2 max-w-xs text-right">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Only successful verifications are billed. Failed requests (404) are tracked but not charged.</span>
            </div>
          </div>
        )}
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "bulk")}>
        <TabsList>
          <TabsTrigger value="single">Single Verification</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <Card>
            <CardHeader>
              <CardTitle>Single Candidate Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="index-number">Index Number <span className="text-red-500">*</span></Label>
                  <Input
                    id="index-number"
                    value={singleData.index_number || ""}
                    onChange={(e) =>
                      setSingleData({ ...singleData, index_number: e.target.value })
                    }
                    placeholder="12345"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="exam-type">Exam Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={singleData.exam_type}
                      onValueChange={(value) => {
                        setSingleData({
                          ...singleData,
                          exam_type: value,
                          exam_series: value === "Certificate II Examinations" ? singleData.exam_series : "",
                        });
                      }}
                    >
                      <SelectTrigger id="exam-type">
                        <SelectValue placeholder="Select exam type" />
                      </SelectTrigger>
                      <SelectContent>
                        {examTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isCertificateII && (
                    <div>
                      <Label htmlFor="exam-series">Exam Series <span className="text-red-500">*</span></Label>
                      <Select
                        value={singleData.exam_series}
                        onValueChange={(value) =>
                          setSingleData({ ...singleData, exam_series: value })
                        }
                      >
                        <SelectTrigger id="exam-series">
                          <SelectValue placeholder="Select series" />
                        </SelectTrigger>
                        <SelectContent>
                          {examSeriesOptions.map((series) => (
                            <SelectItem key={series} value={series}>
                              {series}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div>
                  <Label htmlFor="year">Year <span className="text-red-500">*</span></Label>
                  <Input
                    id="year"
                    type="number"
                    value={singleData.year}
                    onChange={(e) =>
                      setSingleData({ ...singleData, year: parseInt(e.target.value) || new Date().getFullYear() })
                    }
                    placeholder="2024"
                    required
                  />
                </div>
                <Button onClick={handleSingleVerify} disabled={loading} className="w-full">
                  <Search className="mr-2 h-4 w-4" />
                  {loading ? "Verifying..." : "Verify"}
                </Button>
              </div>

              {singleResult && (
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">Results</h3>
                    <Button variant="outline" onClick={handleExport}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-600">Candidate Name</p>
                        <p className="font-medium">{singleResult.candidate_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Registration Number</p>
                        <p className="font-medium">{singleResult.registration_number}</p>
                      </div>
                      {singleResult.index_number && (
                        <div>
                          <p className="text-sm text-gray-600">Index Number</p>
                          <p className="font-medium">{singleResult.index_number}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-gray-600">Exam</p>
                        <p className="font-medium">
                          {singleResult.exam_type} {singleResult.exam_series} {singleResult.year}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold mb-2">Subject Results</p>
                      <div className="space-y-2">
                        {singleResult.results.map((result, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center p-2 bg-gray-50 rounded"
                          >
                            <div>
                              <span className="font-medium">{result.subject_code}</span>
                              {result.subject_name && (
                                <span className="text-sm text-gray-600 ml-2">
                                  {result.subject_name}
                                </span>
                              )}
                            </div>
                            <span className="font-medium">
                              {result.grade || "Pending"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Instructions Card */}
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <h4 className="font-semibold text-blue-900">CSV File Format</h4>
                      <p className="text-sm text-blue-800">
                        Your CSV file must include the following columns (in any order):
                      </p>
                      <ul className="text-sm text-blue-800 space-y-1.5 list-none pl-0">
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span><strong className="font-semibold">index_number</strong> - The candidate's index number</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span><strong className="font-semibold">exam_type</strong> - Exam type (e.g., "Certificate II Examinations", "Advance", "Technician Part I")</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span><strong className="font-semibold">exam_series</strong> - Exam series ("MAY/JUNE" or "NOV/DEC")</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <span><strong className="font-semibold">year</strong> - Examination year (e.g., 2024)</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Example Table */}
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-600" />
                    <h4 className="font-semibold text-gray-900">Example CSV Format</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b">
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">index_number</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">exam_type</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">exam_series</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold">year</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-gray-300 px-3 py-2 font-mono bg-white">12345</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">Certificate II Examinations</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">MAY/JUNE</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">2024</td>
                        </tr>
                        <tr>
                          <td className="border border-gray-300 px-3 py-2 font-mono bg-white">67890</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">Advance</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">-</td>
                          <td className="border border-gray-300 px-3 py-2 bg-white">2024</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600">
                      <strong>Tip:</strong> Use simple codes (<code className="bg-gray-100 px-1 rounded">cert2</code>, <code className="bg-gray-100 px-1 rounded">mj</code>) instead of full names for shorter, cleaner CSV files. All codes are case-insensitive.
                    </p>
                    <p className="text-xs text-gray-600">
                      <strong>Note:</strong> Column names are case-insensitive and can have spaces (e.g., "Index Number", "Exam Type").
                      For non-Certificate II exams, leave exam_series empty or use "-".
                    </p>
                    <Link href="/api/dashboard/docs?tab=codes" className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium">
                      View all supported codes →
                    </Link>
                  </div>
                </div>

                {/* File Upload */}
                <div>
                  <Label htmlFor="csv-file">Upload CSV File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                    className="mt-2"
                  />
                  {bulkFile && (
                    <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      Selected: {bulkFile.name}
                    </p>
                  )}
                </div>

                <Button onClick={handleBulkVerify} disabled={loading || !bulkFile} className="w-full">
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? "Verifying..." : "Verify Bulk"}
                </Button>
              </div>

              {bulkResults && (
                <div className="mt-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold">Results</h3>
                      <p className="text-sm text-gray-600">
                        {bulkResults.successful} successful, {bulkResults.failed} failed out of{" "}
                        {bulkResults.total}
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleExport}>
                      <Download className="mr-2 h-4 w-4" />
                      Export
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div className="space-y-2">
                      {bulkResults.results.map((item, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded border ${
                            item.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium">
                                {item.request.index_number}
                              </p>
                              {item.error && (
                                <p className="text-sm text-red-600 mt-1">{item.error}</p>
                              )}
                            </div>
                            <span
                              className={`text-sm font-medium ${
                                item.success ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {item.success ? "Success" : "Failed"}
                            </span>
                          </div>
                          {item.result && (
                            <div className="mt-2 text-sm">
                              <p className="font-medium">{item.result.candidate_name}</p>
                              <p className="text-gray-600">
                                {item.result.results.length} subject(s)
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
