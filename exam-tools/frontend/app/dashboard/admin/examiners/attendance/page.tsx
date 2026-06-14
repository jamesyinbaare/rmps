import { redirect } from "next/navigation";

import { EXAMINER_ATTENDANCE_HREF } from "@/lib/finance-nav";

export default function LegacyExaminersAttendanceRedirect() {
  redirect(EXAMINER_ATTENDANCE_HREF);
}
