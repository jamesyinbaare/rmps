"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listSchools,
  listProgrammes,
  listProgrammeSchools,
  associateSchoolWithProgramme,
  removeSchoolFromProgramme,
} from "@/lib/api";
import type { School, Programme } from "@/types/document";
import { toast } from "sonner";
import { X } from "lucide-react";

export default function ManageProgrammeSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null);
  const [programmeSchools, setProgrammeSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Load programmes
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

  // Load all schools
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

  // Load schools for selected programme
  useEffect(() => {
    if (selectedProgrammeId) {
      setLoadingSchools(true);
      listProgrammeSchools(selectedProgrammeId)
        .then((data) => {
          setProgrammeSchools(data);
        })
        .catch((error) => {
          console.error("Failed to load programme schools:", error);
          toast.error("Failed to load programme schools");
        })
        .finally(() => {
          setLoadingSchools(false);
        });
    } else {
      setProgrammeSchools([]);
    }
  }, [selectedProgrammeId]);

  const handleAddSchool = async (schoolId: number) => {
    if (!selectedProgrammeId) return;

    setLoading(true);
    try {
      await associateSchoolWithProgramme(selectedProgrammeId, schoolId);
      toast.success("School added to programme successfully");
      // Reload programme schools
      const updated = await listProgrammeSchools(selectedProgrammeId);
      setProgrammeSchools(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add school");
      console.error("Error adding school:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSchool = async (schoolId: number) => {
    if (!selectedProgrammeId) return;

    setLoading(true);
    try {
      await removeSchoolFromProgramme(selectedProgrammeId, schoolId);
      toast.success("School removed from programme successfully");
      // Reload programme schools
      const updated = await listProgrammeSchools(selectedProgrammeId);
      setProgrammeSchools(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove school");
      console.error("Error removing school:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedProgramme = programmes.find((p) => p.id === selectedProgrammeId);
  const availableSchools = schools.filter(
    (s) => !programmeSchools.some((ps) => ps.id === s.id)
  );

  return (
    <DashboardLayout title="Manage Programme Schools">
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-background px-6 py-4">
          <h1 className="text-lg font-semibold">Manage Programme Schools</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl space-y-6">
            <div className="space-y-2">
              <label htmlFor="programme-select" className="text-sm font-medium">
                Select Programme
              </label>
              <Select
                value={selectedProgrammeId?.toString() || ""}
                onValueChange={(value) => setSelectedProgrammeId(value ? parseInt(value) : null)}
              >
                <SelectTrigger id="programme-select" className="w-full max-w-md">
                  <SelectValue placeholder="Choose a programme..." />
                </SelectTrigger>
                <SelectContent>
                  {programmes.map((programme) => (
                    <SelectItem key={programme.id} value={programme.id.toString()}>
                      {programme.name} ({programme.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProgramme && (
              <>
                <div className="rounded-lg border border-border bg-card p-4">
                  <h2 className="text-sm font-medium mb-4">
                    Schools offering {selectedProgramme.name}
                  </h2>
                  {loadingSchools ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : programmeSchools.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No schools associated with this programme</p>
                  ) : (
                    <div className="space-y-2">
                      {programmeSchools.map((school) => (
                        <div
                          key={school.id}
                          className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                        >
                          <div>
                            <p className="text-sm font-medium">{school.name}</p>
                            <p className="text-xs text-muted-foreground">Code: {school.code}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleRemoveSchool(school.id)}
                            disabled={loading}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {availableSchools.length > 0 && (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-sm font-medium mb-4">Add School</h2>
                    <Select
                      onValueChange={(value) => {
                        const schoolId = parseInt(value);
                        handleAddSchool(schoolId);
                      }}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue placeholder="Select a school to add..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSchools.map((school) => (
                          <SelectItem key={school.id} value={school.id.toString()}>
                            {school.name} ({school.code})
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
