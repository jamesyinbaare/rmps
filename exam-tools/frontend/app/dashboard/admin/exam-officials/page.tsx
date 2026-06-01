"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { OfficialAccountsCommandBar } from "@/components/official-accounts-command-bar";
import { OfficialAccountsTable } from "@/components/official-accounts-table";
import { RoleGuard } from "@/components/role-guard";
import {
  apiJson,
  downloadAdminExamCentreOfficialsExport,
  downloadAdminExamCentreOfficialsBogExport,
  examOfficialsBogExportFilename,
  listAdminExamCentreOfficials,
  listExaminationCentres,
  type AdminExamCentreOfficialRow,
  type AdminExamCentreOfficialsExportLayout,
  type Examination,
  type PerExamCentreItem,
  type RecordSubjectScope,
  type TimetableSubjectFilter,
} from "@/lib/api";
import { OfficialAccountsRoleTabs } from "@/components/official-accounts-role-tabs";
import {
  countDistinctCentres,
  matchesAdminOfficialSearch,
  sortAdminOfficialRows,
  type AdminOfficialSortDir,
  type AdminOfficialSortKey,
} from "@/lib/admin-exam-official-rows";
import {
  OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF,
  officialAccountsBtnSecondary,
  officialAccountsPageLayoutClass,
  officialAccountsPanelFillClass,
  officialAccountsTabPanelClass,
} from "@/lib/official-accounts-zone";
import { REGION_OPTIONS } from "@/lib/school-enums";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 100;

type SectionId = "invigilators" | "supervisors" | "inspectors_depot" | "police";

type SectionConfig = {
  id: SectionId;
  title: string;
  tabHelper?: string;
  designations: string[];
  showDesignationColumn: boolean;
  emptyLabel: string;
  exportSlug: string;
  exportLayouts: AdminExamCentreOfficialsExportLayout[];
};

const OFFICIAL_ACCOUNT_SECTIONS: SectionConfig[] = [
  {
    id: "invigilators",
    title: "Invigilators",
    tabHelper: "Exports are split per centre (zip) or as a single combined workbook.",
    designations: ["Invigilator"],
    showDesignationColumn: false,
    emptyLabel: "No invigilators for this filter.",
    exportSlug: "invigilators",
    exportLayouts: ["zip", "combined"],
  },
  {
    id: "supervisors",
    title: "Supervisors",
    designations: ["Supervisor", "Assistant Supervisor"],
    showDesignationColumn: true,
    emptyLabel: "No supervisors for this filter.",
    exportSlug: "supervisors",
    exportLayouts: ["single_sheet"],
  },
  {
    id: "inspectors_depot",
    title: "External inspectors & depot keepers",
    designations: ["External Inspector", "Depot Keeper"],
    showDesignationColumn: true,
    emptyLabel: "No external inspectors or depot keepers for this filter.",
    exportSlug: "inspectors_depot",
    exportLayouts: ["single_sheet"],
  },
  {
    id: "police",
    title: "Police officers",
    designations: ["Police Officer"],
    showDesignationColumn: false,
    emptyLabel: "No police officers for this filter.",
    exportSlug: "police_officers",
    exportLayouts: ["single_sheet"],
  },
];

const SECTION_TAB_LABELS: Record<SectionId, string> = {
  invigilators: "Invigilators",
  supervisors: "Supervisors",
  inspectors_depot: "Inspectors & depot",
  police: "Police",
};

const VALID_SECTION_IDS = new Set<SectionId>(OFFICIAL_ACCOUNT_SECTIONS.map((s) => s.id));

function parseSectionTab(raw: string | null): SectionId {
  if (raw && VALID_SECTION_IDS.has(raw as SectionId)) return raw as SectionId;
  return "invigilators";
}

const DEFAULT_SUBJECT_SCOPE: RecordSubjectScope = "CORE";

function parseScope(raw: string | null): RecordSubjectScope {
  if (raw === "CORE" || raw === "ELECTIVE") return raw;
  return DEFAULT_SUBJECT_SCOPE;
}

function scopeToCentreSummaryFilter(scope: RecordSubjectScope): TimetableSubjectFilter {
  return scope === "CORE" ? "CORE_ONLY" : "ELECTIVE_ONLY";
}

