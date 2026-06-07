"use client";

import { useCallback, useEffect, useState } from "react";

import {
  adminListDepotKeepers,
  adminListExecutiveViewers,
  adminListFinanceOfficers,
  adminListSubjectOfficers,
  adminListTestAdminOfficers,
  listInspectors,
} from "@/lib/api";

export type RoleAccountCounts = {
  testAdminOfficer: number | null;
  financeOfficer: number | null;
  executiveViewer: number | null;
  inspector: number | null;
  depotKeeper: number | null;
  subjectOfficer: number | null;
};

const emptyCounts: RoleAccountCounts = {
  testAdminOfficer: null,
  financeOfficer: null,
  executiveViewer: null,
  inspector: null,
  depotKeeper: null,
  subjectOfficer: null,
};

export function useRoleAccountCounts(refreshKey = 0) {
  const [counts, setCounts] = useState<RoleAccountCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [testAdmin, finance, executive, inspector, keeper, subjectOfficer] = await Promise.all([
        adminListTestAdminOfficers(0, 1),
        adminListFinanceOfficers(0, 1),
        adminListExecutiveViewers(0, 1),
        listInspectors({ skip: 0, limit: 1 }),
        adminListDepotKeepers(0, 1),
        adminListSubjectOfficers(0, 1),
      ]);
      setCounts({
        testAdminOfficer: testAdmin.total,
        financeOfficer: finance.total,
        executiveViewer: executive.total,
        inspector: inspector.total,
        depotKeeper: keeper.total,
        subjectOfficer: subjectOfficer.total,
      });
    } catch {
      setCounts(emptyCounts);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  return { counts, loading, reload };
}
