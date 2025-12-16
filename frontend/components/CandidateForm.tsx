"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { candidateFormSchema, type CandidateFormValues } from "@/lib/validations/candidate";
import { createCandidate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import type { School, Programme } from "@/types/document";
import { toast } from "sonner";

interface CandidateFormProps {
  schools: School[];
  programmes: Programme[];
  defaultSchoolId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function CandidateForm({ schools, programmes, defaultSchoolId, onSuccess, onCancel }: CandidateFormProps) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CandidateFormValues>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: {
      school_id: defaultSchoolId,
      programme_id: null,
      name: "",
      index_number: "",
      date_of_birth: null,
      gender: null,
    },
  });

  const onSubmit = async (data: CandidateFormValues) => {
    try {
      // Convert date to ISO string if present
      const submitData = {
        ...data,
        date_of_birth: data.date_of_birth ? data.date_of_birth.toISOString().split("T")[0] : null,
        gender: data.gender || null,
        programme_id: data.programme_id || null,
      };

      await createCandidate(submitData);
      toast.success("Candidate created successfully");
      reset();
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create candidate");
      console.error("Error creating candidate:", error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* School Selection */}
      <div className="space-y-2">
        <label htmlFor="school_id" className="text-sm font-medium">
          School <span className="text-destructive">*</span>
        </label>
        <Controller
          control={control}
          name="school_id"
          render={({ field }) => (
            <Select
              value={field.value?.toString()}
              onValueChange={(value) => field.onChange(parseInt(value))}
              disabled={isSubmitting || !!defaultSchoolId}
            >
              <SelectTrigger id="school_id" className="w-full" aria-invalid={!!errors.school_id}>
                <SelectValue placeholder="Select a school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id.toString()}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.school_id && (
          <p className="text-sm text-destructive">{errors.school_id.message}</p>
        )}
      </div>

      {/* Programme Selection */}
      <div className="space-y-2">
        <label htmlFor="programme_id" className="text-sm font-medium">
          Programme
        </label>
        <Controller
          control={control}
          name="programme_id"
          render={({ field }) => (
            <Select
              value={field.value?.toString() || undefined}
              onValueChange={(value) => field.onChange(value ? parseInt(value) : null)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="programme_id" className="w-full">
                <SelectValue placeholder="Select a programme (optional)" />
              </SelectTrigger>
              <SelectContent>
                {programmes.map((programme) => (
                  <SelectItem key={programme.id} value={programme.id.toString()}>
                    {programme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.programme_id && (
          <p className="text-sm text-destructive">{errors.programme_id.message}</p>
        )}
      </div>

      {/* Name */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Name <span className="text-destructive">*</span>
        </label>
        <Input
          id="name"
          {...register("name")}
          placeholder="Enter candidate name"
          disabled={isSubmitting}
          aria-invalid={!!errors.name}
          maxLength={255}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      {/* Index Number */}
      <div className="space-y-2">
        <label htmlFor="index_number" className="text-sm font-medium">
          Index Number <span className="text-destructive">*</span>
        </label>
        <Input
          id="index_number"
          {...register("index_number")}
          placeholder="Enter index number"
          disabled={isSubmitting}
          aria-invalid={!!errors.index_number}
          maxLength={50}
        />
        {errors.index_number && (
          <p className="text-sm text-destructive">{errors.index_number.message}</p>
        )}
      </div>

      {/* Date of Birth */}
      <div className="space-y-2">
        <label htmlFor="date_of_birth" className="text-sm font-medium">
          Date of Birth
        </label>
        <DatePicker
          control={control}
          name="date_of_birth"
          placeholder="Select date of birth"
          disabled={isSubmitting}
        />
        {errors.date_of_birth && (
          <p className="text-sm text-destructive">{errors.date_of_birth.message}</p>
        )}
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <label htmlFor="gender" className="text-sm font-medium">
          Gender
        </label>
        <Controller
          control={control}
          name="gender"
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={(value) => field.onChange(value || null)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="gender" className="w-full">
                <SelectValue placeholder="Select gender (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.gender && <p className="text-sm text-destructive">{errors.gender.message}</p>}
      </div>

      {/* Form Actions */}
      <div className="flex gap-4 pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating..." : "Create Candidate"}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
