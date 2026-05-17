import { OFFICIAL_ACCOUNTS_ZONE_ATTR } from "@/lib/official-accounts-zone";

export default function InspectorExamOfficialsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div {...OFFICIAL_ACCOUNTS_ZONE_ATTR}>{children}</div>;
}
