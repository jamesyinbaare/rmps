import type { ReactNode } from "react";

interface HomeHeroProps {
  greeting: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function HomeHero({ greeting, subtitle, actions }: HomeHeroProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="relative text-[28px] font-medium leading-[36px] tracking-[-0.03em] text-foreground md:text-[34px] md:leading-[42px]">
          {greeting}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
