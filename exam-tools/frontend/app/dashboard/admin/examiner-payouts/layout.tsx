import { cn } from "@/lib/utils";
import { OFFICIAL_ACCOUNTS_ZONE_ATTR } from "@/lib/official-accounts-zone";

export default function ExaminerPayoutsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      {...OFFICIAL_ACCOUNTS_ZONE_ATTR}
      className={cn(
        "flex min-h-[20rem] flex-col",
        "-mb-6",
        "h-[calc(100dvh-var(--official-accounts-chrome-top,6rem))]",
      )}
    >
      {children}
    </div>
  );
}
