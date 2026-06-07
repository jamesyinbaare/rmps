import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ exam?: string }> | { exam?: string };
};

/** Legacy route — merged into Examiners hub (Roster tab). */
export default async function AllocationExaminersRedirectPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams);
  const qs = new URLSearchParams();
  qs.set("tab", "roster");
  if (params.exam) qs.set("exam", params.exam);
  redirect(`/dashboard/admin/examiners?${qs.toString()}`);
}
