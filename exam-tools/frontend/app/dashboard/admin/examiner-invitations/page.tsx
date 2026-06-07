import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ exam?: string }> | { exam?: string };
};

/** Legacy route — merged into Examiners hub (Invitations tab). */
export default async function ExaminerInvitationsRedirectPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams);
  const qs = new URLSearchParams();
  qs.set("tab", "invitations");
  if (params.exam) qs.set("exam", params.exam);
  redirect(`/dashboard/admin/examiners?${qs.toString()}`);
}
