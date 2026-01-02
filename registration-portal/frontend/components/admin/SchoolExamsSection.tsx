"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getSchoolExams } from "@/lib/api";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";
import type { SchoolExam } from "@/types";

export function SchoolExamsSection({ schoolId }: { schoolId: number }) {
  const [exams, setExams] = useState<SchoolExam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExams = async () => {
      setLoading(true);
      try {
        const data = await getSchoolExams(schoolId);
        setExams(data);
      } catch (error) {
        toast.error("Failed to load exams");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadExams();
  }, [schoolId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Exam Registrations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : exams.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No exam registrations found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exam Type</TableHead>
                <TableHead>Series</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exams.map((exam) => (
                <TableRow key={exam.exam_id}>
                  <TableCell className="font-medium">{exam.exam_type}</TableCell>
                  <TableCell>{exam.exam_series}</TableCell>
                  <TableCell>{exam.year}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {exam.candidate_count}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
