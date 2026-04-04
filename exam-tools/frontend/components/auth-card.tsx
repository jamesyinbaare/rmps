type Props = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export function AuthCard({ title, description, children }: Props) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-base text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}
