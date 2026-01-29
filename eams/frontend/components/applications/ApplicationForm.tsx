"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSubjectSelect } from "@/components/ui/searchable-subject-select";
import { getSubjectTypes, getSubjects } from "@/lib/api";
import type {
  ExaminerApplicationCreate,
  ExaminerApplicationResponse,
  ExaminerApplicationUpdate,
  Subject,
  SubjectTypeOption,
} from "@/types";

const TITLE_OPTIONS = [
  { value: "__none__", label: "Select title" },
  { value: "Mr.", label: "Mr." },
  { value: "Mrs.", label: "Mrs." },
  { value: "Ms.", label: "Ms." },
  { value: "Miss", label: "Miss" },
  { value: "Rev.", label: "Rev." },
  { value: "Dr.", label: "Dr." },
  { value: "Prof.", label: "Prof." },
] as const;

const applicationSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  title: z.string().refine((v) => v && v !== "__none__", "Title is required"),
  nationality: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  office_address: z.string().optional().nullable(),
  residential_address: z.string().optional().nullable(),
  email_address: z.string().email("Invalid email address").min(1, "Email address is required"),
  telephone_office: z.string().optional().nullable(),
  telephone_cell: z.string().optional().nullable(),
  present_school_institution: z.string().optional().nullable(),
  present_rank_position: z.string().optional().nullable(),
  subject_type: z.string().min(1, "Subject type is required"),
  subject_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .refine((v) => v != null && v !== "", "Please select a subject"),
  additional_information: z.string().optional().nullable(),
  ceased_examining_explanation: z.string().optional().nullable(),
}).refine(
  (data) => data.telephone_office || data.telephone_cell,
  {
    message: "At least one telephone number is required",
    path: ["telephone_cell"],
  }
);

type ApplicationFormData = z.infer<typeof applicationSchema>;

type ApplicationFormInitialData = Partial<ExaminerApplicationCreate> &
  Partial<ExaminerApplicationUpdate> & {
  subject_id?: string | null;
  subject?: { id: string; name: string; type?: string | null } | null;
};

interface ApplicationFormProps {
  initialData?: ApplicationFormInitialData | ExaminerApplicationResponse;
  onSubmit: (data: ExaminerApplicationCreate | ExaminerApplicationUpdate) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  loading?: boolean;
}

