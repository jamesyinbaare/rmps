"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { getAllExams, listExamResultSchools } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Exam, ExamSchoolSummary } from "@/types/document";
import { ArrowLeft, Check, ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-issue-display",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-issue-body",
});

function examLabel(exam: Exam): string {
  return `${exam.exam_type} · ${exam.series} · ${exam.year}`;
}

const PREVIEW_ROWS = [
  { name: "Abena Mensah", index: "24/001/012", cert: "CERT-10482" },
  { name: "Kwame Osei", index: "24/001/018", cert: "CERT-10491" },
  { name: "Ama Boateng", index: "24/001/027", cert: "CERT-10503" },
];

export default function CertificateIssueFormsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [examId, setExamId] = useState<number | "">("");
  const [schools, setSchools] = useState<ExamSchoolSummary[]>([]);
  const [schoolsLoading, setSchoolsLoading] = useState(false);
  const [schoolsError, setSchoolsError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<number | "">("");
  const [selectedSchool, setSelectedSchool] = useState<ExamSchoolSummary | null>(
    null
  );
  const [schoolQuery, setSchoolQuery] = useState("");
  const debouncedSchoolQuery = useDebounce(schoolQuery, 300);
  const searchTerm = debouncedSchoolQuery.trim();

  useEffect(() => {
    getAllExams()
      .then((list) => setExams([...list].sort((a, b) => b.year - a.year)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!examId) {
      setSchools([]);
      setSchoolId("");
      setSelectedSchool(null);
      setSchoolQuery("");
      setSchoolsError(null);
      setSchoolsLoading(false);
      return;
    }
    if (!searchTerm) {
      setSchools([]);
      setSchoolsError(null);
      setSchoolsLoading(false);
      return;
    }
    let cancelled = false;
    setSchoolsLoading(true);
    setSchoolsError(null);
    listExamResultSchools(examId, {
      page: 1,
      page_size: 50,
      search: searchTerm,
      include_counts: false,
    })
      .then((data) => {
        if (cancelled) return;
        setSchools(data.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setSchools([]);
        const message =
          err instanceof Error ? err.message : "Failed to load schools";
        setSchoolsError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setSchoolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [examId, searchTerm]);

  const selectedExam = useMemo(
    () => exams.find((e) => e.id === examId) ?? null,
    [exams, examId]
  );

  const ready = Boolean(examId && schoolId);
  const step = !examId ? 1 : !schoolId ? 2 : 3;

  const handleContinue = () => {
    if (!examId || !schoolId) {
      toast.error("Select examination and school");
      return;
    }
    router.push(`/results/certificate-issue-forms/${examId}/schools/${schoolId}`);
  };

  return (
    <DashboardLayout title="Certificates">
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden",
          display.variable,
          body.variable
        )}
        style={{ fontFamily: "var(--font-issue-body), system-ui, sans-serif" }}
      >
        <TopBar title="Certificate issue forms" showSearch={false} />

        <div className="relative flex-1 overflow-y-auto">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 10% -10%, rgba(15,118,110,0.12), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(15,23,42,0.06), transparent 50%), linear-gradient(180deg, #f4f7f6 0%, #eef2f1 40%, #f8faf9 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />

          <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/results/certificates"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-teal-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Manage certificates
              </Link>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                {[
                  { n: 1, label: "Exam" },
                  { n: 2, label: "School" },
                  { n: 3, label: "Review" },
                ].map((s, i) => (
                  <span key={s.n} className="inline-flex items-center gap-1.5">
                    {i > 0 && <span className="mx-1 h-px w-4 bg-slate-300" />}
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                        step > s.n && "bg-teal-700 text-white",
                        step === s.n && "bg-slate-900 text-white",
                        step < s.n && "bg-slate-200 text-slate-500"
                      )}
                    >
                      {step > s.n ? <Check className="h-3 w-3" /> : s.n}
                    </span>
                    <span
                      className={cn(
                        "hidden sm:inline",
                        step === s.n ? "text-slate-800" : "text-slate-400"
                      )}
                    >
                      {s.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
              <section className="animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800/80">
                  Certificates
                </p>
                <h1
                  className="max-w-lg text-4xl font-semibold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl"
                  style={{ fontFamily: "var(--font-issue-display), Georgia, serif" }}
                >
                  Issue forms
                </h1>
                <p className="mt-3 max-w-md text-base leading-relaxed text-slate-600">
                  Print a school checklist for handover — name, index, certificate number, and a
                  tick for the receiving officer.
                </p>

                <div
                  className="relative mt-8 overflow-hidden rounded-sm shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)]"
                  style={{
                    background:
                      "linear-gradient(165deg, #fbfaf7 0%, #f3efe6 100%)",
                    transform: "rotate(-0.6deg)",
                  }}
                >
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-teal-800/80" />
                  <div className="border-b border-slate-900/10 px-6 py-5 pl-7">
                    <div
                      className="text-lg font-semibold text-slate-900"
                      style={{ fontFamily: "var(--font-issue-display), Georgia, serif" }}
                    >
                      Certificate issue form
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {selectedExam ? examLabel(selectedExam) : "Select an examination"}
                      {selectedSchool
                        ? ` · ${selectedSchool.school_code} — ${selectedSchool.school_name}`
                        : ""}
                    </div>
                  </div>
                  <div className="px-6 py-4 pl-7">
                    <div className="mb-2 grid grid-cols-[1.4fr_1fr_1fr_0.45fr] gap-2 border-b border-slate-900/15 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      <span>Candidate</span>
                      <span>Index</span>
                      <span>Cert. no.</span>
                      <span className="text-center">✓</span>
                    </div>
                    {PREVIEW_ROWS.map((row, i) => (
                      <div
                        key={row.index}
                        className={cn(
                          "grid grid-cols-[1.4fr_1fr_1fr_0.45fr] gap-2 py-2.5 text-sm text-slate-700",
                          i < PREVIEW_ROWS.length - 1 && "border-b border-slate-900/8"
                        )}
                        style={{
                          animationDelay: `${i * 80}ms`,
                        }}
                      >
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="truncate font-mono text-xs text-slate-600">
                          {row.index}
                        </span>
                        <span className="truncate font-mono text-xs text-slate-600">
                          {row.cert}
                        </span>
                        <span className="mx-auto h-4 w-4 rounded-[2px] border border-slate-400/70" />
                      </div>
                    ))}
                    <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                      Review candidates for the selected school, then generate the issue form.
                    </p>
                  </div>
                </div>
              </section>

              <section className="animate-in fade-in-0 slide-in-from-bottom-3 duration-700">
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-[0_12px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur-sm">
                  <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
                    <h2 className="text-sm font-semibold text-slate-900">Select school</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Choose examination, then school to review candidates.
                    </p>
                  </div>

                  <div className="space-y-5 px-5 py-5 sm:px-6">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        1 · Examination
                      </label>
                      <Select
                        value={examId === "" ? "" : String(examId)}
                        onValueChange={(v) => {
                          setExamId(v ? Number(v) : "");
                          setSchoolId("");
                          setSelectedSchool(null);
                          setSchoolQuery("");
                        }}
                      >
                        <SelectTrigger className="h-11 border-slate-200 bg-slate-50/80 text-left">
                          <SelectValue placeholder="Select examination" />
                        </SelectTrigger>
                        <SelectContent>
                          {exams.map((exam) => (
                            <SelectItem key={exam.id} value={String(exam.id)}>
                              {examLabel(exam)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                        2 · School
                      </label>
                      {!examId ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">
                          Select an examination to load schools
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                          <div className="relative border-b border-slate-100 bg-slate-50/80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              value={schoolQuery}
                              onChange={(e) => setSchoolQuery(e.target.value)}
                              placeholder="Search by name or school code"
                              className="h-10 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto">
                            {schoolsLoading ||
                            (schoolQuery.trim() && schoolQuery.trim() !== searchTerm) ? (
                              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Searching schools…
                              </div>
                            ) : schoolsError ? (
                              <div className="px-4 py-10 text-center text-sm text-red-500">
                                {schoolsError}
                              </div>
                            ) : !schoolQuery.trim() ? (
                              <div className="px-4 py-10 text-center text-sm text-slate-400">
                                Search by school name or code
                              </div>
                            ) : schools.length === 0 ? (
                              <div className="px-4 py-10 text-center text-sm text-slate-400">
                                No schools match
                              </div>
                            ) : (
                              <ul>
                                {schools.map((s) => {
                                  const active = schoolId === s.school_id;
                                  return (
                                    <li key={s.school_id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSchoolId(s.school_id);
                                          setSelectedSchool(s);
                                        }}
                                        className={cn(
                                          "flex w-full items-start gap-3 border-b border-slate-100 px-3.5 py-3 text-left transition-colors last:border-b-0",
                                          active
                                            ? "bg-teal-50/90"
                                            : "hover:bg-slate-50"
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                                            active
                                              ? "border-teal-700 bg-teal-700 text-white"
                                              : "border-slate-300"
                                          )}
                                        >
                                          {active && <Check className="h-2.5 w-2.5" />}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm font-medium text-slate-900">
                                            {s.school_code} — {s.school_name}
                                          </span>
                                          <span className="mt-0.5 block text-xs text-slate-500">
                                            {s.region || "No region"}
                                          </span>
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
                    {selectedSchool && selectedExam ? (
                      <p className="mb-3 text-xs leading-relaxed text-slate-600">
                        Continue to{" "}
                        <span className="font-semibold text-slate-800">
                          {selectedSchool.school_code}
                        </span>{" "}
                        · {selectedExam.series} {selectedExam.year}
                      </p>
                    ) : (
                      <p className="mb-3 text-xs text-slate-400">
                        Complete both selections to review candidates.
                      </p>
                    )}
                    <Button
                      className="h-11 w-full bg-teal-800 text-sm font-semibold hover:bg-teal-700 disabled:opacity-50"
                      disabled={!ready}
                      onClick={handleContinue}
                    >
                      Continue
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
