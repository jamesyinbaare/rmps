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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Upload, Download, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function VerifyPage() {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [loading, setLoading] = useState(false);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);

  // Single verification state
  const [singleData, setSingleData] = useState<PublicResultCheckRequest>({
    registration_number: "",
    index_number: "",
    exam_type: "",
    exam_series: "",
    year: new Date().getFullYear(),
  });
  const [singleResult, setSingleResult] = useState<PublicResultResponse | null>(null);

  // Bulk verification state
  const [bulkResults, setBulkResults] = useState<BulkVerificationResponse | null>(null);
  const [bulkFile, setBulkFile] = useState<File | null>(null);

  // Load credit balance on mount
  useEffect(() => {
    loadCreditBalance();
  }, []);

  const loadCreditBalance = async () => {
    try {
      const balance = await getCreditBalance();
      setCreditBalance(balance);
    } catch (error) {
      // Ignore errors for credit balance
    }
  };

  const handleSingleVerify = async () => {
    if (!singleData.registration_number && !singleData.index_number) {
      toast.error("Please provide either registration number or index number");
      return;
    }
    if (!singleData.exam_type || !singleData.exam_series || !singleData.year) {
      toast.error("Please fill in all required fields");
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
      const regNumIdx = headers.findIndex((h) => h.includes("registration") || h.includes("reg"));
      const indexNumIdx = headers.findIndex((h) => h.includes("index"));
      const examTypeIdx = headers.findIndex((h) => h.includes("exam_type") || h.includes("type"));
      const examSeriesIdx = headers.findIndex((h) => h.includes("series"));
      const yearIdx = headers.findIndex((h) => h.includes("year"));

      if (regNumIdx === -1 && indexNumIdx === -1) {
        toast.error("CSV must contain registration_number or index_number column");
        return;
      }

      const items: PublicResultCheckRequest[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        items.push({
          registration_number: regNumIdx >= 0 ? values[regNumIdx] : undefined,
          index_number: indexNumIdx >= 0 ? values[indexNumIdx] : undefined,
          exam_type: examTypeIdx >= 0 ? values[examTypeIdx] : "",
          exam_series: examSeriesIdx >= 0 ? values[examSeriesIdx] : "",
          year: yearIdx >= 0 ? parseInt(values[yearIdx]) || new Date().getFullYear() : new Date().getFullYear(),
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
      a.download = `verification-${singleResult.registration_number}.json`;
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
            <div className="text-2xl font-bold">{Number(creditBalance.balance || 0).toFixed(2)}</div>
            {Number(creditBalance.balance || 0) < 10 && (
              <div className="flex items-center gap-1 text-sm text-orange-600 mt-1">
                <AlertCircle className="h-4 w-4" />
                Low balance
              </div>
            )}
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="reg-number">Registration Number</Label>
                    <Input
                      id="reg-number"
                      value={singleData.registration_number || ""}
                      onChange={(e) =>
                        setSingleData({ ...singleData, registration_number: e.target.value })
                      }
                      placeholder="REG001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="index-number">Index Number (optional)</Label>
                    <Input
                      id="index-number"
                      value={singleData.index_number || ""}
                      onChange={(e) =>
                        setSingleData({ ...singleData, index_number: e.target.value })
                      }
                      placeholder="12345"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="exam-type">Exam Type</Label>
                    <Input
                      id="exam-type"
                      value={singleData.exam_type}
                      onChange={(e) =>
                        setSingleData({ ...singleData, exam_type: e.target.value })
                      }
                      placeholder="Certificate II Examination"
                    />
                  </div>
                  <div>
                    <Label htmlFor="exam-series">Exam Series</Label>
                    <Input
                      id="exam-series"
                      value={singleData.exam_series}
                      onChange={(e) =>
                        setSingleData({ ...singleData, exam_series: e.target.value })
                      }
                      placeholder="MAY/JUNE"
                    />
                  </div>
                  <div>
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      value={singleData.year}
                      onChange={(e) =>
                        setSingleData({ ...singleData, year: parseInt(e.target.value) || new Date().getFullYear() })
                      }
                    />
                  </div>
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
              <div className="space-y-4">
                <div>
                  <Label htmlFor="csv-file">CSV File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    CSV should contain: registration_number (or index_number), exam_type, exam_series, year
                  </p>
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
                                {item.request.registration_number || item.request.index_number}
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
