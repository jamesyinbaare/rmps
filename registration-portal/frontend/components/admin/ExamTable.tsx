"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { XCircle, Calendar, Trash2 } from "lucide-react";
import { closeRegistrationPeriod, deleteExam } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationExam } from "@/types";
import { CloseRegistrationDialog } from "@/components/admin/CloseRegistrationDialog";
import { OpenRegistrationDialog } from "@/components/admin/OpenRegistrationDialog";
import { DeleteExamDialog } from "@/components/admin/DeleteExamDialog";

interface ExamTableProps {
  exams: RegistrationExam[];
  onRefresh?: () => void;
}

export function ExamTable({ exams, onRefresh }: ExamTableProps) {
  const router = useRouter();
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<RegistrationExam | null>(null);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleRowClick = (exam: RegistrationExam, e: React.MouseEvent) => {
    // Don't navigate if clicking on action buttons
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("[role='button']")) {
      return;
    }
    router.push(`/dashboard/exams/${exam.id}`);
  };

  const handleCloseClick = (exam: RegistrationExam, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedExam(exam);
    setCloseDialogOpen(true);
  };

  const handleOpenClick = (exam: RegistrationExam, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedExam(exam);
    setOpenDialogOpen(true);
  };

  const handleCloseRegistration = async () => {
    if (!selectedExam) return;

    setClosing(true);
    try {
      await closeRegistrationPeriod(selectedExam.id);
      toast.success("Registration period closed successfully");
      setCloseDialogOpen(false);
      setSelectedExam(null);
      onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to close registration");
    } finally {
      setClosing(false);
    }
  };

  const handleOpenSuccess = () => {
    setOpenDialogOpen(false);
    setSelectedExam(null);
    onRefresh?.();
  };

  const isRegistrationOpen = (exam: RegistrationExam) => {
    const now = new Date();
    const startDate = new Date(exam.registration_period.registration_start_date);
    const endDate = new Date(exam.registration_period.registration_end_date);
    return exam.registration_period.is_active && now >= startDate && now <= endDate;
  };

  const canDeleteExam = (exam: RegistrationExam) => {
    const now = new Date();
    const startDate = new Date(exam.registration_period.registration_start_date);
    // Show delete button if registration has not started yet
    // Backend will validate: deletion allowed if registration hasn't started OR no candidates registered
    return now < startDate;
  };

  const handleDeleteClick = (exam: RegistrationExam, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedExam(exam);
    setDeleteDialogOpen(true);
  };

  const handleDeleteExam = async () => {
    if (!selectedExam) return;

    setDeleting(true);
    try {
      await deleteExam(selectedExam.id);
      toast.success("Examination deleted successfully");
      setDeleteDialogOpen(false);
      setSelectedExam(null);
      onRefresh?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete examination");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Exam Type</TableHead>
            <TableHead>Series</TableHead>
            <TableHead>Year</TableHead>
            <TableHead>Registration Start</TableHead>
            <TableHead>Registration End</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[240px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exams.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-gray-500">
                No exams found
              </TableCell>
            </TableRow>
          ) : (
            exams.map((exam) => {
              const status = getRegistrationStatus(exam);
              const isOpen = isRegistrationOpen(exam);
              return (
                <TableRow
                  key={exam.id}
                  onClick={(e) => handleRowClick(exam, e)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell className="font-medium">{exam.exam_type}</TableCell>
                  <TableCell>{exam.exam_series || "N/A"}</TableCell>
                  <TableCell>{exam.year}</TableCell>
                  <TableCell className="text-sm">
                    {formatDate(exam.registration_period.registration_start_date)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(exam.registration_period.registration_end_date)}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-1 text-xs ${status.color}`}>
                      {status.label}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(exam.created_at).toLocaleDateString()}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => handleCloseClick(exam, e)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Close
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={(e) => handleOpenClick(exam, e)}
                        >
                          <Calendar className="h-4 w-4 mr-1" />
                          Open
                        </Button>
                      )}
                      {canDeleteExam(exam) && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleDeleteClick(exam, e)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {selectedExam && (
        <>
          <CloseRegistrationDialog
            open={closeDialogOpen}
            onOpenChange={setCloseDialogOpen}
            exam={selectedExam}
            onConfirm={handleCloseRegistration}
            loading={closing}
          />
          <OpenRegistrationDialog
            open={openDialogOpen}
            onOpenChange={setOpenDialogOpen}
            exam={selectedExam}
            onSuccess={handleOpenSuccess}
          />
          <DeleteExamDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            exam={selectedExam}
            onConfirm={handleDeleteExam}
            loading={deleting}
          />
        </>
      )}
    </>
  );
}
