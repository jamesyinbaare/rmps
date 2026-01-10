"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Leaf } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
  { value: "ctvet", label: "CTVET", icon: Leaf },
];

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
    );
  }

  const currentTheme = themes.find((t) => t.value === theme) || themes[2]; // Default to system
  const CurrentIcon = currentTheme.icon;

  const handleThemeChange = (themeValue: string) => {
    setTheme(themeValue);
    setOpen(false);
    setIsHovering(false);
  };

  const checkIsMediumOrLarger = () => {
    return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => {
        if (checkIsMediumOrLarger()) {
          setIsHovering(true);
        }
      }}
      onMouseLeave={() => {
        if (checkIsMediumOrLarger() && !open) {
          setIsHovering(false);
        }
      }}
    >
      <Popover
        open={open || isHovering}
        onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setIsHovering(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <button
            className="flex items-center justify-center p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
            aria-label="Theme switcher"
            onClick={() => {
              // On small screens, toggle on click
              if (!checkIsMediumOrLarger()) {
                setOpen(!open);
              }
            }}
          >
            <CurrentIcon className="h-4 w-4 text-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="!w-auto !min-w-[var(--radix-popover-trigger-width)] p-1 rounded-b-full rounded-t-full pt-2"
          align="center"
          sideOffset={4}
          onMouseEnter={() => {
            if (checkIsMediumOrLarger()) {
              setIsHovering(true);
            }
          }}
          onMouseLeave={() => {
            if (checkIsMediumOrLarger() && !open) {
              setIsHovering(false);
            }
          }}
        >
        <div className="flex flex-col gap-0.5">
          {themes.map((themeOption, index) => {
            const Icon = themeOption.icon;
            const isActive = theme === themeOption.value;
            const isLast = index === themes.length - 1;
            return (
              <button
                key={themeOption.value}
                onClick={() => handleThemeChange(themeOption.value)}
                className={`flex items-center justify-center p-2 transition-colors rounded-full ${
                  isActive
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "hover:bg-accent hover:text-accent-foreground text-foreground"
                }`}
                aria-label={themeOption.label}
                title={themeOption.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
    </div>
  );
}
