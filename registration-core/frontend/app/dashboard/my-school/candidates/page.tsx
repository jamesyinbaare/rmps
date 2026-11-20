import { redirect } from "next/navigation";

export default function CandidatesRedirectPage() {
  redirect("/dashboard/my-school/examinations");
}
