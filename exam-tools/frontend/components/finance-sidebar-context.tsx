"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  FINANCE_SIDEBAR_COLLAPSED_STORAGE_KEY,
  FINANCE_SIDEBAR_WIDTH_COLLAPSED,
  FINANCE_SIDEBAR_WIDTH_EXPANDED,
} from "@/lib/finance-nav-icons";

type FinanceSidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  sidebarWidth: string;
};

const FinanceSidebarContext = createContext<FinanceSidebarContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
  /** When false, collapse state is ignored (e.g. mobile drawer always expanded). */
  persist?: boolean;
};

export function FinanceSidebarProvider({ children, persist = true }: ProviderProps) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!persist) return;
    try {
      const stored = localStorage.getItem(FINANCE_SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored === "true") setCollapsedState(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [persist]);

  const setCollapsed = useCallback(
    (value: boolean) => {
      setCollapsedState(value);
      if (persist) {
        try {
          localStorage.setItem(FINANCE_SIDEBAR_COLLAPSED_STORAGE_KEY, String(value));
        } catch {
          // ignore
        }
      }
    },
    [persist],
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      if (persist) {
        try {
          localStorage.setItem(FINANCE_SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [persist]);

  const effectiveCollapsed = persist && hydrated ? collapsed : false;

  const value = useMemo(
    (): FinanceSidebarContextValue => ({
      collapsed: effectiveCollapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth: effectiveCollapsed ? FINANCE_SIDEBAR_WIDTH_COLLAPSED : FINANCE_SIDEBAR_WIDTH_EXPANDED,
    }),
    [effectiveCollapsed, setCollapsed, toggleCollapsed],
  );

  return <FinanceSidebarContext.Provider value={value}>{children}</FinanceSidebarContext.Provider>;
}

export function useFinanceSidebar(): FinanceSidebarContextValue {
  const ctx = useContext(FinanceSidebarContext);
  if (ctx == null) {
    return {
      collapsed: false,
      setCollapsed: () => {},
      toggleCollapsed: () => {},
      sidebarWidth: FINANCE_SIDEBAR_WIDTH_EXPANDED,
    };
  }
  return ctx;
}

/** Collapsed icon rail applies on desktop only; mobile drawer stays expanded. */
export function useFinanceSidebarCollapsed(): boolean {
  const { collapsed } = useFinanceSidebar();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return collapsed && isDesktop;
}
