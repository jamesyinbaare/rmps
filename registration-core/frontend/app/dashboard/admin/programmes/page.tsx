"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProgrammesTable } from "@/components/admin/ProgrammesTable";
import { CreateProgrammeDialog } from "@/components/admin/CreateProgrammeDialog";
import { BulkUploadProgrammesDialog } from "@/components/admin/BulkUploadProgrammesDialog";
import { ProgrammeTypesSection } from "@/components/admin/ProgrammeTypesSection";
import { SubjectsSection } from "@/components/admin/SubjectsSection";
import { listProgrammes, listAllProgrammes, listProgrammeTypes } from "@/lib/api";
import { toast } from "sonner";
import type { ProgrammeListResponse, ProgrammeType } from "@/types";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip, type StatStripItem } from "@/components/dashboard/StatStrip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProgrammesTab = "programmes" | "types" | "subjects";

const PAGE_SIZE_OPTIONS = new Set([10, 20, 50, 100]);

function resolveTab(tabParam: string | null): ProgrammesTab {
  if (tabParam === "types" || tabParam === "subjects") return tabParam;
  return "programmes";
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePageSize(value: string | null, fallback = 20): number {
  const n = parsePositiveInt(value, fallback);
  return PAGE_SIZE_OPTIONS.has(n) ? n : fallback;
}

export default function ProgrammesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));

  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePageSize(searchParams.get("page_size"), 20);
  const subjectPage = parsePositiveInt(searchParams.get("subject_page"), 1);
  const subjectPageSize = parsePageSize(searchParams.get("subject_page_size"), 20);
  const programmeTypeIdParam = searchParams.get("programme_type_id");
  const programmeTypeId =
    programmeTypeIdParam && /^\d+$/.test(programmeTypeIdParam)
      ? parseInt(programmeTypeIdParam, 10)
      : null;

  const [data, setData] = useState<ProgrammeListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [uploadSubjectOpen, setUploadSubjectOpen] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [programmeKpis, setProgrammeKpis] = useState<StatStripItem[]>([
    { label: "Total Programmes", value: 0 },
  ]);
  const [programmeTypes, setProgrammeTypes] = useState<ProgrammeType[]>([]);

  const updateQuery = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(`/dashboard/admin/programmes${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setActiveTab = (tab: ProgrammesTab) => {
    updateQuery((params) => {
      if (tab === "programmes") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }
    });
  };

  const setPage = (next: number) => {
    updateQuery((params) => {
      if (next <= 1) params.delete("page");
      else params.set("page", String(next));
    });
  };

  const setPageSize = (next: number) => {
    updateQuery((params) => {
      if (next === 20) params.delete("page_size");
      else params.set("page_size", String(next));
      params.delete("page");
    });
  };

  const setSubjectPage = (next: number) => {
    updateQuery((params) => {
      params.set("tab", "subjects");
      if (next <= 1) params.delete("subject_page");
      else params.set("subject_page", String(next));
    });
  };

  const setSubjectPageSize = (next: number) => {
    updateQuery((params) => {
      params.set("tab", "subjects");
      if (next === 20) params.delete("subject_page_size");
      else params.set("subject_page_size", String(next));
      params.delete("subject_page");
    });
  };

  const setProgrammeTypeId = (next: number | null) => {
    updateQuery((params) => {
      if (next == null) params.delete("programme_type_id");
      else params.set("programme_type_id", String(next));
      params.delete("page");
    });
  };

  const loadProgrammeKpis = useCallback(async () => {
    try {
      const all = await listAllProgrammes();
      const byType = new Map<string, number>();
      for (const programme of all) {
        const label = programme.programme_type_name?.trim() || "Unassigned";
        byType.set(label, (byType.get(label) || 0) + 1);
      }
      const typeItems: StatStripItem[] = [...byType.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value }));
      setProgrammeKpis([{ label: "Total Programmes", value: all.length }, ...typeItems]);
    } catch (error) {
      console.error("Failed to load programme KPIs", error);
    }
  }, []);

  const loadProgrammes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProgrammes(page, pageSize, programmeTypeId ?? undefined);
      let filteredItems = result.items;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = result.items.filter(
          (p) =>
            p.code.toLowerCase().includes(searchLower) ||
            p.name.toLowerCase().includes(searchLower)
        );
      }

      if (sortField) {
        filteredItems = [...filteredItems].sort((a, b) => {
          let aVal: any = a[sortField as keyof typeof a];
          let bVal: any = b[sortField as keyof typeof b];

          if (sortField === "created_at") {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
          } else {
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
          }

          if (sortDirection === "asc") {
            return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
          } else {
            return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
          }
        });
      }

      setData({
        ...result,
        items: filteredItems,
        total: search ? filteredItems.length : result.total,
      });
    } catch (error) {
      toast.error("Failed to load programmes");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, programmeTypeId, search, sortField, sortDirection]);

  useEffect(() => {
    loadProgrammes();
  }, [loadProgrammes]);

  useEffect(() => {
    loadProgrammeKpis();
  }, [loadProgrammeKpis]);

  useEffect(() => {
    listProgrammeTypes(true)
      .then((types) => {
        setProgrammeTypes(
          [...types].sort(
            (a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)
          )
        );
      })
      .catch((error) => {
        console.error("Failed to load programme types", error);
      });
  }, []);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
  };

  const handleSortChange = (field: string, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
  };

  const refreshProgrammes = async () => {
    await Promise.all([loadProgrammes(), loadProgrammeKpis()]);
  };

  const subtitle =
    activeTab === "types"
      ? "Manage the hierarchical programme type taxonomy used when setting up examinations."
      : activeTab === "subjects"
        ? "Manage and view all subjects"
        : "Manage and view all programmes";

  const headerActions =
    activeTab === "types" ? (
      <Button onClick={() => setAddTypeOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add type
      </Button>
    ) : activeTab === "subjects" ? (
      <>
        <Button onClick={() => setCreateSubjectOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Subject
        </Button>
        <Button onClick={() => setUploadSubjectOpen(true)} variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Upload Subjects
        </Button>
      </>
    ) : (
      <>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Programme
        </Button>
        <Button onClick={() => setUploadDialogOpen(true)} variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Upload Programmes
        </Button>
      </>
    );

  const programmeStatItems = useMemo(() => programmeKpis, [programmeKpis]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Programmes" subtitle={subtitle} actions={headerActions} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as ProgrammesTab)}
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="programmes">Programmes</TabsTrigger>
          <TabsTrigger value="types">Programme Types</TabsTrigger>
          <TabsTrigger value="subjects">Subjects</TabsTrigger>
        </TabsList>

        <TabsContent value="programmes" className="mt-6 space-y-6">
          <StatStrip items={programmeStatItems} />

          <ProgrammesTable
            data={data}
            loading={loading}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onSearchChange={handleSearchChange}
            onSortChange={handleSortChange}
            currentSearch={search}
            pageSize={pageSize}
            sortField={sortField}
            sortDirection={sortDirection}
            programmeTypes={programmeTypes}
            programmeTypeId={programmeTypeId}
            onProgrammeTypeChange={setProgrammeTypeId}
          />

          <CreateProgrammeDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onSuccess={refreshProgrammes}
          />

          <BulkUploadProgrammesDialog
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            onSuccess={refreshProgrammes}
          />
        </TabsContent>

        <TabsContent value="types" className="mt-6">
          <ProgrammeTypesSection
            showAddButton={false}
            addOpen={addTypeOpen}
            onAddOpenChange={setAddTypeOpen}
          />
        </TabsContent>

        <TabsContent value="subjects" className="mt-6">
          <SubjectsSection
            showAddButtons={false}
            createOpen={createSubjectOpen}
            onCreateOpenChange={setCreateSubjectOpen}
            uploadOpen={uploadSubjectOpen}
            onUploadOpenChange={setUploadSubjectOpen}
            page={subjectPage}
            pageSize={subjectPageSize}
            onPageChange={setSubjectPage}
            onPageSizeChange={setSubjectPageSize}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
