import { redirect } from "next/navigation";

export default function SupervisorNoticeRedirectPage() {
  redirect("/dashboard/supervisor/examination-notice");
}
