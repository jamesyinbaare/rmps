"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (value: boolean) => void;
  isMobile: boolean;
  toggle: () => void;
  toggleMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "ctvet-sidebar-collapsed";
const MOBILE_QUERY = "(max-width: 767px)";

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") setCollapsedState(true);
    } catch {
      // ignore
    }

    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) {
        setMobileOpen(false);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    setHydrated(true);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // ignore
    }
  }, []);

  const toggleMobile = useCallback(() => {
    setMobileOpen((open) => !open);
  }, []);

  const toggle = useCallback(() => {
    if (isMobile) {
      setMobileOpen((open) => !open);
    } else {
      setCollapsed(!collapsed);
    }
  }, [isMobile, collapsed, setCollapsed]);

  const value: SidebarContextValue = {
    collapsed: hydrated ? collapsed : false,
    setCollapsed,
    mobileOpen,
    setMobileOpen,
    isMobile: hydrated ? isMobile : false,
    toggle,
    toggleMobile,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
