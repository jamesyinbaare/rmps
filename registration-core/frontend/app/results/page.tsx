"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { PublicFooter } from "@/components/layout/PublicFooter";
import { checkPublicResults } from "@/lib/api";
import { toast } from "sonner";
import { ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function PublicResultsPage() {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const examTypes = ["Certificate II Examination", "CBT"];
  const examSeriesOptions = ["MAY/JUNE", "NOV/DEC"];

  const [indexNumber, setIndexNumber] = useState("");
  const [examType, setExamType] = useState(examTypes[0]);
  const [examSeries, setExamSeries] = useState(examSeriesOptions[0]);
  const [year, setYear] = useState(currentYear.toString());
  const [pin, setPin] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const indexInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    indexInputRef.current?.focus();
  }, []);

  const handleSearch = async () => {
    if (!indexNumber || !examType || !examSeries || !year || !pin || !serialNumber) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await checkPublicResults({
        index_number: indexNumber,
        registration_number: null,
        exam_type: examType,
        exam_series: examSeries,
        year: parseInt(year),
        pin: pin,
        serial_number: serialNumber,
      });

      const params = new URLSearchParams({
        index: response.index_number || "",
        exam_type: response.exam_type,
        exam_series: response.exam_series,
        year: response.year.toString(),
        pin: pin,
        serial_number: serialNumber,
      });
      router.push(
        `/results/${response.registration_number || indexNumber}?${params.toString()}`
      );
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to retrieve results. Please verify your credentials.";
      setError(errorMessage);
      toast.error(errorMessage);
      setLoading(false);
    }
  };

  return (
    <div className="public-ambient flex min-h-svh flex-col">
      <Navbar />

      <main className="flex flex-1 flex-col justify-center px-4 py-14 sm:px-6 md:px-8">
        <div className="mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start lg:gap-16">
          <header className="lg:pt-2">
            <p className="landing-enter text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              CTVET
            </p>
            <h1 className="landing-enter landing-enter-delay-1 mt-3 max-w-[12ch] text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Check results
            </h1>
            <div
              className="landing-enter landing-enter-delay-1 mt-5 h-px w-9 bg-primary"
              aria-hidden
            />
            <p className="landing-enter landing-enter-delay-2 mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              Enter your examination details and access PIN to view your
              published results.
            </p>
            <p className="landing-enter landing-enter-delay-3 mt-8 hidden text-sm text-muted-foreground/80 lg:block">
              Keep your PIN and serial number private. They are only for you.
            </p>
          </header>

          <form
            className="landing-enter landing-enter-delay-2 space-y-6 rounded-lg border border-border/70 bg-card/40 p-5 backdrop-blur-sm sm:p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSearch();
            }}
          >
            <div className="space-y-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Examination
              </p>
              <div className="space-y-2">
                <Label htmlFor="index_number">Index number</Label>
                <Input
                  id="index_number"
                  ref={indexInputRef}
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  autoComplete="off"
                  className="h-11"
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="exam_type">Examination type</Label>
                  <Select value={examType} onValueChange={setExamType}>
                    <SelectTrigger id="exam_type" className="h-11 w-full">
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

                <div className="space-y-2">
                  <Label htmlFor="exam_series">Series</Label>
                  <Select value={examSeries} onValueChange={setExamSeries}>
                    <SelectTrigger id="exam_series" className="h-11 w-full">
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

                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input
                    id="year"
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="e.g., 2024"
                    min={2000}
                    max={currentYear}
                    className="h-11"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t border-border/60 pt-5">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Access
              </p>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN</Label>
                <Input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) =>
                    setPin(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="Enter PIN"
                  maxLength={10}
                  autoComplete="off"
                  className="h-11 tracking-widest"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="serial_number">Serial number</Label>
                <Input
                  id="serial_number"
                  type="text"
                  value={serialNumber}
                  onChange={(e) =>
                    setSerialNumber(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 20)
                    )
                  }
                  placeholder="Enter serial number"
                  maxLength={20}
                  autoComplete="off"
                  className="h-11 font-mono uppercase tracking-wide"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="group w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  Check results
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </Button>

            {error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        </div>
      </main>

      <PublicFooter className="landing-enter landing-enter-delay-5" />
    </div>
  );
}
