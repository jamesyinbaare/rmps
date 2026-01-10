"use client";

import { useState, useEffect, useRef } from "react";
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
import { Navbar } from "@/components/layout/Navbar";
import { checkPublicResults } from "@/lib/api";
import { toast } from "sonner";
import { Search, AlertCircle, GraduationCap, BookOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicResultsPage() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const examTypes = ["Certificate II Examination", "CBT"];
  const examSeriesOptions = ["MAY/JUNE", "NOV/DEC"];

  const [indexNumber, setIndexNumber] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [examType, setExamType] = useState(examTypes[0]);
  const [examSeries, setExamSeries] = useState(examSeriesOptions[0]);
  const [year, setYear] = useState(currentYear.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const registrationInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the first input field when component mounts
    registrationInputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    if (!registrationNumber || !indexNumber || !examType || !examSeries || !year) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await checkPublicResults({
        index_number: indexNumber,
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
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 relative overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-background">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Graduation cap icons scattered */}
        <div className="absolute top-20 left-10 opacity-10 rotate-12">
          <GraduationCap className="h-24 w-24 text-primary" />
        </div>
        <div className="absolute top-40 right-20 opacity-10 -rotate-12">
          <GraduationCap className="h-32 w-32 text-primary" />
        </div>
        <div className="absolute bottom-20 left-1/4 opacity-10 rotate-45">
          <GraduationCap className="h-20 w-20 text-primary" />
        </div>
        <div className="absolute bottom-40 right-1/3 opacity-10 -rotate-45">
          <GraduationCap className="h-28 w-28 text-primary" />
        </div>
        <div className="absolute top-1/2 left-20 opacity-10 rotate-90">
          <GraduationCap className="h-16 w-16 text-primary" />
        </div>

        {/* Book icons */}
        <div className="absolute top-60 left-1/3 opacity-10 rotate-12">
          <BookOpen className="h-20 w-20 text-primary" />
        </div>
        <div className="absolute bottom-60 right-1/4 opacity-10 -rotate-12">
          <BookOpen className="h-24 w-24 text-primary" />
        </div>
      </div>

      <div className="container mx-auto min-h-screen flex items-center justify-center lg:justify-end px-4 py-8 max-w-7xl">
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl relative z-10">
          <Card className="shadow-lg border bg-card/50 backdrop-blur-sm">
          <CardHeader className="text-center pb-4 sm:pb-6 pt-6 sm:pt-8">
            <div className="flex justify-center mb-3 sm:mb-4">
              <div className="rounded-full bg-primary/10 p-2.5 sm:p-3">
                <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
            </div>
            <CardTitle className="text-xl sm:text-2xl font-semibold">Check Your Results</CardTitle>
            <CardDescription className="mt-2 text-sm sm:text-base">
              Enter your details to view your examination results
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 lg:px-8 pb-6 sm:pb-8">
            <div className="space-y-4 sm:space-y-5">
              <div className="relative">
                <Label
                  htmlFor="registration_number"
                  className="absolute -top-2.5 left-3 bg-card px-1.5 text-xs sm:text-sm font-medium text-foreground pointer-events-none z-10"
                >
                  Registration Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="registration_number"
                  ref={registrationInputRef}
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="w-full h-10 sm:h-11 lg:h-12 text-sm sm:text-base px-3 sm:px-4"
                />
              </div>

              <div className="relative">
                <Label
                  htmlFor="index_number"
                  className="absolute -top-2.5 left-3 bg-card px-1.5 text-xs sm:text-sm font-medium text-foreground pointer-events-none z-10"
                >
                  Index Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="index_number"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  className="w-full h-10 sm:h-11 lg:h-12 text-sm sm:text-base px-3 sm:px-4"
                />
              </div>

              <div className="relative">
                <Label
                  htmlFor="exam_type"
                  className="absolute -top-2.5 left-3 bg-card px-1.5 text-xs sm:text-sm font-medium text-foreground pointer-events-none z-10"
                >
                  Examination Type <span className="text-destructive">*</span>
                </Label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="w-full h-10 sm:h-11 lg:h-12 text-sm sm:text-base px-3 sm:px-4">
                    <SelectValue />
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

              <div className="relative">
                <Label
                  htmlFor="exam_series"
                  className="absolute -top-2.5 left-3 bg-card px-1.5 text-xs sm:text-sm font-medium text-foreground pointer-events-none z-10"
                >
                  Examination Series <span className="text-destructive">*</span>
                </Label>
                <Select value={examSeries} onValueChange={setExamSeries}>
                  <SelectTrigger className="w-full h-10 sm:h-11 lg:h-12 text-sm sm:text-base px-3 sm:px-4">
                    <SelectValue />
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

              <div className="relative">
                <Label
                  htmlFor="year"
                  className="absolute -top-2.5 left-3 bg-card px-1.5 text-xs sm:text-sm font-medium text-foreground pointer-events-none z-10"
                >
                  Year <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="year"
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="e.g., 2024"
                  min="2000"
                  max={currentYear}
                  className="w-full h-10 sm:h-11 lg:h-12 text-sm sm:text-base px-3 sm:px-4"
                />
              </div>

              <Button
                onClick={handleSearch}
                disabled={loading}
                className="w-full font-semibold py-6 mt-6"
                size="lg"
              >
                <Search className="mr-2 h-5 w-5" />
                {loading ? "Searching..." : "Check Results"}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
      </main>
    </div>
  );
}
