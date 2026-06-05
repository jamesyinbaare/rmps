"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
  useTheme,
} from "next-themes";
import { useEffect } from "react";

function ThemeClassHandler() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    const activeTheme = theme ?? resolvedTheme ?? "ctvet";
    const root = document.documentElement;
    root.classList.remove("dark", "ctvet");

    // CTVET green branding. Light = .ctvet; dark = .ctvet.dark (inspector allowances palette).
    // Classes are managed here — next-themes only stores data-theme so it does not overwrite html.class.
    root.classList.add("ctvet");

    const isDarkMode = activeTheme === "dark";
    if (isDarkMode) {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.style.colorScheme = "light";
    }
  }, [theme, resolvedTheme]);

  return null;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <ThemeClassHandler />
      {children}
    </NextThemesProvider>
  );
}
