"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  listAvailableExams,
  registerCandidate,
  getSchoolDashboard,
  listSchoolProgrammes,
  getProgrammeSubjects,
  uploadCandidatePhoto,
  listExaminationCenters,
  type ExaminationCenter,
} from "@/lib/api";
import type {
  RegistrationExam,
  RegistrationCandidateCreate,
  SchoolDashboardData,
  Programme,
  ProgrammeSubjectRequirements,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { SubjectSelectionPanel } from "@/components/school/SubjectSelectionPanel";
import {
  allowedSchoolRegistrationTypes,
  emptyCandidateForm,
  primaryRegistrationType,
  registrationTypeLabel,
} from "@/lib/school-registration";
import { autoSelectSubjectIds } from "@/lib/subject-auto-select";

export default function RegisterSingleCandidatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examIdParam = searchParams.get("exam_id");
  const programmeIdParam = searchParams.get("programme_id");

  const [loading, setLoading] = useState(true);
  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeSubjects, setProgrammeSubjects] =
    useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [formData, setFormData] =
    useState<RegistrationCandidateCreate>(emptyCandidateForm());
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [centers, setCenters] = useState<ExaminationCenter[]>([]);
  const [loadingCenters, setLoadingCenters] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!examIdParam) {
        toast.error("Select an examination first");
        router.replace("/dashboard/my-school/register");
        return;
      }
      setLoading(true);
      try {
        const [exams, dashboard] = await Promise.all([
          listAvailableExams(),
          getSchoolDashboard(),
        ]);
        const found = exams.find((e) => e.id.toString() === examIdParam);
        if (!found) {
          toast.error("Examination not found");
          router.replace("/dashboard/my-school/register");
          return;
        }
        setExam(found);
        setSchoolData(dashboard);

        const primary =
          found.exam_kind === "private"
            ? "private"
            : primaryRegistrationType(found);
        setFormData((prev) => ({
          ...prev,
          registration_type: primary,
          school_id:
            found.exam_kind === "private"
              ? dashboard?.school?.id ?? null
              : null,
        }));

        const progs = await listSchoolProgrammes(found.id);
        setProgrammes(progs);

        if (programmeIdParam) {
          const preselected = progs.find(
            (p) => p.id.toString() === programmeIdParam
          );
          if (preselected) {
            setFormData((prev) => ({
              ...prev,
              programme_id: preselected.id,
              programme_code: preselected.code,
            }));
          }
        }

        if (found.exam_kind === "private") {
          setLoadingCenters(true);
          try {
            const list = await listExaminationCenters(found.id);
            setCenters(list);
          } catch {
            toast.error("Failed to load examination centers");
          } finally {
            setLoadingCenters(false);
          }
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load registration form");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [examIdParam, router]);

  useEffect(() => {
    if (!formData.programme_id || !exam) {
      setProgrammeSubjects(null);
      setSelectedSubjectIds([]);
      return;
    }
    const load = async () => {
      setLoadingSubjects(true);
      try {
        const subjects = await getProgrammeSubjects(formData.programme_id!);
        setProgrammeSubjects(subjects);
        setSelectedSubjectIds(
          autoSelectSubjectIds(
            subjects,
            formData.registration_type,
            exam.exam_series,
            exam.allows_free_tvet
          )
        );
      } catch {
        toast.error("Failed to load programme subjects");
        setProgrammeSubjects(null);
      } finally {
        setLoadingSubjects(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when programme or type changes
  }, [formData.programme_id, formData.registration_type, exam?.id]);

  const typeOptions = allowedSchoolRegistrationTypes(exam);

  const handlePhotoChange = (file: File | null) => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setSelectedPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exam) return;
    if (!formData.firstname || !formData.lastname) {
      toast.error("First name and last name are required");
      return;
    }
    if (!formData.date_of_birth) {
      toast.error("Date of birth is required");
      return;
    }
    if (!formData.gender) {
      toast.error("Gender is required");
      return;
    }
    if (!formData.programme_id) {
      toast.error("Programme selection is required");
      return;
    }
    if (selectedSubjectIds.length === 0) {
      toast.error("At least one subject must be selected");
      return;
    }
    setSubmitting(true);
    try {
      const isPrivate = exam.exam_kind === "private";
      const primary = primaryRegistrationType(exam);
      const submitData: RegistrationCandidateCreate = {
        ...formData,
        registration_type: isPrivate
          ? "private"
          : formData.registration_type || primary,
        school_id: isPrivate
          ? formData.school_id ?? schoolData?.school?.id ?? null
          : null,
        subject_ids: selectedSubjectIds,
      };
      const created = await registerCandidate(exam.id, submitData);
      if (selectedPhoto && created.id) {
        try {
          await uploadCandidatePhoto(created.id, selectedPhoto);
        } catch {
          toast.warning(
            "Candidate registered but photo upload failed. You can upload it later."
          );
        }
      }
      toast.success("Candidate registered successfully");
      setSuccess(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to register candidate"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const hubHref = exam
    ? `/dashboard/my-school/register/${exam.id}`
    : "/dashboard/my-school/register";

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!exam) return null;

  if (success) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          back={
            <Button variant="ghost" asChild>
              <Link href={hubHref}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to register
              </Link>
            </Button>
          }
          title="Candidate registered"
          subtitle={`${exam.exam_type} ${exam.exam_series || ""} ${exam.year}`}
        />
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-none">
          <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" />
          <p className="text-base font-semibold">Registration complete</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {formData.firstname} {formData.lastname} has been added.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSuccess(false);
                setFormData({
                  ...emptyCandidateForm(),
                  registration_type:
                    exam.exam_kind === "private"
                      ? "private"
                      : primaryRegistrationType(exam),
                  school_id:
                    exam.exam_kind === "private"
                      ? schoolData?.school?.id ?? null
                      : null,
                });
                setSelectedSubjectIds([]);
                setProgrammeSubjects(null);
                handlePhotoChange(null);
              }}
            >
              Register another
            </Button>
            <Button asChild>
              <Link href={hubHref}>View candidates</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        back={
          <Button variant="ghost" asChild>
            <Link href={hubHref}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to register
            </Link>
          </Button>
        }
        title="Register candidate"
        subtitle={`${exam.exam_type} ${exam.exam_series || ""} ${exam.year}`}
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        <section>
          <SectionLabel>Basic information</SectionLabel>
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstname">First name *</Label>
                <Input
                  id="firstname"
                  value={formData.firstname}
                  onChange={(e) =>
                    setFormData({ ...formData, firstname: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastname">Last name *</Label>
                <Input
                  id="lastname"
                  value={formData.lastname}
                  onChange={(e) =>
                    setFormData({ ...formData, lastname: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="othername">Other name</Label>
                <Input
                  id="othername"
                  value={formData.othername || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      othername: e.target.value || null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth *</Label>
                <Input
                  id="dob"
                  type="date"
                  value={formData.date_of_birth || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      date_of_birth: e.target.value || null,
                    })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select
                  value={formData.gender || ""}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gender: value || null })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Disability</Label>
                <Select
                  value={formData.disability || ""}
                  onValueChange={(value) =>
                    setFormData({ ...formData, disability: value || null })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None / select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Visual">Visual</SelectItem>
                    <SelectItem value="Auditory">Auditory</SelectItem>
                    <SelectItem value="Physical">Physical</SelectItem>
                    <SelectItem value="Cognitive">Cognitive</SelectItem>
                    <SelectItem value="Speech">Speech</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Registration type</Label>
              <Select
                value={formData.registration_type || typeOptions[0] || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, registration_type: value })
                }
                disabled={exam.exam_kind === "private"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {registrationTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {exam.exam_kind !== "private" && (
                <p className="text-xs text-muted-foreground">
                  {exam.allows_free_tvet
                    ? "Free TVET–eligible: you can register Free TVET or Fee-paying candidates."
                    : "Not Free TVET–eligible: Fee-paying is the default type for this examination."}
                </p>
              )}
            </div>

            {exam.exam_kind === "private" && (
              <div className="space-y-2">
                <Label>Examination center</Label>
                <Select
                  value={
                    formData.school_id
                      ? String(formData.school_id)
                      : schoolData?.school?.id
                        ? String(schoolData.school.id)
                        : ""
                  }
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      school_id: value ? parseInt(value, 10) : null,
                    })
                  }
                  disabled={loadingCenters}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        loadingCenters ? "Loading…" : "Select center"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {centers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Passport photo</SectionLabel>
          <div className="rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
            {photoPreview ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="h-32 w-28 rounded-md border border-border object-cover"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(photoPreview, "_blank")}
                  >
                    <ZoomIn className="mr-2 h-4 w-4" />
                    Preview
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePhotoChange(null)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  handlePhotoChange(e.target.files?.[0] || null)
                }
              />
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Programme & subjects</SectionLabel>
          <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-none md:p-6">
            <div className="space-y-2">
              <Label>Programme *</Label>
              <SearchableSelect
                options={programmes.map((p) => ({
                  value: String(p.id),
                  label: `${p.code} — ${p.name}`,
                }))}
                value={
                  formData.programme_id ? String(formData.programme_id) : undefined
                }
                onValueChange={(value) => {
                  const prog = programmes.find((p) => String(p.id) === value);
                  setFormData({
                    ...formData,
                    programme_id: value ? parseInt(value, 10) : null,
                    programme_code: prog?.code ?? null,
                  });
                }}
                placeholder="Search programmes…"
                searchPlaceholder="Search programmes…"
              />
              {programmes.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No programmes are enabled for this examination yet.
                </p>
              )}
            </div>
            <SubjectSelectionPanel
              programmeSubjects={programmeSubjects}
              loading={loadingSubjects}
              selectedSubjectIds={selectedSubjectIds}
              onChange={setSelectedSubjectIds}
              registrationType={formData.registration_type ?? null}
              examSeries={exam.exam_series}
              allowsFreeTvet={exam.allows_free_tvet}
            />
          </div>
        </section>

        <section>
          <SectionLabel
            action={<Badge variant="outline">Optional</Badge>}
          >
            Contact
          </SectionLabel>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-none sm:grid-cols-2 md:p-6">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.contact_email || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact_email: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={formData.contact_phone || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contact_phone: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Address</Label>
              <Input
                value={formData.address || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>National ID</Label>
              <Input
                value={formData.national_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    national_id: e.target.value || null,
                  })
                }
              />
            </div>
          </div>
        </section>

        <section>
          <SectionLabel
            action={<Badge variant="outline">Optional</Badge>}
          >
            Guardian
          </SectionLabel>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-none sm:grid-cols-2 md:p-6">
            <div className="space-y-2">
              <Label>Guardian name</Label>
              <Input
                value={formData.guardian_name || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    guardian_name: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Guardian phone</Label>
              <Input
                value={formData.guardian_phone || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    guardian_phone: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Digital address</Label>
              <Input
                value={formData.guardian_digital_address || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    guardian_digital_address: e.target.value || null,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Guardian national ID</Label>
              <Input
                value={formData.guardian_national_id || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    guardian_national_id: e.target.value || null,
                  })
                }
              />
            </div>
          </div>
        </section>

        {exam.exam_kind === "private" && (
          <Alert>
            <AlertDescription>
              Private examinations only accept private candidate registration.
              Guardian details are recommended.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" asChild>
            <Link href={hubHref}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Registering…
              </>
            ) : (
              "Register candidate"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
