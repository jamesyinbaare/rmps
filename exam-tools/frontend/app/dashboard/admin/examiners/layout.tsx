import { cn } from "@/lib/utils";

export default function AdminExaminersLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
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
