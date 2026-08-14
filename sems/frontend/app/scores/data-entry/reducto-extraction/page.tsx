import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function LegacyScoreExtractionRedirect({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) qs.append(key, item);
    } else if (value) {
      qs.set(key, value);
    }
  }
  const query = qs.toString();
  redirect(query ? `/scores/data-entry/extraction?${query}` : "/scores/data-entry/extraction");
}
