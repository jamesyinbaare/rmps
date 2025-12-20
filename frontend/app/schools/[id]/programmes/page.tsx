"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ProgrammeDataTable } from "@/components/ProgrammeDataTable";
import {
  listSchoolProgrammes,
  removeProgrammeFromSchool,
  associateProgrammeWithSchool,
  getSchoolById,
  listProgrammes,
} from "@/lib/api";
import type { School, Programme } from "@/types/document";
import { ArrowLeft, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SchoolProgrammesPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id ? parseInt(params.id as string) : null;

  const [school, setSchool] = useState<School | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [allProgrammes, setAllProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [programmesLoading, setProgrammesLoading] = useState(false);
  const [addingProgramme, setAddingProgramme] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load school data
  useEffect(() => {
    const loadSchool = async () => {
      if (!schoolId) {
        setError("Invalid school ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const schoolData = await getSchoolById(schoolId);
        if (!schoolData) {
          setError("School not found");
          setLoading(false);
          return;
        }
        setSchool(schoolData);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load school"
        );
      } finally {
        setLoading(false);
      }
    };

    loadSchool();
  }, [schoolId]);

  // Load programmes
  useEffect(() => {
    const loadProgrammes = async () => {
      if (!schoolId) return;

      setProgrammesLoading(true);
      try {
        const programmesData = await listSchoolProgrammes(schoolId);
        setProgrammes(programmesData);
      } catch (err) {
        console.error("Failed to load programmes:", err);
      } finally {
        setProgrammesLoading(false);
      }
    };

    loadProgrammes();
  }, [schoolId]);

  // Load all programmes for the form
  useEffect(() => {
    const loadAllProgrammes = async () => {
      try {
        const allProgrammesList: Programme[] = [];
        let programmePage = 1;
        let programmeHasMore = true;
        while (programmeHasMore) {
          const programmesData = await listProgrammes(programmePage, 100);
          allProgrammesList.push(...programmesData.items);
          programmeHasMore = programmePage < programmesData.total_pages;
          programmePage++;
        }
        setAllProgrammes(allProgrammesList);
      } catch (err) {
        console.error("Failed to load all programmes:", err);
      }
    };

    loadAllProgrammes();
  }, []);

  const handleRemoveProgramme = async (programmeId: number) => {
    if (!schoolId) return;

    try {
      await removeProgrammeFromSchool(schoolId, programmeId);
      toast.success("Programme removed successfully");
      // Reload programmes after removal
      const programmesData = await listSchoolProgrammes(schoolId);
      setProgrammes(programmesData);
    } catch (error) {
      throw error; // Let the component handle the error
    }
  };

  const handleAddProgramme = async (programmeId: number) => {
    if (!schoolId) return;

    setAddingProgramme(true);
    try {
      await associateProgrammeWithSchool(schoolId, programmeId);
      toast.success("Programme added to school successfully");
      // Reload programmes after addition
      const programmesData = await listSchoolProgrammes(schoolId);
      setProgrammes(programmesData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add programme");
      console.error("Error adding programme:", error);
    } finally {
      setAddingProgramme(false);
    }
  };

  // Filter available programmes (not already associated)
  const availableProgrammes = allProgrammes.filter(
    (p) => !programmes.some((sp) => sp.id === p.id)
  );

  if (loading) {
    return (
      <DashboardLayout title="School Programmes">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !school) {
    return (
      <DashboardLayout title="School Programmes">
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
            {error || "School not found"}
          </div>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/schools")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Schools
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="School Programmes">
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/schools/${schoolId}`)}
              className="mr-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">{school.name} - Programmes</h1>
              <p className="text-sm text-muted-foreground">Code: {school.code}</p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            {/* Add Programme Section */}
            {availableProgrammes.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-4">Add Programme</h3>
                <Select
                  onValueChange={(value) => {
                    const programmeId = parseInt(value);
                    handleAddProgramme(programmeId);
                  }}
                  disabled={addingProgramme}
                >
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Select a programme to add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProgrammes.map((programme) => (
                      <SelectItem key={programme.id} value={programme.id.toString()}>
                        {programme.name} ({programme.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Programmes DataTable */}
            <ProgrammeDataTable
              programmes={programmes}
              loading={programmesLoading}
              schoolId={schoolId!}
              onRemove={handleRemoveProgramme}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
