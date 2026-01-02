"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RegistrationExam } from "@/types";

interface ExamTableProps {
  exams: RegistrationExam[];
}

export function ExamTable({ exams }: ExamTableProps) {
  const getRegistrationStatus = (exam: RegistrationExam) => {
    const now = new Date();
    const startDate = new Date(exam.registration_period.registration_start_date);
    const endDate = new Date(exam.registration_period.registration_end_date);

    if (!exam.registration_period.is_active) {
      return { label: "Inactive", color: "bg-gray-100 text-gray-800" };
    }

    if (now < startDate) {
      return { label: "Upcoming", color: "bg-blue-100 text-blue-800" };
    }

    if (now >= startDate && now <= endDate) {
      return { label: "Open", color: "bg-green-100 text-green-800" };
    }

    return { label: "Closed", color: "bg-red-100 text-red-800" };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Exam Type</TableHead>
          <TableHead>Series</TableHead>
          <TableHead>Year</TableHead>
          <TableHead>Registration Period</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {exams.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-gray-500">
              No exams found
            </TableCell>
          </TableRow>
        ) : (
          exams.map((exam) => {
            const status = getRegistrationStatus(exam);
            return (
              <TableRow key={exam.id}>
                <TableCell className="font-medium">{exam.exam_type}</TableCell>
                <TableCell>{exam.exam_series}</TableCell>
                <TableCell>{exam.year}</TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>Start: {formatDate(exam.registration_period.registration_start_date)}</div>
                    <div>End: {formatDate(exam.registration_period.registration_end_date)}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`rounded-full px-2 py-1 text-xs ${status.color}`}>
                    {status.label}
                  </span>
                </TableCell>
                <TableCell>{new Date(exam.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
