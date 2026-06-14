import { redirect } from "next/navigation";

import { EXAMINER_ACCOUNTS_BY_SUBJECT_HREF } from "@/lib/official-accounts-zone";

export default function ExaminersBySubjectRedirectPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") p.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => p.append(key, v));
  }
  const qs = p.toString();
  redirect(qs ? `${EXAMINER_ACCOUNTS_BY_SUBJECT_HREF}?${qs}` : EXAMINER_ACCOUNTS_BY_SUBJECT_HREF);
}
