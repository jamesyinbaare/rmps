"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Leaf } from "lucide-react";

interface AppearanceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AppearanceSheet({ open, onOpenChange }: AppearanceSheetProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open) {
    return null;
  }

  const themes = [
    {
      id: "light",
      name: "Light",
      icon: Sun,
      description: "Light theme",
    },
    {
      id: "dark",
      name: "Dark",
      icon: Moon,
      description: "Dark theme",
    },
    {
      id: "system",
      name: "System",
      icon: Monitor,
      description: "Use system theme",
    },
    {
      id: "ctvet",
      name: "CTVET",
      icon: Leaf,
      description: "Green primary theme",
    },
  ];

  return (
    <>
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-card-foreground">Appearance</h3>
        <p className="text-sm text-muted-foreground">Choose your preferred theme</p>
      </div>
      <div className="space-y-2">
        {themes.map((themeOption) => {
          const Icon = themeOption.icon;
          const isActive = theme === themeOption.id;
          return (
            <button
              key={themeOption.id}
              onClick={() => {
                setTheme(themeOption.id);
                onOpenChange(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-all hover:bg-[var(--primary)]/20 dark:hover:bg-[var(--primary)]/15 ${
                isActive
                  ? "border-[var(--primary)] bg-[var(--primary)]/10 dark:bg-[var(--primary)]/15"
                  : "border-border"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                  isActive
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-card-foreground">{themeOption.name}</div>
                <div className="text-xs text-muted-foreground">{themeOption.description}</div>
              </div>
              {isActive && (
                <div className="h-2 w-2 rounded-full bg-[var(--primary)]" />
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
