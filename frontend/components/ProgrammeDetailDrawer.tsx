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
import { listProgrammeSubjects, type ProgrammeSubject } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, BookOpen, Calendar } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSubjects = async () => {
      if (!programme || !open) {
        setSubjects([]);
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
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Subjects ({subjects.length})
              </CardTitle>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  );
}
