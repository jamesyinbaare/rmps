import { z } from "zod";

export const candidateFormSchema = z.object({
  school_id: z.number().int().positive("School is required"),
  programme_id: z.number().int().positive().optional().nullable(),
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters"),
  index_number: z.string().min(1, "Index number is required").max(50, "Index number must be less than 50 characters"),
  date_of_birth: z.date().optional().nullable(),
  gender: z.enum(["Male", "Female"]).optional().nullable(),
});

export type CandidateFormValues = z.infer<typeof candidateFormSchema>;
