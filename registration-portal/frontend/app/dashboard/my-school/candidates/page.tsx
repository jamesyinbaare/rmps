"use client";

import { useEffect, useState } from "react";
import { listSchoolCandidates, listAvailableExams, registerCandidate } from "@/lib/api";
import type { RegistrationCandidate, RegistrationExam, RegistrationCandidateCreate } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";
import { Plus, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<RegistrationCandidate | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [formData, setFormData] = useState<RegistrationCandidateCreate>({
    name: "",
    date_of_birth: null,
    gender: null,
    programme_code: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    national_id: null,
    subject_codes: [],
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();

    // Update page title
    const updateTitle = async () => {
      try {
        const { getSchoolDashboard } = await import("@/lib/api");
        const dashboard = await getSchoolDashboard();
        if (dashboard?.school) {
          document.title = `${dashboard.school.name} - Candidate Registration`;
        }
      } catch (error) {
        console.error("Failed to load school data for title:", error);
      }
    };
    updateTitle();
  }, []);

  const loadData = async () => {
    try {
      const [candidatesData, examsData] = await Promise.all([
        listSchoolCandidates(),
        listAvailableExams(),
      ]);
      setCandidates(candidatesData);
      setExams(examsData);
    } catch (error) {
      toast.error("Failed to load candidates");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedExamId) {
      toast.error("Please select an exam");
      return;
    }

    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    setSubmitting(true);

    try {
      await registerCandidate(parseInt(selectedExamId), formData);
      toast.success("Candidate registered successfully");
      setCreateDialogOpen(false);
      setFormData({
        name: "",
        date_of_birth: null,
        gender: null,
        programme_code: null,
        contact_email: null,
        contact_phone: null,
        address: null,
        national_id: null,
        subject_codes: [],
      });
      setSelectedExamId("");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to register candidate");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading candidates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">Candidate Registration</h2>
            <p className="text-muted-foreground mt-1">Register and manage candidates for your school</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Register Candidate
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Registration Number</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registration Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No candidates registered yet
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map((candidate) => (
                  <TableRow
                    key={candidate.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <TableCell className="font-medium">{candidate.name}</TableCell>
                    <TableCell>{candidate.registration_number}</TableCell>
                    <TableCell>
                      {candidate.exam
                        ? `${candidate.exam.exam_type} ${candidate.exam.year}`
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          candidate.registration_status === "APPROVED"
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                            : candidate.registration_status === "REJECTED"
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                            : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                        }`}
                      >
                        {candidate.registration_status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {new Date(candidate.registration_date).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register Candidate</DialogTitle>
            <DialogDescription>Register a new candidate for an exam</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="exam">Exam *</Label>
                <Select value={selectedExamId} onValueChange={setSelectedExamId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an exam" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.exam_type} {exam.exam_series} {exam.year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_of_birth">Date of Birth</Label>
                  <Input
                    id="date_of_birth"
                    type="date"
                    value={formData.date_of_birth || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        date_of_birth: e.target.value || null,
                      })
                    }
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Gender</Label>
                  <Select
                    value={formData.gender || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, gender: value || null })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="programme_code">Programme Code</Label>
                <Input
                  id="programme_code"
                  placeholder="PROG001"
                  value={formData.programme_code || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, programme_code: e.target.value || null })
                  }
                  disabled={submitting}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Contact Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    placeholder="candidate@example.com"
                    value={formData.contact_email || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_email: e.target.value || null })
                    }
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Contact Phone</Label>
                  <Input
                    id="contact_phone"
                    placeholder="+1234567890"
                    value={formData.contact_phone || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, contact_phone: e.target.value || null })
                    }
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Street address"
                  value={formData.address || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, address: e.target.value || null })
                  }
                  disabled={submitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="national_id">National ID</Label>
                <Input
                  id="national_id"
                  placeholder="National ID number"
                  value={formData.national_id || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, national_id: e.target.value || null })
                  }
                  disabled={submitting}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Registering..." : "Register Candidate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={candidates}
        open={detailDialogOpen}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          // Refresh candidates list when modal opens to get latest data (e.g., index numbers)
          if (open) {
            loadData();
          }
        }}
        onCandidateChange={(candidate) => {
          setSelectedCandidate(candidate);
          // Update candidate in the list
          setCandidates((prev) =>
            prev.map((c) => (c.id === candidate.id ? candidate : c))
          );
        }}
      />
    </div>
  );
}
