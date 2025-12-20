"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { EditProgrammeModal } from "@/components/EditProgrammeModal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  listProgrammeSubjects,
  getProgrammeSubjectRequirements,
  getProgramme,
  type ProgrammeSubject,
  type ProgrammeSubjectRequirements,
} from "@/lib/api";
import type { Programme } from "@/types/document";
import { ArrowLeft, GraduationCap, Edit, Calendar, BookOpen, Info, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ProgrammeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const programmeId = params.id ? parseInt(params.id as string) : null;

  const [programme, setProgramme] = useState<Programme | null>(null);
  const [subjects, setSubjects] = useState<ProgrammeSubject[]>([]);
  const [requirements, setRequirements] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Load programme data
  useEffect(() => {
    const loadProgramme = async () => {
      if (!programmeId) {
        setError("Invalid programme ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const programmeData = await getProgramme(programmeId);
        setProgramme(programmeData);

        // Load subjects
        setSubjectsLoading(true);
        try {
          const subjectsData = await listProgrammeSubjects(programmeId);
          setSubjects(subjectsData);
        } catch (err) {
          console.error("Failed to load programme subjects:", err);
        } finally {
          setSubjectsLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load programme");
        console.error("Error loading programme:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProgramme();
  }, [programmeId]);

  const loadRequirements = async () => {
    if (!programmeId) return;

    if (requirements !== null) {
      // Toggle visibility if already loaded
      setShowRequirements(!showRequirements);
      return;
    }

    setRequirementsLoading(true);
    setError(null);
    try {
      const reqs = await getProgrammeSubjectRequirements(programmeId);
      setRequirements(reqs);
      setShowRequirements(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load programme requirements"
      );
      console.error("Failed to load requirements:", err);
      setShowRequirements(false);
    } finally {
      setRequirementsLoading(false);
    }
  };

  const handleEditSuccess = async () => {
    if (!programmeId) return;
    try {
      const updatedProgramme = await getProgramme(programmeId);
      setProgramme(updatedProgramme);
    } catch (error) {
      console.error("Error refreshing programme:", error);
    }
    setEditModalOpen(false);
  };

  if (loading) {
    return (
      <DashboardLayout title="Programme Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Loading..." />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !programme) {
    return (
      <DashboardLayout title="Programme Details">
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar title="Error" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
              {error || "Programme not found"}
            </div>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => router.push("/programmes")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Programmes
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Programme Details">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title={`${programme.code} - ${programme.name}`} />
        <div className="flex-1 overflow-y-auto p-6">
          {/* Header with back button */}
          <div className="mb-6">
            <Button
              variant="ghost"
              onClick={() => router.push("/programmes")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Programmes
            </Button>
          </div>

          {/* Programme Information Card */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Programme Information
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditModalOpen(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Code:</span>
                  <span className="text-sm font-medium font-mono">{programme.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Name:</span>
                  <span className="text-sm font-medium">{programme.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Created:</span>
                  <span className="text-sm font-medium">
                    {new Date(programme.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Subjects */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Subjects ({subjects.length})
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadRequirements}
                  disabled={requirementsLoading || subjectsLoading}
                >
                  {requirementsLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Info className="h-4 w-4 mr-2" />
                      {showRequirements ? "Hide" : "View"} Requirements
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {subjectsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : error ? (
                <div className="text-sm text-destructive">{error}</div>
              ) : subjects.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No subjects associated with this programme.
                </div>
              ) : (
                <>
                  {showRequirements && (
                    <div className="mb-4 space-y-3 p-3 bg-muted/50 rounded-md">
                      {requirementsLoading ? (
                        <div className="text-sm text-muted-foreground py-2">
                          Loading requirements...
                        </div>
                      ) : requirements ? (
                        <>
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Compulsory Core Subjects</h4>
                            {requirements.compulsory_core.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {requirements.compulsory_core.map((s) => (
                                  <Badge key={s.subject_id} variant="default">
                                    {s.subject_code} - {s.subject_name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">None</p>
                            )}
                          </div>
                          {requirements.optional_core_groups.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Optional Core Choice Groups</h4>
                              {requirements.optional_core_groups.map((group) => (
                                <div key={group.choice_group_id} className="mb-2">
                                  <span className="text-xs font-medium">Group {group.choice_group_id} (choose one):</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {group.subjects.map((s) => (
                                      <Badge key={s.subject_id} variant="outline">
                                        {s.subject_code} - {s.subject_name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {requirements.optional_core_groups.length === 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-2">Optional Core Choice Groups</h4>
                              <p className="text-xs text-muted-foreground">None</p>
                            </div>
                          )}
                          <div>
                            <h4 className="text-sm font-semibold mb-2">Elective Subjects (Required for MAY/JUNE)</h4>
                            {requirements.electives.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {requirements.electives.map((s) => (
                                  <Badge key={s.subject_id} variant="secondary">
                                    {s.subject_code} - {s.subject_name}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">None</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground py-2">
                          No requirements data available
                        </div>
                      )}
                    </div>
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Requirements</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subjects.map((subject) => (
                        <TableRow key={subject.subject_id}>
                          <TableCell className="font-mono">
                            {subject.subject_code}
                          </TableCell>
                          <TableCell>{subject.subject_name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={subject.subject_type === "CORE" ? "default" : "secondary"}
                            >
                              {subject.subject_type === "CORE" ? "Core" : "Elective"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {subject.subject_type === "CORE" ? (
                              <>
                                {subject.is_compulsory === true && (
                                  <Badge variant="outline" className="text-xs">Compulsory</Badge>
                                )}
                                {subject.is_compulsory === false && (
                                  <div className="flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs">Optional</Badge>
                                    {subject.choice_group_id && (
                                      <span className="text-xs text-muted-foreground">
                                        Group {subject.choice_group_id}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              <Badge variant="outline" className="text-xs">Required (MAY/JUNE)</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EditProgrammeModal
        programme={programme}
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        onSuccess={handleEditSuccess}
      />
    </DashboardLayout>
  );
}
