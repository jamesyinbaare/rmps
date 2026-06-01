import { redirect } from "next/navigation";

/** Legacy route — use Bank accounts by Centre. */
export default function SchoolSummaryRedirectPage() {
  redirect("/dashboard/admin/centre-summary");
}
