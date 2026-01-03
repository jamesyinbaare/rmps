"use client";

import { useEffect, useState } from "react";
import {
  listAvailableExams,
  registerCandidate,
  listSchoolCandidates,
  getSchoolDashboard,
  listSchoolProgrammes,
  getProgrammeSubjects,
  bulkUploadCandidates,
  downloadCandidateTemplate,
} from "@/lib/api";
import type {
  RegistrationCandidate,
  RegistrationExam,
  RegistrationCandidateCreate,
  SchoolDashboardData,
  Programme,
  ProgrammeSubjectRequirements,
  BulkUploadResponse,
} from "@/types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Plus, GraduationCap, AlertCircle, Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CandidateDetailModal } from "@/components/CandidateDetailModal";

export default function RegistrationPage() {
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [selectedExam, setSelectedExam] = useState<RegistrationExam | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [candidates, setCandidates] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolData, setSchoolData] = useState<SchoolDashboardData | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState<number | null>(null);
  const [programmeSubjects, setProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [formData, setFormData] = useState<RegistrationCandidateCreate>({
    name: "",
    date_of_birth: null,
    gender: null,
    programme_code: null,
    programme_id: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    national_id: null,
    subject_codes: [],
    subject_ids: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<RegistrationCandidate | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  // Bulk upload state
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadResult, setBulkUploadResult] = useState<BulkUploadResponse | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [defaultChoiceGroups, setDefaultChoiceGroups] = useState<Record<number, string>>({});
  const [bulkProgrammeSubjects, setBulkProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingBulkSubjects, setLoadingBulkSubjects] = useState(false);

  useEffect(() => {
    loadExams();
    loadSchoolData();
    loadProgrammes();
  }, []);

  useEffect(() => {
    if (selectedExamId) {
      const exam = exams.find((e) => e.id.toString() === selectedExamId);
      setSelectedExam(exam || null);
      loadCandidatesForExam(parseInt(selectedExamId));
    } else {
      setSelectedExam(null);
      setCandidates([]);
      setBulkProgrammeSubjects(null);
      setDefaultChoiceGroups({});
    }
  }, [selectedExamId, exams]);

  // Automatically load optional core groups when exam and programmes are available
  useEffect(() => {
    if (selectedExam && programmes.length > 0) {
      loadBulkOptionalCoreGroups();
    } else {
      setBulkProgrammeSubjects(null);
      setDefaultChoiceGroups({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExam?.id, programmes.length]);

  useEffect(() => {
    if (selectedProgrammeId && selectedExam) {
      loadProgrammeSubjects(selectedProgrammeId);
    } else {
      setProgrammeSubjects(null);
      setSelectedSubjectIds([]);
    }
  }, [selectedProgrammeId, selectedExam]);

  const loadExams = async () => {
    try {
      const examsData = await listAvailableExams();
      setExams(examsData);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadSchoolData = async () => {
    try {
      const dashboard = await getSchoolDashboard();
      setSchoolData(dashboard);
      if (dashboard?.school) {
        document.title = `${dashboard.school.name} - Registration`;
      }
    } catch (error) {
      console.error("Failed to load school data:", error);
    }
  };

  const loadProgrammes = async () => {
    setLoadingProgrammes(true);
    try {
      const programmesData = await listSchoolProgrammes();
      setProgrammes(programmesData);
    } catch (error) {
      console.error("Failed to load programmes:", error);
      toast.error("Failed to load programmes");
    } finally {
      setLoadingProgrammes(false);
    }
  };

  const loadProgrammeSubjects = async (programmeId: number) => {
    if (!selectedExam) {
      // Don't load subjects if no exam is selected
      setProgrammeSubjects(null);
      setSelectedSubjectIds([]);
      return;
    }

    setLoadingSubjects(true);
    try {
      const subjects = await getProgrammeSubjects(programmeId);
      setProgrammeSubjects(subjects);

      // Check if exam is MAY/JUNE (case-insensitive)
      const isMayJune = selectedExam?.exam_series?.toUpperCase().replace(/[-\s]/g, "/") === "MAY/JUNE";

      // Auto-select compulsory core subjects only (not optional core subjects)
      const autoSelectedIds: number[] = [];
      autoSelectedIds.push(...subjects.compulsory_core.map((s) => s.subject_id));

      // For MAY/JUNE: Auto-select ALL elective subjects (they are compulsory)
      if (isMayJune) {
        autoSelectedIds.push(...subjects.electives.map((s) => s.subject_id));
      }

      // Do NOT auto-select optional core subjects - they must be explicitly chosen by the user
      setSelectedSubjectIds(autoSelectedIds);
    } catch (error) {
      toast.error("Failed to load programme subjects");
      console.error(error);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const loadCandidatesForExam = async (examId: number) => {
    try {
      const candidatesData = await listSchoolCandidates(examId);
      setCandidates(candidatesData);
    } catch (error) {
      toast.error("Failed to load candidates");
      console.error(error);
    }
  };

  const handleProgrammeChange = (value: string | undefined) => {
    if (value) {
      const programmeId = parseInt(value);
      setSelectedProgrammeId(programmeId);
      const programme = programmes.find((p) => p.id === programmeId);
      setFormData({
        ...formData,
        programme_id: programmeId,
        programme_code: programme?.code || null,
      });
    } else {
      setSelectedProgrammeId(null);
      setFormData({
        ...formData,
        programme_id: null,
        programme_code: null,
      });
    }
  };

  const handleSubjectToggle = (subjectId: number, isChecked: boolean) => {
    if (isChecked) {
      setSelectedSubjectIds([...selectedSubjectIds, subjectId]);
    } else {
      setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== subjectId));
    }
  };

  const handleOptionalGroupChange = (groupSubjects: { subject_id: number }[], selectedId: number) => {
    // Remove all subjects from this group, then add the selected one
    const groupIds = groupSubjects.map((s) => s.subject_id);
    const filtered = selectedSubjectIds.filter((id) => !groupIds.includes(id));
    setSelectedSubjectIds([...filtered, selectedId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedExamId) {
      toast.error("Please select an exam first");
      return;
    }

    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    setSubmitting(true);

    try {
      const submitData: RegistrationCandidateCreate = {
        ...formData,
        subject_ids: selectedSubjectIds,
      };
      await registerCandidate(parseInt(selectedExamId), submitData);
      toast.success("Candidate registered successfully");
      // Reset form
      setFormData({
        name: "",
        date_of_birth: null,
        gender: null,
        programme_code: null,
        programme_id: null,
        contact_email: null,
        contact_phone: null,
        address: null,
        national_id: null,
        subject_codes: [],
        subject_ids: [],
      });
      setSelectedProgrammeId(null);
      setProgrammeSubjects(null);
      setSelectedSubjectIds([]);
      // Reload candidates for the selected exam
      loadCandidatesForExam(parseInt(selectedExamId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to register candidate");
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!selectedExamId) {
      toast.error("Please select an exam first");
      return;
    }

    if (!bulkUploadFile) {
      toast.error("Please select a file to upload");
      return;
    }

    setBulkUploading(true);
    setBulkUploadResult(null);

    try {
      // Use default choice groups if any are selected
      const defaultSelections = Object.keys(defaultChoiceGroups).length > 0 ? defaultChoiceGroups : undefined;
      const result = await bulkUploadCandidates(parseInt(selectedExamId), bulkUploadFile, defaultSelections);
      setBulkUploadResult(result);
      if (result.failed === 0) {
        toast.success(`Successfully uploaded ${result.successful} candidate(s)`);
      } else {
        toast.warning(`Upload completed with ${result.failed} error(s)`);
      }
      loadCandidatesForExam(parseInt(selectedExamId));
      setBulkUploadFile(null);
      setDefaultChoiceGroups({});
      setBulkProgrammeSubjects(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload candidates");
    } finally {
      setBulkUploading(false);
    }
  };

  const loadBulkOptionalCoreGroups = async () => {
    // Since optional core subjects with choice_group_id are added to all programmes,
    // we can load them from any programme. Use the first available programme.
    if (programmes.length === 0 || !selectedExam) {
      setBulkProgrammeSubjects(null);
      return;
    }

    setLoadingBulkSubjects(true);
    try {
      // Try to load from the first available programme
      const firstProgramme = programmes[0];
      const subjects = await getProgrammeSubjects(firstProgramme.id);

      // Verify we have the correct data structure
      if (subjects && subjects.optional_core_groups) {
        // Only set if we have optional core groups
        if (subjects.optional_core_groups.length > 0) {
          setBulkProgrammeSubjects(subjects);
        } else {
          setBulkProgrammeSubjects(null);
        }
      } else {
        setBulkProgrammeSubjects(null);
      }
    } catch (error) {
      console.error("Failed to load optional core groups:", error);
      // Don't show error toast - it's okay if there are no optional core groups
      setBulkProgrammeSubjects(null);
    } finally {
      setLoadingBulkSubjects(false);
    }
  };

  const handleDefaultChoiceGroupChange = (groupId: number, subjectCode: string) => {
    if (subjectCode && subjectCode !== "__none__") {
      setDefaultChoiceGroups((prev) => ({
        ...prev,
        [groupId]: subjectCode,
      }));
    } else {
      // Remove the group selection if "__none__" is selected
      setDefaultChoiceGroups((prev) => {
        const updated = { ...prev };
        delete updated[groupId];
        return updated;
      });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const blob = await downloadCandidateTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "candidate_upload_template.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Template downloaded successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to download template";
      toast.error(errorMessage);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading exams...</div>;
  }

  const programmeOptions = programmes.map((p) => ({
    value: p.id.toString(),
    label: `${p.code} - ${p.name}`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Candidate Registration</h1>
        <p className="text-muted-foreground mt-1">Select an examination and register candidates</p>
      </div>

      {/* Exam Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Select Examination
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="exam">Examination *</Label>
              <Select value={selectedExamId} onValueChange={setSelectedExamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an examination to register candidates" />
                </SelectTrigger>
                <SelectContent>
                  {exams.length === 0 ? (
                    <SelectItem value="none" disabled>
                      No available examinations
                    </SelectItem>
                  ) : (
                    exams.map((exam) => (
                      <SelectItem key={exam.id} value={exam.id.toString()}>
                        {exam.exam_type} {exam.exam_series} {exam.year}
                        {exam.registration_period && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({new Date(exam.registration_period.registration_start_date).toLocaleDateString()} -{" "}
                            {new Date(exam.registration_period.registration_end_date).toLocaleDateString()})
                          </span>
                        )}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedExam && (
              <Alert>
                <GraduationCap className="h-4 w-4" />
                <AlertDescription>
                  <strong>Selected Exam:</strong> {selectedExam.exam_type} {selectedExam.exam_series} {selectedExam.year}
                  {selectedExam.registration_period && (
                    <>
                      <br />
                      <span className="text-sm">
                        Registration Period: {new Date(selectedExam.registration_period.registration_start_date).toLocaleDateString()} -{" "}
                        {new Date(selectedExam.registration_period.registration_end_date).toLocaleDateString()}
                      </span>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Registration Tabs */}
      {selectedExam && (
        <Tabs defaultValue="manual" className="space-y-4">
          <TabsList>
            <TabsTrigger value="manual">Manual Registration</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <Card>
              <CardHeader>
                <CardTitle>Register New Candidate</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Basic Information</h3>
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
                  </div>

                  {/* Programme Selection */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Programme & Subjects</h3>
                    <div className="space-y-2">
                      <Label htmlFor="programme">Programme</Label>
                      {loadingProgrammes ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading programmes...
                        </div>
                      ) : (
                        <>
                          <SearchableSelect
                            options={programmeOptions}
                            value={selectedProgrammeId?.toString()}
                            onValueChange={handleProgrammeChange}
                            placeholder={programmeOptions.length === 0 ? "No programmes available" : "Select a programme..."}
                            disabled={submitting || programmeOptions.length === 0}
                            emptyMessage="No programmes found"
                          />
                          {programmeOptions.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              No programmes are available for your school. Please contact your administrator to add programmes.
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {loadingSubjects && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading subjects...
                      </div>
                    )}

                    {programmeSubjects && !loadingSubjects && (
                      <div className="space-y-4 border rounded-lg p-4">
                        {/* Compulsory Core Subjects */}
                        {programmeSubjects.compulsory_core.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base font-medium">Compulsory Core Subjects</Label>
                            <div className="space-y-2 pl-4">
                              {programmeSubjects.compulsory_core.map((subject) => (
                                <div key={subject.subject_id} className="flex items-center gap-2">
                                  <Checkbox checked={true} disabled />
                                  <Label className="font-normal">
                                    {subject.subject_code} - {subject.subject_name}
                                  </Label>
                                  <Badge variant="secondary" className="text-xs">
                                    CORE
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Optional Core Groups */}
                        {programmeSubjects.optional_core_groups.length > 0 && (
                          <div className="space-y-3">
                            <Label className="text-base font-medium">Optional Core Groups (Select one per group)</Label>
                            {programmeSubjects.optional_core_groups.map((group) => {
                              const selectedInGroup = selectedSubjectIds.find((id) =>
                                group.subjects.some((s) => s.subject_id === id)
                              );
                              return (
                                <div key={group.choice_group_id} className="space-y-2 pl-4 border-l-2">
                                  <Label className="text-sm font-medium">Group {group.choice_group_id}</Label>
                                  <RadioGroup
                                    value={selectedInGroup?.toString()}
                                    onValueChange={(value) =>
                                      handleOptionalGroupChange(group.subjects, parseInt(value))
                                    }
                                  >
                                    {group.subjects.map((subject) => (
                                      <div key={subject.subject_id} className="flex items-center gap-2">
                                        <RadioGroupItem value={subject.subject_id.toString()} id={`group-${group.choice_group_id}-${subject.subject_id}`} />
                                        <Label htmlFor={`group-${group.choice_group_id}-${subject.subject_id}`} className="font-normal cursor-pointer">
                                          {subject.subject_code} - {subject.subject_name}
                                        </Label>
                                        <Badge variant="secondary" className="text-xs">
                                          CORE
                                        </Badge>
                                      </div>
                                    ))}
                                  </RadioGroup>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Elective Subjects */}
                        {programmeSubjects.electives.length > 0 && (() => {
                          const isMayJune = selectedExam?.exam_series?.toUpperCase().replace(/[-\s]/g, "/") === "MAY/JUNE";
                          return (
                            <div className="space-y-2">
                              <Label className="text-base font-medium">
                                Elective Subjects {isMayJune ? "(All Required)" : "(Select any)"}
                              </Label>
                              <div className="space-y-2 pl-4">
                                {programmeSubjects.electives.map((subject) => {
                                  const isChecked = selectedSubjectIds.includes(subject.subject_id);
                                  return (
                                    <div key={subject.subject_id} className="flex items-center gap-2">
                                      <Checkbox
                                        checked={isChecked}
                                        disabled={isMayJune}
                                        onCheckedChange={(checked) =>
                                          handleSubjectToggle(subject.subject_id, checked as boolean)
                                        }
                                      />
                                      <Label className={`font-normal ${isMayJune ? "" : "cursor-pointer"}`}>
                                        {subject.subject_code} - {subject.subject_name}
                                      </Label>
                                      <Badge variant="outline" className="text-xs">
                                        ELECTIVE
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Contact Information</h3>
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

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Registering...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Register Candidate
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Upload Candidates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Default Choice Group Selection */}
                {selectedExam && (
                  <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
                    <Label className="text-sm font-semibold">Default Choice Group Selection (Optional)</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Select default optional core subjects to apply to all candidates. If not set, candidates can complete selection later.
                    </p>

                    {/* Choice Group Selection */}
                    {loadingBulkSubjects ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading optional core subjects...
                      </div>
                    ) : bulkProgrammeSubjects && bulkProgrammeSubjects.optional_core_groups.length > 0 ? (
                      <div className="space-y-3 mt-2">
                        <Label className="text-sm font-medium">Optional Core Groups</Label>
                        <p className="text-xs text-muted-foreground mb-2">
                          Select one optional core subject from each group to apply as default for all candidates.
                        </p>
                        {bulkProgrammeSubjects.optional_core_groups.map((group) => {
                          const selectedSubjectCode = defaultChoiceGroups[group.choice_group_id];
                          return (
                            <div key={group.choice_group_id} className="space-y-2 pl-4 border-l-2">
                              <Label className="text-sm font-medium">Group {group.choice_group_id} (Optional)</Label>
                              <Select
                                value={selectedSubjectCode || undefined}
                                onValueChange={(value) => handleDefaultChoiceGroupChange(group.choice_group_id, value)}
                                disabled={bulkUploading}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder={`Select one optional core subject for group ${group.choice_group_id}...`} />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  <SelectItem value="__none__">None (complete later)</SelectItem>
                                  {group.subjects.map((subject) => (
                                    <SelectItem key={subject.subject_id} value={subject.subject_code}>
                                      {subject.subject_code} - {subject.subject_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground py-2">
                        No optional core subjects available.
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bulk-file">Upload CSV/Excel File</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadTemplate}
                      disabled={downloadingTemplate}
                    >
                      {downloadingTemplate ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="mr-2 h-4 w-4" />
                          Download Template
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bulk-file"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
                      disabled={bulkUploading}
                    />
                    <Button
                      onClick={handleBulkUpload}
                      disabled={!bulkUploadFile || bulkUploading}
                    >
                      {bulkUploading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    CSV/Excel file should contain columns: name, programme_code, optional_subjects (comma-separated), and other candidate fields. All columns are formatted as text to preserve leading zeros.
                  </p>
                </div>

                {bulkUploadResult && (
                  <div className="space-y-2">
                    <Alert>
                      <FileSpreadsheet className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          <div>Total Rows: {bulkUploadResult.total_rows}</div>
                          <div className="text-green-600">Successful: {bulkUploadResult.successful}</div>
                          {bulkUploadResult.failed > 0 && (
                            <div className="text-red-600">Failed: {bulkUploadResult.failed}</div>
                          )}
                        </div>
                      </AlertDescription>
                    </Alert>

                    {bulkUploadResult.errors.length > 0 && (
                      <div className="space-y-2">
                        <Label>Errors:</Label>
                        <div className="border rounded-lg p-4 max-h-60 overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Row</TableHead>
                                <TableHead>Field</TableHead>
                                <TableHead>Error</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {bulkUploadResult.errors.map((error, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{error.row_number}</TableCell>
                                  <TableCell>{error.field || "-"}</TableCell>
                                  <TableCell className="text-red-600">{error.error_message}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Registered Candidates for Selected Exam */}
      {selectedExam && (
        <Card>
          <CardHeader>
            <CardTitle>Registered Candidates for {selectedExam.exam_type} {selectedExam.exam_series} {selectedExam.year}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Registration Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registration Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No candidates registered for this examination yet
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
      )}

      {!selectedExam && exams.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please select an examination above to begin registering candidates.
          </AlertDescription>
        </Alert>
      )}

      {exams.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No examinations are currently available for registration. Please contact the administrator.
          </AlertDescription>
        </Alert>
      )}

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        candidate={selectedCandidate}
        candidates={candidates}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onCandidateChange={(candidate) => setSelectedCandidate(candidate)}
      />
    </div>
  );
}
