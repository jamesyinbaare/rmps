import type { RegistrationCandidateCreate, RegistrationExam } from "@/types";

export type SchoolPrimaryRegistrationType = "free_tvet" | "fee_paying";

export function primaryRegistrationType(
  exam: Pick<RegistrationExam, "allows_free_tvet"> | null | undefined
): SchoolPrimaryRegistrationType {
  return exam?.allows_free_tvet ? "free_tvet" : "fee_paying";
}

export function allowedSchoolRegistrationTypes(
  exam:
    | Pick<
        RegistrationExam,
        "exam_kind" | "allows_free_tvet" | "allows_referral_registration"
      >
    | null
    | undefined
): string[] {
  if (!exam) return [];
  if (exam.exam_kind === "private") return ["private"];
  const types: string[] = [];
  if (exam.allows_free_tvet) {
    types.push("free_tvet");
  }
  types.push("fee_paying");
  if (exam.allows_referral_registration !== false) {
    types.push("referral");
  }
  return types;
}

export function isStructuredRegistrationType(
  type: string | null | undefined
): boolean {
  return type === "free_tvet" || type === "fee_paying";
}

export function isMayJuneSeries(
  examSeries: string | null | undefined
): boolean {
  return examSeries?.toUpperCase().replace(/[-\s]/g, "/") === "MAY/JUNE";
}

export function isNovDecSeries(
  examSeries: string | null | undefined
): boolean {
  return examSeries?.toUpperCase().replace(/[-\s]/g, "/") === "NOV/DEC";
}

export function emptyCandidateForm(): RegistrationCandidateCreate {
  return {
    firstname: "",
    lastname: "",
    othername: null,
    date_of_birth: null,
    gender: null,
    programme_code: null,
    programme_id: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    national_id: null,
    disability: null,
    registration_type: null,
    school_id: null,
    guardian_name: null,
    guardian_phone: null,
    guardian_digital_address: null,
    guardian_national_id: null,
    subject_codes: [],
    subject_ids: [],
  };
}

export function registrationTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "free_tvet":
      return "Free TVET";
    case "fee_paying":
      return "Fee-paying";
    case "referral":
      return "Referral";
    case "private":
      return "Private";
    default:
      return type || "—";
  }
}
