import { cn } from "@/lib/utils";

export function PublicFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-auto border-t border-border/50 px-4 py-8 sm:px-6 md:px-8",
        className
      )}
    >
      <div className="mx-auto max-w-3xl text-sm text-muted-foreground">
        <p>Commission for Technical and Vocational Education and Training</p>
        <p className="mt-1 text-muted-foreground/80">
          © {new Date().getFullYear()} Registration Core
        </p>
      </div>
    </footer>
  );
}
