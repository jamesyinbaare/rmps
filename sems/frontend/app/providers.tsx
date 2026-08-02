"use client";

import { useEffect, type ReactNode } from "react";
import {
  RouterAdapterProvider,
  ThemeProvider,
  useNextRouterAdapter,
  useTheme,
} from "@rfdtech/components/next";
import "../clet.theme";

function DarkClassSync({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [resolvedTheme]);

  return <>{children}</>;
}

function RouterProvider({ children }: { children: ReactNode }) {
  const adapter = useNextRouterAdapter();
  return (
    <RouterAdapterProvider value={adapter}>{children}</RouterAdapterProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <RouterProvider>
      <ThemeProvider defaultTheme="light" storageKey="sems-clet-theme">
        <DarkClassSync>{children}</DarkClassSync>
      </ThemeProvider>
    </RouterProvider>
  );
}
