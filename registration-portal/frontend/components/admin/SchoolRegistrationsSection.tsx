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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSchoolCandidates, listExams } from "@/lib/api";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RegistrationCandidate, RegistrationExam } from "@/types";

export function SchoolRegistrationsSection({ schoolId }: { schoolId: number }) {
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState<number | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const result = await getSchoolCandidates(
        schoolId,
        selectedExam,
        selectedStatus,
        page,
        50
      );
      setCandidates(result.items);
      setTotal(result.total);
      setTotalPages(result.total_pages);
    } catch (error) {
      toast.error("Failed to load candidates");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, selectedExam, selectedStatus, page]);

  useEffect(() => {
    listExams()
      .then(setExams)
      .catch((error) => {
        console.error("Failed to load exams", error);
      });
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate Registrations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <Select
            value={selectedExam?.toString() || "all"}
            onValueChange={(value) => {
              setSelectedExam(value === "all" ? undefined : parseInt(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by exam" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exams</SelectItem>
              {exams.map((exam) => (
                <SelectItem key={exam.id} value={exam.id.toString()}>
                  {exam.exam_type} {exam.exam_series} {exam.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedStatus || "all"}
            onValueChange={(value) => {
              setSelectedStatus(value === "all" ? undefined : value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="REJECTED">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No candidates found</div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Registration Number</TableHead>
                    <TableHead>Exam</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((candidate) => (
                    <TableRow key={candidate.id}>
                      <TableCell className="font-medium">{candidate.name}</TableCell>
                      <TableCell>{candidate.registration_number}</TableCell>
                      <TableCell>
                        {candidate.exam
                          ? `${candidate.exam.exam_type} ${candidate.exam.exam_series} ${candidate.exam.year}`
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            candidate.registration_status === "APPROVED"
                              ? "bg-[var(--success)]/10 text-[var(--success)]"
                              : candidate.registration_status === "REJECTED"
                              ? "bg-[var(--destructive)]/10 text-[var(--destructive)]"
                              : "bg-[var(--warning)]/10 text-[var(--warning)]"
                          }`}
                        >
                          {candidate.registration_status}
                        </span>
                      </TableCell>
                      <TableCell>
                        {new Date(candidate.registration_date).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * 50 + 1} to {Math.min(page * 50, total)} of {total} candidates
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1 || loading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <div className="text-sm">Page {page} of {totalPages}</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPages || loading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