export function ApplicationForm({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Save as Draft",
  loading = false,
}: ApplicationFormProps) {
  const defaultValues: ApplicationFormData = initialData
    ? {
        full_name: initialData.full_name ?? "",
        title: initialData.title ?? "__none__",
        nationality: initialData.nationality ?? null,
        date_of_birth: initialData.date_of_birth ?? null,
        office_address: initialData.office_address ?? null,
        residential_address: initialData.residential_address ?? null,
        email_address: initialData.email_address ?? "",
        telephone_office: initialData.telephone_office ?? null,
        telephone_cell: initialData.telephone_cell ?? null,
        present_school_institution: initialData.present_school_institution ?? null,
        present_rank_position: initialData.present_rank_position ?? null,
        subject_type: (initialData as ApplicationFormInitialData).subject?.type ?? (initialData as ApplicationFormInitialData).subject_area ?? "",
        subject_id: (initialData as ApplicationFormInitialData).subject_id ?? null,
        additional_information: initialData.additional_information ?? null,
        ceased_examining_explanation: initialData.ceased_examining_explanation ?? null,
      }
    : {
        full_name: "",
        title: "__none__",
        nationality: null,
        date_of_birth: null,
        office_address: null,
        residential_address: null,
        email_address: "",
        telephone_office: null,
        telephone_cell: null,
        present_school_institution: null,
        present_rank_position: null,
        subject_type: "",
        subject_id: null,
        additional_information: null,
        ceased_examining_explanation: null,
      };

  const [subjectTypeOptions, setSubjectTypeOptions] = useState<SubjectTypeOption[]>([]);
  const [subjectsByType, setSubjectsByType] = useState<Subject[]>([]);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<ApplicationFormData>({
    resolver: zodResolver(applicationSchema),
    defaultValues,
  });

  useEffect(() => {
    getSubjectTypes()
      .then(setSubjectTypeOptions)
      .catch(() => setSubjectTypeOptions([]));
  }, []);

  const watchedSubjectType = watch("subject_type");
  useEffect(() => {
    if (!watchedSubjectType) {
      setSubjectsByType([]);
      return;
    }
    getSubjects(watchedSubjectType as import("@/types").SubjectType)
      .then(setSubjectsByType)
      .catch(() => setSubjectsByType([]));
  }, [watchedSubjectType]);

  const handleFormSubmit = async (data: ApplicationFormData) => {
    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Particulars</CardTitle>
          <CardDescription>Enter your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                {...register("full_name")}
                disabled={loading}
              />
              {errors.full_name && (
                <p className="text-sm text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="title"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value ?? "__none__"}
                    onValueChange={(v) => field.onChange(v)}
                    disabled={loading}
                  >
                    <SelectTrigger id="title">
                      <SelectValue placeholder="Select title" />
                    </SelectTrigger>
                    <SelectContent>
                      {TITLE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nationality">Nationality</Label>
              <Input
                id="nationality"
                {...register("nationality")}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                {...register("date_of_birth")}
                disabled={loading}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="office_address">Office Address</Label>
            <Textarea
              id="office_address"
              {...register("office_address")}
              disabled={loading}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="residential_address">Residential Address</Label>
            <Textarea
              id="residential_address"
              {...register("residential_address")}
              disabled={loading}
              rows={3}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email_address">
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email_address"
                type="email"
                {...register("email_address")}
                disabled={loading}
              />
              {errors.email_address && (
                <p className="text-sm text-destructive">{errors.email_address.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone_office">Telephone (Office)</Label>
              <Input
                id="telephone_office"
                type="tel"
                {...register("telephone_office")}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone_cell">
                Telephone (Cell) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="telephone_cell"
                type="tel"
                {...register("telephone_cell")}
                disabled={loading}
              />
              {errors.telephone_cell && (
                <p className="text-sm text-destructive">{errors.telephone_cell.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="present_school_institution">Present School/Institution</Label>
              <Input
                id="present_school_institution"
                {...register("present_school_institution")}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="present_rank_position">Present Rank/Position</Label>
              <Input
                id="present_rank_position"
                {...register("present_rank_position")}
                disabled={loading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject & Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="subject_type">
              Subject Type <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="subject_type"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || ""}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("subject_id", null);
                  }}
                  disabled={loading}
                >
                  <SelectTrigger id="subject_type" className="w-full">
                    <SelectValue placeholder="Select subject type" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjectTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.subject_type && (
              <p className="text-sm text-destructive">{errors.subject_type.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject_id">
              Subject <span className="text-destructive">*</span>
            </Label>
            <Controller
              name="subject_id"
              control={control}
              render={({ field }) => (
                <SearchableSubjectSelect
                  id="subject_id"
                  subjects={subjectsByType}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={
                    getValues("subject_type")
                      ? "Search or select subject..."
                      : "Select a subject type first"
                  }
                  disabled={loading || !getValues("subject_type")}
                  aria-invalid={!!errors.subject_id}
                  aria-describedby={errors.subject_id ? "subject_id_error" : undefined}
                />
              )}
            />
            {errors.subject_id && (
              <p id="subject_id_error" className="text-sm text-destructive" role="alert">
                {errors.subject_id.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="additional_information">Additional Information</Label>
            <Textarea
              id="additional_information"
              {...register("additional_information")}
              placeholder="Any additional information you would like to provide"
              disabled={loading}
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ceased_examining_explanation">
              Ceased Examining Explanation (if applicable)
            </Label>
            <Textarea
              id="ceased_examining_explanation"
              {...register("ceased_examining_explanation")}
              placeholder="If you have previously ceased examining, please provide an explanation"
              disabled={loading}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
