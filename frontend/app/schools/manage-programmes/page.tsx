"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listSchools,
  listProgrammes,
  listSchoolProgrammes,
  associateProgrammeWithSchool,
  removeProgrammeFromSchool,
} from "@/lib/api";
import type { School, Programme } from "@/types/document";
import { toast } from "sonner";
import { X, Plus } from "lucide-react";

export default function ManageSchoolProgrammesPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
  const [schoolProgrammes, setSchoolProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  // Load schools
  useEffect(() => {
    const loadSchools = async () => {
      try {
        const allSchools: School[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const schoolsData = await listSchools(page, 100);
          allSchools.push(...schoolsData);
          hasMore = schoolsData.length === 100;
          page++;
        }
        setSchools(allSchools);
      } catch (error) {
        console.error("Failed to load schools:", error);
        toast.error("Failed to load schools");
      }
    };
    loadSchools();
  }, []);

  // Load all programmes
  useEffect(() => {
    const loadProgrammes = async () => {
      try {
        const allProgrammes: Programme[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const programmesData = await listProgrammes(page, 100);
          allProgrammes.push(...programmesData.items);
          hasMore = page < programmesData.total_pages;
          page++;
        }
        setProgrammes(allProgrammes);
      } catch (error) {
        console.error("Failed to load programmes:", error);
        toast.error("Failed to load programmes");
      }
    };
    loadProgrammes();
  }, []);

  // Load programmes for selected school
  useEffect(() => {
    if (selectedSchoolId) {
      setLoadingProgrammes(true);
      listSchoolProgrammes(selectedSchoolId)
        .then((data) => {
          setSchoolProgrammes(data);
        })
        .catch((error) => {
          console.error("Failed to load school programmes:", error);
          toast.error("Failed to load school programmes");
        })
        .finally(() => {
          setLoadingProgrammes(false);
        });
    } else {
      setSchoolProgrammes([]);
    }
  }, [selectedSchoolId]);

  const handleAddProgramme = async (programmeId: number) => {
    if (!selectedSchoolId) return;

    setLoading(true);
    try {
      await associateProgrammeWithSchool(selectedSchoolId, programmeId);
      toast.success("Programme added to school successfully");
      // Reload school programmes
      const updated = await listSchoolProgrammes(selectedSchoolId);
      setSchoolProgrammes(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add programme");
      console.error("Error adding programme:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveProgramme = async (programmeId: number) => {
    if (!selectedSchoolId) return;

    setLoading(true);
    try {
      await removeProgrammeFromSchool(selectedSchoolId, programmeId);
      toast.success("Programme removed from school successfully");
      // Reload school programmes
      const updated = await listSchoolProgrammes(selectedSchoolId);
      setSchoolProgrammes(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove programme");
      console.error("Error removing programme:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);
  const availableProgrammes = programmes.filter(
    (p) => !schoolProgrammes.some((sp) => sp.id === p.id)
  );

  return (
    <DashboardLayout title="Manage School Programmes">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-6 py-4">
          <h1 className="text-lg font-semibold">Manage School Programmes</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="school-select" className="text-sm font-medium">
                Select School
              </label>
              <Select
                value={selectedSchoolId?.toString() || ""}
                onValueChange={(value) => setSelectedSchoolId(value ? parseInt(value) : null)}
              >
                <SelectTrigger id="school-select" className="w-full max-w-md">
                  <SelectValue placeholder="Choose a school..." />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id.toString()}>
                      {school.name} ({school.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedSchool && (
              <>
                <div className="rounded-lg border border-border bg-card p-4">
                  <h2 className="text-sm font-medium mb-4">
                    Programmes for {selectedSchool.name}
                  </h2>
                  {loadingProgrammes ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : schoolProgrammes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No programmes associated with this school</p>
                  ) : (
                    <div className="space-y-2">
                      {schoolProgrammes.map((programme) => (
                        <div
                          key={programme.id}
                          className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{programme.name}</p>
                            <p className="text-xs text-muted-foreground">Code: {programme.code}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveProgramme(programme.id)}
                            disabled={loading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {availableProgrammes.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-sm font-medium mb-4">Add Programme</h2>
                    <Select
                      onValueChange={(value) => {
                        const programmeId = parseInt(value);
                        handleAddProgramme(programmeId);
                      }}
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
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
