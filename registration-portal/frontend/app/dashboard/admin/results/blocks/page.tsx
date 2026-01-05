"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listExams,
  listResultBlocks,
  createResultBlock,
  deleteResultBlock,
  listSchools,
} from "@/lib/api";
import type {
  RegistrationExam,
  ResultBlock,
  ResultBlockCreate,
  ResultBlockType,
  School,
} from "@/types";
import { toast } from "sonner";
import { Plus, Trash2, Shield } from "lucide-react";

export default function AdminResultBlocksPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [blocks, setBlocks] = useState<ResultBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  // Form state
  const [blockType, setBlockType] = useState<ResultBlockType>("CANDIDATE_ALL");
  const [formExamId, setFormExamId] = useState<number | null>(null);
  const [candidateId, setCandidateId] = useState<string>("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    loadExams();
    loadSchools();
    loadBlocks();
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [selectedExamId]);

  const loadExams = async () => {
    try {
      const examList = await listExams();
      setExams(examList);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    }
  };

  const loadSchools = async () => {
    try {
      const schoolList = await listSchools();
      setSchools(schoolList);
    } catch (error) {
      toast.error("Failed to load schools");
      console.error(error);
    }
  };

  const loadBlocks = async () => {
    setLoading(true);
    try {
      const blockList = await listResultBlocks(selectedExamId || undefined, true);
      setBlocks(blockList);
    } catch (error) {
      toast.error("Failed to load blocks");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBlock = async () => {
    if (!formExamId) {
      toast.error("Please select an exam");
      return;
    }

    if (
      (blockType === "CANDIDATE_ALL" || blockType === "CANDIDATE_SUBJECT") &&
      !candidateId
    ) {
      toast.error("Please enter candidate ID");
      return;
    }

    if (
      (blockType === "SCHOOL_ALL" || blockType === "SCHOOL_SUBJECT") &&
      !schoolId
    ) {
      toast.error("Please select a school");
      return;
    }

    if (
      (blockType === "CANDIDATE_SUBJECT" || blockType === "SCHOOL_SUBJECT") &&
      !subjectId
    ) {
      toast.error("Please enter subject ID");
      return;
    }

    try {
      const blockData: ResultBlockCreate = {
        block_type: blockType,
        registration_exam_id: formExamId,
        registration_candidate_id:
          candidateId && (blockType === "CANDIDATE_ALL" || blockType === "CANDIDATE_SUBJECT")
            ? parseInt(candidateId)
            : null,
        school_id:
          schoolId && (blockType === "SCHOOL_ALL" || blockType === "SCHOOL_SUBJECT")
            ? parseInt(schoolId)
            : null,
        subject_id:
          subjectId &&
          (blockType === "CANDIDATE_SUBJECT" || blockType === "SCHOOL_SUBJECT")
            ? parseInt(subjectId)
            : null,
        reason: reason || null,
      };

      await createResultBlock(blockData);
      toast.success("Block created successfully");
      setCreateDialogOpen(false);
      resetForm();
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create block");
    }
  };

  const handleDeleteBlock = async (blockId: number) => {
    if (!confirm("Are you sure you want to remove this block?")) {
      return;
    }

    try {
      await deleteResultBlock(blockId);
      toast.success("Block removed successfully");
      await loadBlocks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove block");
    }
  };

  const resetForm = () => {
    setBlockType("CANDIDATE_ALL");
    setFormExamId(null);
    setCandidateId("");
    setSchoolId("");
    setSubjectId("");
    setReason("");
  };

  const getBlockTypeLabel = (type: ResultBlockType) => {
    const labels: Record<ResultBlockType, string> = {
      CANDIDATE_ALL: "Candidate - All Results",
      CANDIDATE_SUBJECT: "Candidate - Specific Subject",
      SCHOOL_ALL: "School - All Results",
      SCHOOL_SUBJECT: "School - Specific Subject",
    };
    return labels[type];
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Result Blocks</h1>
          <p className="text-muted-foreground">
            Manage administrative blocks for results
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Block
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Result Block</DialogTitle>
              <DialogDescription>
                Block results from being viewed by candidates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Block Type</Label>
                <Select value={blockType} onValueChange={(v) => setBlockType(v as ResultBlockType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CANDIDATE_ALL">Candidate - All Results</SelectItem>
                    <SelectItem value="CANDIDATE_SUBJECT">Candidate - Specific Subject</SelectItem>
                    <SelectItem value="SCHOOL_ALL">School - All Results</SelectItem>
                    <SelectItem value="SCHOOL_SUBJECT">School - Specific Subject</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Examination</Label>
                <Select
                  value={formExamId?.toString() || ""}
                  onValueChange={(v) => setFormExamId(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select examination" />
                  </SelectTrigger>
                  <SelectContent>
                    {exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.exam_type} ({exam.exam_series} {exam.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(blockType === "CANDIDATE_ALL" || blockType === "CANDIDATE_SUBJECT") && (
                <div>
                  <Label>Candidate ID</Label>
                  <Input
                    value={candidateId}
                    onChange={(e) => setCandidateId(e.target.value)}
                    placeholder="Enter candidate ID"
                  />
                </div>
              )}

              {(blockType === "SCHOOL_ALL" || blockType === "SCHOOL_SUBJECT") && (
                <div>
                  <Label>School</Label>
                  <Select value={schoolId} onValueChange={setSchoolId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select school" />
                    </SelectTrigger>
                    <SelectContent>
                      {schools.map((school) => (
                        <SelectItem key={school.id} value={school.id.toString()}>
                          {school.code} - {school.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(blockType === "CANDIDATE_SUBJECT" || blockType === "SCHOOL_SUBJECT") && (
                <div>
                  <Label>Subject ID</Label>
                  <Input
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    placeholder="Enter subject ID"
                  />
                </div>
              )}

              <div>
                <Label>Reason (Optional)</Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for blocking"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateBlock}>Create Block</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Blocks</CardTitle>
          <CardDescription>List of active result blocks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label>Filter by Examination</Label>
            <Select
              value={selectedExamId?.toString() || ""}
              onValueChange={(v) => setSelectedExamId(v ? parseInt(v) : null)}
            >
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="All examinations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All examinations</SelectItem>
                {exams.map((exam) => (
                  <SelectItem key={exam.id} value={exam.id.toString()}>
                    {exam.exam_type} ({exam.exam_series} {exam.year})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading blocks...</div>
          ) : blocks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No active blocks found
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Examination</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell>
                        <Badge variant="destructive">
                          <Shield className="mr-1 h-3 w-3" />
                          {getBlockTypeLabel(block.block_type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {block.exam_type} ({block.exam_series} {block.exam_year})
                      </TableCell>
                      <TableCell>
                        {block.candidate_name
                          ? `${block.candidate_name} (${block.candidate_registration_number})`
                          : block.school_name
                          ? `${block.school_code} - ${block.school_name}`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {block.subject_name ? `${block.subject_code} - ${block.subject_name}` : "All"}
                      </TableCell>
                      <TableCell>{block.reason || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBlock(block.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
