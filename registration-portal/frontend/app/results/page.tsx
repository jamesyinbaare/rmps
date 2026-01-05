"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { checkPublicResults } from "@/lib/api";
import { toast } from "sonner";
import { Search, AlertCircle, GraduationCap, BookOpen } from "lucide-react";

export default function PublicResultsPage() {
  const router = useRouter();
  const [indexNumber, setIndexNumber] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [examType, setExamType] = useState("");
  const [examSeries, setExamSeries] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const examTypes = ["Certificate II Examination", "CBT"];
  const examSeriesOptions = ["MAY/JUNE", "NOV/DEC"];

  const handleSearch = async () => {
    if (!registrationNumber || !examType || !examSeries || !year) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await checkPublicResults({
        index_number: indexNumber || null,
        registration_number: registrationNumber,
        exam_type: examType,
        exam_series: examSeries,
        year: parseInt(year),
      });

      // Redirect to results detail page with data in URL
      const resultsData = encodeURIComponent(JSON.stringify(response));
      router.push(`/results/${response.registration_number}?data=${resultsData}`);
    } catch (err: any) {
      const errorMessage =
        err?.message || "Failed to retrieve results. Please verify your credentials.";
      setError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Graduation cap icons scattered */}
        <div className="absolute top-20 left-10 opacity-10 rotate-12">
          <GraduationCap className="h-24 w-24 text-indigo-600" />
        </div>
        <div className="absolute top-40 right-20 opacity-10 -rotate-12">
          <GraduationCap className="h-32 w-32 text-purple-600" />
        </div>
        <div className="absolute bottom-20 left-1/4 opacity-10 rotate-45">
          <GraduationCap className="h-20 w-20 text-blue-600" />
        </div>
        <div className="absolute bottom-40 right-1/3 opacity-10 -rotate-45">
          <GraduationCap className="h-28 w-28 text-indigo-500" />
        </div>
        <div className="absolute top-1/2 left-20 opacity-10 rotate-90">
          <GraduationCap className="h-16 w-16 text-purple-500" />
        </div>

        {/* Book icons */}
        <div className="absolute top-60 left-1/3 opacity-10 rotate-12">
          <BookOpen className="h-20 w-20 text-indigo-600" />
        </div>
        <div className="absolute bottom-60 right-1/4 opacity-10 -rotate-12">
          <BookOpen className="h-24 w-24 text-purple-600" />
        </div>
      </div>

      <div className="container mx-auto min-h-screen flex items-center justify-end px-4 py-8 max-w-7xl">
        <div className="w-full max-w-md relative z-10">
          <Card className="shadow-2xl border-0">
          <CardHeader className="text-center pb-6">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-4">
                <GraduationCap className="h-8 w-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">Check Your Results</CardTitle>
            <CardDescription className="mt-2">
              Enter your details to view your examination results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="registration_number">
                  Registration Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="registration_number"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  placeholder="Enter your registration number"
                />
              </div>

              <div>
                <Label htmlFor="index_number">Index Number (Optional)</Label>
                <Input
                  id="index_number"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder="Enter your index number"
                />
              </div>

              <div>
                <Label htmlFor="exam_type">
                  Examination Type <span className="text-red-500">*</span>
                </Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select examination type" />
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

              <div>
                <Label htmlFor="exam_series">
                  Examination Series <span className="text-red-500">*</span>
                </Label>
                <Select value={examSeries} onValueChange={setExamSeries}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select examination series" />
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

              <div>
                <Label htmlFor="year">
                  Year <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g., 2024"
                  min="2000"
                  max="2100"
                />
              </div>

              <Button
                onClick={handleSearch}
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-6"
                size="lg"
              >
                <Search className="mr-2 h-5 w-5" />
                {loading ? "Searching..." : "Check Results"}
              </Button>

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-600">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
