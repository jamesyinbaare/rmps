export default function ExaminerRecommendationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <header className="shrink-0 border-b px-4 sm:px-6 py-4">
        <p className="text-sm font-medium text-muted-foreground">EAMS – Recommendation</p>
      </header>
      <main className="flex-1 w-full">{children}</main>
    </div>
  );
}
