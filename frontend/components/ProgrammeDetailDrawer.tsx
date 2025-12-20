"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Programme } from "@/types/document";
import {
  listProgrammeSubjects,
  getProgrammeSubjectRequirements,
  type ProgrammeSubject,
  type ProgrammeSubjectRequirements,
} from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, Calendar, Info, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProgrammeDetailDrawerProps {
  programme: Programme | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProgrammeDetailDrawer({
  programme,
  open,
  onOpenChange,
}: ProgrammeDetailDrawerProps) {
  const [subjects, setSubjects] = useState<ProgrammeSubject[]>([]);
  const [requirements, setRequirements] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loading, setLoading] = useState(false);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSubjects = async () => {
      if (!programme || !open) {
        setSubjects([]);
        setRequirements(null);
        setShowRequirements(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const subjectsData = await listProgrammeSubjects(programme.id);
        setSubjects(subjectsData);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load programme subjects"
        );
        console.error("Failed to load subjects:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSubjects();
  }, [programme, open]);

  const loadRequirements = async () => {
    if (!programme) return;

    if (requirements !== null) {
      // Toggle visibility if already loaded
      setShowRequirements(!showRequirements);
      return;
    }

    setRequirementsLoading(true);
    setError(null);
    try {
      const reqs = await getProgrammeSubjectRequirements(programme.id);
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

  if (!programme) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            {programme.name}
          </SheetTitle>
          <SheetDescription>Code: {programme.code}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Programme Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Programme Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Code:</span>
                <span className="text-sm font-medium font-mono">
                  {programme.code}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Name:</span>
                <span className="text-sm font-medium">{programme.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Category:</span>
                {programme.exam_type ? (
                  <Badge variant="outline">{programme.exam_type}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Not set</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Created:</span>
                <span className="text-sm font-medium">
                  {new Date(programme.created_at).toLocaleDateString()}
                </span>
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
                  disabled={requirementsLoading || loading}
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
              {loading ? (
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
      </SheetContent>
    </Sheet>
  );
}
