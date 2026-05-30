import { redirect } from "next/navigation";

/** Legacy route — use Centre analysis. */
export default function SchoolSummaryRedirectPage() {
  redirect("/dashboard/admin/centre-summary");
}
