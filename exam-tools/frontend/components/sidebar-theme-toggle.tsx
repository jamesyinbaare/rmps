"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type KeyboardEvent } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ThemeChoice = "ctvet" | "dark";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "ctvet", label: "Light mode", Icon: Sun },
  { value: "dark", label: "Dark mode", Icon: Moon },
];

type SidebarThemeToggleProps = {
  className?: string;
  align?: "center" | "start";
};

export function SidebarThemeToggle({ className, align = "center" }: SidebarThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={cn(align === "center" && "flex justify-center", className)} aria-hidden>
        <div className="h-9 w-17 rounded-full bg-muted/50 motion-safe:animate-pulse" />
      </div>
    );
  }

  const active: ThemeChoice = theme === "dark" ? "dark" : "ctvet";

  function selectTheme(next: ThemeChoice) {
    setTheme(next);
  }

  function onRadiogroupKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectTheme("dark");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectTheme("ctvet");
    }
  }

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={80}>
      <div className={cn(align === "center" && "flex justify-center", className)}>
        <div
          role="radiogroup"
          aria-label="Theme"
          onKeyDown={onRadiogroupKeyDown}
          className="relative inline-grid h-9 w-17 grid-cols-2 rounded-full border border-border/70 bg-muted/40 p-1 shadow-inner"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-card shadow-sm ring-1 ring-border/50",
              "transition-transform duration-200 ease-out motion-reduce:transition-none",
              active === "dark" && "translate-x-full",
            )}
          />

          {OPTIONS.map(({ value, label, Icon }) => {
            const checked = active === value;
            return (
              <Tooltip key={value}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={label}
                    onClick={() => selectTheme(value)}
                    className={cn(
                      "relative z-10 flex items-center justify-center rounded-full transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                      checked
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground/80",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={checked ? 2.25 : 2} aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
