import { redirect } from "next/navigation";

/** Legacy route — use Centre summary. */
export default function SchoolSummaryRedirectPage() {
  redirect("/dashboard/admin/centre-summary");
}
