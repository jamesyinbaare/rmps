"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps, useTheme } from "next-themes";
import { useEffect } from "react";

function ThemeClassHandler() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    if (!theme) return;

    const root = document.documentElement;

    // Remove all theme classes first
    root.classList.remove('dark', 'ctvet');

    // Handle ctvet theme
    if (theme === 'ctvet') {
      root.classList.add('ctvet');
      // For ctvet theme, check system preference for dark/light
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

      if (systemTheme === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.style.colorScheme = 'light';
      }
    } else {
      // Handle regular light/dark/system themes - don't add ctvet class
      if (resolvedTheme === 'dark') {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.style.colorScheme = 'light';
      }
    }
  }, [theme, resolvedTheme]);

  // Listen for system theme changes when using ctvet
  useEffect(() => {
    if (theme !== 'ctvet') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      if (e.matches) {
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.style.colorScheme = 'light';
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

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