function formatExamLabel(ex: Examination): string {
  return `${ex.year}${ex.exam_series ? ` ${ex.exam_series}` : ""} — ${ex.exam_type}`;
}

type SectionState = {
  items: AdminExamCentreOfficialRow[];
  total: number;
  page: number;
  busy: boolean;
  regionFilter: string;
  centerId: string;
  subjectScopeFilter: RecordSubjectScope;
  searchQuery: string;
  sortKey: AdminOfficialSortKey;
  sortDir: AdminOfficialSortDir;
  groupByCentre: boolean;
  /** Set after a successful fetch; used to avoid refetching unchanged tab data. */
  loadedQueryKey: string;
};

function sectionQueryKey(
  examId: number,
  filters: Pick<SectionState, "regionFilter" | "centerId" | "subjectScopeFilter">,
): string {
  return `${examId}:${filters.regionFilter}:${filters.centerId}:${filters.subjectScopeFilter}`;
}

function emptySectionState(): SectionState {
  return {
    items: [],
    total: 0,
    page: 1,
    busy: false,
    regionFilter: "",
    centerId: "",
    subjectScopeFilter: DEFAULT_SUBJECT_SCOPE,
    searchQuery: "",
    sortKey: "center_code",
    sortDir: "asc",
    groupByCentre: false,
    loadedQueryKey: "",
  };
}

function allSectionsEmpty(): Record<SectionId, SectionState> {
  return Object.fromEntries(OFFICIAL_ACCOUNT_SECTIONS.map((s) => [s.id, emptySectionState()])) as Record<
    SectionId,
    SectionState
  >;
}

function exportFilenameBase(exam: Examination | null): string {
  if (!exam) return "exam";
  const parts = [String(exam.year), exam.exam_series?.trim() || "", exam.exam_type.trim()].filter(Boolean);
  const raw = `${exam.id}_${parts.join("_")}`;
  return raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || `exam_${exam.id}`;
}

function AdminExamOfficialsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exams, setExams] = useState<Examination[]>([]);
  const [examId, setExamId] = useState<number | null>(null);
  const [centers, setCenters] = useState<PerExamCentreItem[]>([]);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [sectionState, setSectionState] = useState<Record<SectionId, SectionState>>(allSectionsEmpty);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("invigilators");
  const prevExamIdRef = useRef<number | null>(null);
  const skipActiveFilterFetchRef = useRef(false);
  const sectionStateRef = useRef(sectionState);
  sectionStateRef.current = sectionState;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await apiJson<Examination[]>("/examinations");
        if (cancelled) return;
        setExams(list);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load examinations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (exams.length === 0 || urlHydrated) return;
    const rawExam = searchParams.get("exam");
    if (rawExam) {
      const n = Number.parseInt(rawExam, 10);
      if (!Number.isNaN(n) && exams.some((e) => e.id === n)) setExamId(n);
    } else {
      setExamId(exams.length ? exams[0]!.id : null);
    }
    const tab = parseSectionTab(searchParams.get("tab"));
    setActiveSection(tab);
    const cid = searchParams.get("centerId")?.trim() ?? "";
    const reg = searchParams.get("region")?.trim() ?? "";
    const regOk = reg && REGION_OPTIONS.some((r) => r.value === reg) ? reg : "";
    const scope = parseScope(searchParams.get("scope"));
    setSectionState((prev) => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        centerId: cid,
        regionFilter: regOk,
        subjectScopeFilter: scope,
      },
    }));
    setUrlHydrated(true);
  }, [exams, searchParams, urlHydrated]);

  const activeSt = sectionState[activeSection];

  useEffect(() => {
    if (!urlHydrated) return;
    const p = new URLSearchParams();
    if (examId != null) p.set("exam", String(examId));
    if (activeSt.centerId.trim()) p.set("centerId", activeSt.centerId.trim());
    if (activeSt.regionFilter) p.set("region", activeSt.regionFilter);
    p.set("scope", activeSt.subjectScopeFilter);
    if (activeSection !== "invigilators") p.set("tab", activeSection);
    const next = p.toString();
    const cur = searchParams.toString();
    if (next === cur) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    urlHydrated,
    examId,
    activeSt.centerId,
    activeSt.regionFilter,
    activeSt.subjectScopeFilter,
    activeSection,
    pathname,
    router,
    searchParams,
  ]);

  useEffect(() => {
    if (examId == null) {
      setCenters([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await listExaminationCentres(examId);
        if (cancelled) return;
        setCenters(data.items);
        setSectionState((prev) => {
          const next = { ...prev };
          for (const s of OFFICIAL_ACCOUNT_SECTIONS) {
            const st = next[s.id];
            if (st.centerId && !data.items.some((c) => c.id === st.centerId)) {
              next[s.id] = { ...st, centerId: "" };
            }
          }
          return next;
        });
      } catch {
        if (!cancelled) setCenters([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const selectedExam = useMemo(() => exams.find((e) => e.id === examId) ?? null, [exams, examId]);

  const activeConfig =
    OFFICIAL_ACCOUNT_SECTIONS.find((s) => s.id === activeSection) ?? OFFICIAL_ACCOUNT_SECTIONS[0]!;

  const filteredCenters = useMemo(() => {
    if (!activeSt.regionFilter) return centers;
    return centers.filter((c) => c.region === activeSt.regionFilter);
  }, [centers, activeSt.regionFilter]);

  const centerOptions = useMemo(
    () =>
      filteredCenters.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
      })),
    [filteredCenters],
  );

  const selectedCentre = useMemo(
    () => centers.find((c) => c.id === activeSt.centerId) ?? null,
    [centers, activeSt.centerId],
  );

  const patchActiveSection = useCallback(
    (patch: Partial<SectionState>, options?: { resetPage?: boolean }) => {
      setSectionState((prev) => {
        const cur = prev[activeSection];
        const centreCleared =
          patch.regionFilter !== undefined && patch.regionFilter !== cur.regionFilter;
        return {
          ...prev,
          [activeSection]: {
            ...cur,
            ...patch,
            centerId: centreCleared ? "" : (patch.centerId ?? cur.centerId),
            page: options?.resetPage === false ? (patch.page ?? cur.page) : 1,
          },
        };
      });
    },
    [activeSection],
  );

  const handleCentreChange = useCallback(
    (id: string) => {
      const centre = centers.find((c) => c.id === id);
      patchActiveSection({
        centerId: id,
        regionFilter: centre?.region ?? activeSt.regionFilter,
      });
    },
    [centers, activeSt.regionFilter, patchActiveSection],
  );

  const hasActiveFilters = Boolean(activeSt.regionFilter || activeSt.centerId.trim());

  const filterChips = useMemo(() => {
    const chips: { id: string; label: string; onRemove: () => void }[] = [];
    if (activeSt.regionFilter) {
      const label =
        REGION_OPTIONS.find((r) => r.value === activeSt.regionFilter)?.label ?? activeSt.regionFilter;
      chips.push({
        id: "region",
        label: `Region: ${label}`,
        onRemove: () => patchActiveSection({ regionFilter: "" }),
      });
    }
    if (activeSt.centerId.trim() && selectedCentre) {
      const reg =
        selectedCentre.region &&
        REGION_OPTIONS.find((r) => r.value === selectedCentre.region)?.label;
      chips.push({
        id: "centre",
        label: reg
          ? `Centre: ${selectedCentre.code} (${reg})`
          : `Centre: ${selectedCentre.code} — ${selectedCentre.name}`,
        onRemove: () => patchActiveSection({ centerId: "" }),
      });
    } else if (activeSt.centerId.trim()) {
      chips.push({
        id: "centre",
        label: "Centre selected",
        onRemove: () => patchActiveSection({ centerId: "" }),
      });
    }
    return chips;
  }, [activeSt.regionFilter, activeSt.centerId, selectedCentre, patchActiveSection]);

  const clearTabFilters = useCallback(() => {
    patchActiveSection({
      regionFilter: "",
      centerId: "",
      subjectScopeFilter: DEFAULT_SUBJECT_SCOPE,
    });
  }, [patchActiveSection]);

  const fetchSection = useCallback(
    async (sectionId: SectionId, page: number, filters: Pick<SectionState, "regionFilter" | "centerId" | "subjectScopeFilter">) => {
      if (examId === null) return;
      const config = OFFICIAL_ACCOUNT_SECTIONS.find((s) => s.id === sectionId);
      if (!config) return;

      setLoadError(null);
      setSectionState((prev) => ({
        ...prev,
        [sectionId]: { ...prev[sectionId], busy: true },
      }));

      const skip = (page - 1) * PAGE_SIZE;
      try {
        const res = await listAdminExamCentreOfficials({
          examination_id: examId,
          center_id: filters.centerId || null,
          designations: config.designations,
          subject_scope: filters.subjectScopeFilter,
          region: filters.regionFilter || null,
          skip,
          limit: PAGE_SIZE,
        });
        const queryKey = sectionQueryKey(examId, filters);
        setSectionState((prev) => ({
          ...prev,
          [sectionId]: {
            ...prev[sectionId],
            items: res.items,
            total: res.total,
            page,
            busy: false,
            loadedQueryKey: queryKey,
          },
        }));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to load officials";
        setLoadError(message);
        setSectionState((prev) => ({
          ...prev,
          [sectionId]: { ...prev[sectionId], items: [], total: 0, page, busy: false, loadedQueryKey: "" },
        }));
      }
    },
    [examId],
  );

  const loadActiveSection = useCallback(
    (page?: number, force = false) => {
      if (examId == null) return;
      const st = sectionStateRef.current[activeSection];
      const targetPage = page ?? st.page;
      const filters = {
        regionFilter: st.regionFilter,
        centerId: st.centerId,
        subjectScopeFilter: st.subjectScopeFilter,
      };
      const key = sectionQueryKey(examId, filters);
      if (!force) {
        if (st.busy) return;
        if (st.loadedQueryKey === key && st.page === targetPage) return;
      }
      void fetchSection(activeSection, targetPage, filters);
    },
    [examId, activeSection, fetchSection],
  );

  const retryLoad = useCallback(() => {
    loadActiveSection(undefined, true);
  }, [loadActiveSection]);

  useEffect(() => {
    if (!urlHydrated) return;
    if (examId == null) {
      setSectionState(allSectionsEmpty());
      prevExamIdRef.current = null;
      return;
    }

    const examChanged = prevExamIdRef.current !== null && prevExamIdRef.current !== examId;
    prevExamIdRef.current = examId;

    if (examChanged) {
      setSectionState(allSectionsEmpty());
    }
    skipActiveFilterFetchRef.current = false;
  }, [examId, urlHydrated]);

  useEffect(() => {
    if (examId == null || !urlHydrated) return;
    if (skipActiveFilterFetchRef.current) {
      skipActiveFilterFetchRef.current = false;
      return;
    }
    loadActiveSection();
  }, [
    activeSection,
    activeSt.regionFilter,
    activeSt.centerId,
    activeSt.subjectScopeFilter,
    examId,
    urlHydrated,
    loadActiveSection,
  ]);

  const setSectionPage = useCallback(
    (sectionId: SectionId, page: number) => {
      const st = sectionStateRef.current[sectionId];
      setSectionState((prev) => ({
        ...prev,
        [sectionId]: { ...prev[sectionId], page },
      }));
      void fetchSection(sectionId, page, {
        regionFilter: st.regionFilter,
        centerId: st.centerId,
        subjectScopeFilter: st.subjectScopeFilter,
      });
    },
    [fetchSection],
  );

  const handleSortChange = useCallback(
    (key: AdminOfficialSortKey) => {
      setSectionState((prev) => {
        const cur = prev[activeSection];
        if (cur.sortKey === key) {
          return {
            ...prev,
            [activeSection]: {
              ...cur,
              sortDir: cur.sortDir === "asc" ? "desc" : "asc",
            },
          };
        }
        return {
          ...prev,
          [activeSection]: { ...cur, sortKey: key, sortDir: "asc" },
        };
      });
    },
    [activeSection],
  );

  async function onExport(section: SectionConfig, exportKey: string) {
    if (examId === null) return;
    const st = sectionState[section.id];
    const busyKey = `${section.id}:${exportKey}`;
    setExportBusy(busyKey);
    setLoadError(null);
    const base = exportFilenameBase(selectedExam);
    const suffix = st.centerId.trim() ? `_center_${st.centerId.trim().slice(0, 8)}` : "";
    const slug =
      exportKey === "zip"
        ? `${section.exportSlug}_by_centre`
        : exportKey === "combined"
          ? `${section.exportSlug}_all_centres`
          : section.exportSlug;
    try {
      if (exportKey === "bog") {
        const filename = examOfficialsBogExportFilename(base, slug, suffix || undefined);
        await downloadAdminExamCentreOfficialsBogExport({
          examination_id: examId,
          designations: section.designations,
          export_slug: slug,
          center_id: st.centerId || null,
          subject_scope: st.subjectScopeFilter,
          region: st.regionFilter || null,
          filename,
        });
      } else {
        const layout = exportKey as AdminExamCentreOfficialsExportLayout;
        const filename =
          layout === "zip" ? `${base}${suffix}_${slug}.zip` : `${base}${suffix}_${slug}.xlsx`;
        await downloadAdminExamCentreOfficialsExport({
          examination_id: examId,
          layout,
          designations: section.designations,
          export_slug: slug,
          center_id: st.centerId || null,
          subject_scope: st.subjectScopeFilter,
          region: st.regionFilter || null,
          filename,
        });
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(null);
    }
  }

  const anyBusy = OFFICIAL_ACCOUNT_SECTIONS.some((s) => sectionState[s.id].busy);

  const displayItems = useMemo(() => {
    let rows = activeSt.items.filter((r) => matchesAdminOfficialSearch(r, activeSt.searchQuery));
    rows = sortAdminOfficialRows(rows, activeSt.sortKey, activeSt.sortDir);
    return rows;
  }, [activeSt.items, activeSt.searchQuery, activeSt.sortKey, activeSt.sortDir]);

  const exportCentreCount = useMemo(() => {
    if (activeSt.centerId.trim()) return 1;
    if (activeSt.total <= PAGE_SIZE && activeSt.items.length === activeSt.total) {
      return countDistinctCentres(activeSt.items);
    }
    return null;
  }, [activeSt.centerId, activeSt.total, activeSt.items]);

  const exportDisabledReason = useMemo(() => {
    if (examId === null) return "Select an examination";
    if (activeSt.total === 0) return "No records for current filters";
    return undefined;
  }, [examId, activeSt.total]);

  const exportOptions = useMemo(() => {
    const opts: {
      key: string;
      label: string;
      description?: string;
      primary?: boolean;
    }[] = [];
    if (activeConfig.exportLayouts.includes("combined")) {
      opts.push({
        key: "combined",
        label: "Single workbook",
        description: "All centres in one Excel file",
        primary: true,
      });
    }
    if (activeConfig.exportLayouts.includes("zip")) {
      opts.push({
        key: "zip",
        label: "Zip per centre",
        description: "One file per examination centre",
        primary: !activeConfig.exportLayouts.includes("combined"),
      });
    }
    if (activeConfig.exportLayouts.includes("single_sheet")) {
      opts.push({
        key: "single_sheet",
        label: "Export Excel",
        primary: true,
      });
    }
    opts.push({
      key: "bog",
      label: "BoG payment file",
      description: "Bank of Ghana format with serial numbers and grand total",
    });
    return opts;
  }, [activeConfig.exportLayouts]);

  const centreSummaryHref = useMemo(() => {
    if (examId == null || !activeSt.centerId.trim()) return null;
    const p = new URLSearchParams();
    p.set("exam", String(examId));
    p.set("centerId", activeSt.centerId.trim());
    p.set("st", scopeToCentreSummaryFilter(activeSt.subjectScopeFilter));
    if (activeSt.regionFilter) p.set("region", activeSt.regionFilter);
    return `${OFFICIAL_ACCOUNTS_CENTRE_SUMMARY_HREF}?${p.toString()}`;
  }, [examId, activeSt.centerId, activeSt.subjectScopeFilter, activeSt.regionFilter]);

  const roleTabs = OFFICIAL_ACCOUNT_SECTIONS.map((s) => ({
    key: s.id,
    label: SECTION_TAB_LABELS[s.id],
  }));

  const tabAnnouncement = `${SECTION_TAB_LABELS[activeSection]}, ${activeSt.busy ? "loading" : `${activeSt.total.toLocaleString()} records`}`;

  const activeFilterCount = filterChips.length;

  return (
    <div className={officialAccountsPageLayoutClass}>
      <div className={officialAccountsPanelFillClass}>
        <OfficialAccountsRoleTabs
          tabs={roleTabs}
          activeKey={activeSection}
          onChange={setActiveSection}
          ariaLabel="Official role groups"
          variant="compact"
          integratedPanel
        />

        <section
          role="tabpanel"
          id={`admin-eo-panel-${activeConfig.id}`}
          aria-labelledby={`admin-eo-tab-${activeConfig.id}`}
          className={officialAccountsTabPanelClass}
        >
          <OfficialAccountsCommandBar
            exams={exams}
            examId={examId}
            onExamChange={setExamId}
            formatExamLabel={formatExamLabel}
            sectionId={activeConfig.id}
            subjectScopeFilter={activeSt.subjectScopeFilter}
            onScopeChange={(scope) => patchActiveSection({ subjectScopeFilter: scope })}
            searchInputId={`admin-eo-search-${activeConfig.id}`}
            searchQuery={activeSt.searchQuery}
            onSearchQueryChange={(q) => patchActiveSection({ searchQuery: q }, { resetPage: false })}
            searchDisabled={activeSt.busy && activeSt.items.length === 0}
            searchLimitedToPage={activeSt.total > PAGE_SIZE}
            regionFilter={activeSt.regionFilter}
            onRegionChange={(region) => patchActiveSection({ regionFilter: region })}
            centerId={activeSt.centerId}
            onCentreChange={handleCentreChange}
            centerOptions={centerOptions}
            centresDisabled={centers.length === 0}
            centreSummaryHref={centreSummaryHref}
            activeFilterCount={activeFilterCount}
            filterChips={filterChips}
            onClearFilters={clearTabFilters}
            showInvigilatorView={activeSection === "invigilators"}
            groupByCentre={activeSt.groupByCentre}
            onGroupByCentreChange={(checked) =>
              patchActiveSection({ groupByCentre: checked }, { resetPage: false })
            }
            exportOptions={exportOptions}
            exportCentreCount={exportCentreCount}
            exportDisabled={examId === null || activeSt.total === 0 || !!exportBusy}
            exportDisabledReason={exportDisabledReason}
            exportBusy={exportBusy}
            exportFootnote={activeConfig.tabHelper}
            onExport={(key) => void onExport(activeConfig, key)}
            busy={activeSt.busy}
            total={activeSt.total}
            clientFilteredCount={
              activeSt.searchQuery.trim() ? displayItems.length : undefined
            }
          />

          {loadError ? (
            <div className="mx-3 flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 sm:mx-4">
              <p className="text-sm text-destructive">{loadError}</p>
              <button type="button" className={officialAccountsBtnSecondary} onClick={retryLoad}>
                Retry
              </button>
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <OfficialAccountsTable
              items={displayItems}
              busy={activeSt.busy}
              examId={examId}
              showDesignationColumn={activeConfig.showDesignationColumn}
              emptyLabel={activeConfig.emptyLabel}
              hasActiveFilters={hasActiveFilters}
              page={activeSt.page}
              total={activeSt.total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setSectionPage(activeConfig.id, p)}
              searchQuery={activeSt.searchQuery}
              sortKey={activeSt.sortKey}
              sortDir={activeSt.sortDir}
              onSortChange={handleSortChange}
              groupByCentre={activeSection === "invigilators" && activeSt.groupByCentre}
              clientFilteredCount={
                activeSt.searchQuery.trim() ? displayItems.length : undefined
              }
            />
          </div>
        </section>
      </div>

      <p className="sr-only" aria-live="polite">
        {anyBusy && examId != null ? "Loading official account records. " : ""}
        {tabAnnouncement}
      </p>
    </div>
  );
}

export default function AdminExamOfficialsPage() {
  return (
    <RoleGuard allowedRoles={["SUPER_ADMIN", "FINANCE_OFFICER"]} loginHref="/login/admin">
      <AdminExamOfficialsContent />
    </RoleGuard>
  );
}
