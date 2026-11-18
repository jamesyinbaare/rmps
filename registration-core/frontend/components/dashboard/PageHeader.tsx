import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-5", className)}>
      {back ? <div className="flex items-center gap-2">{back}</div> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="relative text-[28px] font-medium leading-[36px] tracking-[-0.03em] text-foreground md:text-[34px] md:leading-[42px]">
            {title}
          </h1>
          {subtitle ? (
            <div className="max-w-2xl text-sm text-muted-foreground">{subtitle}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
