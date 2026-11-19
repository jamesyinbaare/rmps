"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProgrammesTable } from "@/components/admin/ProgrammesTable";
import { CreateProgrammeDialog } from "@/components/admin/CreateProgrammeDialog";
import { BulkUploadProgrammesDialog } from "@/components/admin/BulkUploadProgrammesDialog";
import { ProgrammeTypesSection } from "@/components/admin/ProgrammeTypesSection";
import { SubjectsSection } from "@/components/admin/SubjectsSection";
import { listProgrammes } from "@/lib/api";
import { toast } from "sonner";
import type { ProgrammeListResponse } from "@/types";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { StatStrip } from "@/components/dashboard/StatStrip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProgrammesTab = "programmes" | "types" | "subjects";

function resolveTab(tabParam: string | null): ProgrammesTab {
  if (tabParam === "types" || tabParam === "subjects") return tabParam;
  return "programmes";
}

export default function ProgrammesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = resolveTab(searchParams.get("tab"));

  const [data, setData] = useState<ProgrammeListResponse>({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [addTypeOpen, setAddTypeOpen] = useState(false);
  const [createSubjectOpen, setCreateSubjectOpen] = useState(false);
  const [uploadSubjectOpen, setUploadSubjectOpen] = useState(false);
  const [sortField, setSortField] = useState<string | undefined>(undefined);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const setActiveTab = (tab: ProgrammesTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "programmes") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    const qs = params.toString();
    router.replace(`/dashboard/admin/programmes${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const loadProgrammes = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listProgrammes(page, 20);
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
  }, [page, search, sortField, sortDirection]);

  useEffect(() => {
    loadProgrammes();
  }, [loadProgrammes]);

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSortChange = (field: string, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
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
          <StatStrip items={[{ label: "Total Programmes", value: data.total }]} />

          <ProgrammesTable
            data={data}
            loading={loading}
            onPageChange={handlePageChange}
            onSearchChange={handleSearchChange}
            onSortChange={handleSortChange}
            currentSearch={search}
            sortField={sortField}
            sortDirection={sortDirection}
          />

          <CreateProgrammeDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onSuccess={loadProgrammes}
          />

          <BulkUploadProgrammesDialog
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
            onSuccess={loadProgrammes}
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
