"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getCreditBalance } from "@/lib/api";
import type { CreditBalance } from "@/types";

type ApiDashboardContextValue = {
  creditBalance: CreditBalance | null;
  refreshCreditBalance: () => Promise<void>;
};

const ApiDashboardContext = createContext<ApiDashboardContextValue | null>(null);

export function useApiDashboard(): ApiDashboardContextValue {
  const value = useContext(ApiDashboardContext);
  if (value === null) {
    throw new Error("useApiDashboard must be used within ApiDashboardProvider");
  }
  return value;
}

export function ApiDashboardProvider({ children }: { children: React.ReactNode }) {
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);

  const refreshCreditBalance = useCallback(async () => {
    try {
      const balance = await getCreditBalance();
      setCreditBalance(balance);
    } catch (error) {
      console.error("Failed to load credit balance:", error);
    }
  }, []);

  useEffect(() => {
    refreshCreditBalance();
  }, [refreshCreditBalance]);

  return (
    <ApiDashboardContext.Provider value={{ creditBalance, refreshCreditBalance }}>
      {children}
    </ApiDashboardContext.Provider>
  );
}
