"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Subject } from "@/types/document";
import { getSubject } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Calendar } from "lucide-react";

interface SubjectDetailDrawerProps {
  subject: Subject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubjectDetailDrawer({
  subject,
  open,
  onOpenChange,
}: SubjectDetailDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [subjectData, setSubjectData] = useState<Subject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSubject = async () => {
      if (!subject || !open) {
        setSubjectData(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const data = await getSubject(subject.id);
        setSubjectData(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load subject details"
        );
        console.error("Failed to load subject:", err);
      } finally {
        setLoading(false);
      }
    };

    loadSubject();
  }, [subject, open]);

  if (!subject) return null;

  const displaySubject = subjectData || subject;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {displaySubject.name}
          </SheetTitle>
          <SheetDescription>
            Code: <span className="font-mono">{displaySubject.code}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <>
              {/* Subject Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Subject Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Code:</span>
                    <span className="text-sm font-medium font-mono">
                      {displaySubject.code}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Name:</span>
                    <span className="text-sm font-medium">{displaySubject.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Type:</span>
                    <Badge
                      variant={displaySubject.subject_type === "CORE" ? "default" : "secondary"}
                    >
                      {displaySubject.subject_type === "CORE" ? "Core" : "Elective"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Created:</span>
                    <span className="text-sm font-medium">
                      {new Date(displaySubject.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
