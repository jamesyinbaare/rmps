"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus,
  GraduationCap,
  AlertCircle,
  Upload,
  FileSpreadsheet,
  Loader2,
  Search,
  X,
  Users,
  CheckCircle2,
  Calendar,
  Clock,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  XCircle,
  Trash2,
  HelpCircle,
  FileText,
} from "lucide-react";
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
    guardian_name: null,
    guardian_phone: null,
    guardian_address: null,
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
  const [isDragOver, setIsDragOver] = useState(false);

  // Table features state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "DRAFT">("ALL");
  const [sortColumn, setSortColumn] = useState<"name" | "registration_number" | "status" | "registration_date" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Form organization state
  const [basicInfoOpen, setBasicInfoOpen] = useState(true);
  const [programmeInfoOpen, setProgrammeInfoOpen] = useState(true);
  const [contactInfoOpen, setContactInfoOpen] = useState(true);
  const [guardianInfoOpen, setGuardianInfoOpen] = useState(true);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Refs for keyboard shortcuts
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Calculate statistics for candidates
  const candidateStatistics = useMemo(() => {
    const totalRegistered = candidates.length;
    const totalApproved = candidates.filter((c) => c.registration_status === "APPROVED").length;
    const completionPercentage = totalRegistered > 0 ? (totalApproved / totalRegistered) * 100 : 0;
    return { totalRegistered, totalApproved, completionPercentage };
  }, [candidates]);

  // Registration period status helper
  const getRegistrationPeriodStatus = useCallback((exam: RegistrationExam | null) => {
    if (!exam?.registration_period) return { status: "unknown", label: "Unknown", variant: "secondary" as const };
    const now = new Date();
    const start = new Date(exam.registration_period.registration_start_date);
    const end = new Date(exam.registration_period.registration_end_date);
    if (now < start) return { status: "upcoming", label: "Upcoming", variant: "outline" as const };
    if (now > end) return { status: "closed", label: "Closed", variant: "secondary" as const };
    return { status: "active", label: "Active", variant: "default" as const };
  }, []);

  // Filtered and sorted candidates
  const filteredCandidates = useMemo(() => {
    let filtered = candidates;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.registration_number?.toLowerCase().includes(query) ||
          c.index_number?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    if (statusFilter !== "ALL") {
      filtered = filtered.filter((c) => c.registration_status === statusFilter);
    }

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any;
        let bVal: any;

        switch (sortColumn) {
          case "name":
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case "registration_number":
            aVal = a.registration_number?.toLowerCase() || "";
            bVal = b.registration_number?.toLowerCase() || "";
            break;
          case "status":
            aVal = a.registration_status;
            bVal = b.registration_status;
            break;
          case "registration_date":
            aVal = new Date(a.registration_date).getTime();
            bVal = new Date(b.registration_date).getTime();
            break;
          default:
            return 0;
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [candidates, searchQuery, statusFilter, sortColumn, sortDirection]);

  // Paginated candidates
  const paginatedCandidates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredCandidates.slice(start, end);
  }, [filteredCandidates, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredCandidates.length / pageSize);

  // Handle sort
  const handleSort = (column: "name" | "registration_number" | "status" | "registration_date") => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  // Get sort icon
  const getSortIcon = (column: "name" | "registration_number" | "status" | "registration_date") => {
    if (sortColumn !== column) return <ArrowUpDown className="h-4 w-4 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
  };

  // Form validation
  const validateField = (field: string, value: any) => {
    const errors = { ...validationErrors };
    switch (field) {
      case "name":
        if (!value || !value.trim()) {
          errors.name = "Name is required";
        } else {
          delete errors.name;
        }
        break;
      case "date_of_birth":
        if (!value) {
          errors.date_of_birth = "Date of birth is required";
        } else {
          delete errors.date_of_birth;
        }
        break;
      case "gender":
        if (!value) {
          errors.gender = "Gender is required";
        } else {
          delete errors.gender;
        }
        break;
      case "contact_email":
        if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.contact_email = "Invalid email format";
        } else {
          delete errors.contact_email;
        }
        break;
    }
    setValidationErrors(errors);
  };

  // Clear form
  const clearForm = useCallback(() => {
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
      guardian_name: null,
      guardian_phone: null,
      guardian_address: null,
      subject_codes: [],
      subject_ids: [],
    });
    setSelectedProgrammeId(null);
    setProgrammeSubjects(null);
    setSelectedSubjectIds([]);
    setValidationErrors({});
  }, []);

  // Subject count display
  const selectedSubjectCount = useMemo(() => {
    return selectedSubjectIds.length;
  }, [selectedSubjectIds]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file && (file.type.includes("csv") || file.type.includes("spreadsheet") || file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      setBulkUploadFile(file);
    } else {
      toast.error("Please drop a valid CSV or Excel file");
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      // Escape to clear search
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        guardian_name: null,
        guardian_phone: null,
        guardian_address: null,
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
      const blob = await downloadCandidateTemplate(selectedExam?.id);
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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Select Examination
            </CardTitle>
            {selectedExam && (
              <Badge variant={getRegistrationPeriodStatus(selectedExam).variant}>
                {getRegistrationPeriodStatus(selectedExam).label}
              </Badge>
            )}
          </div>
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
                        {exam.exam_type}{exam.exam_series ? ` ${exam.exam_series}` : ""} {exam.year}
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
              <>
                {/* Statistics Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Total Registered</p>
                          <p className="text-2xl font-bold">{candidateStatistics.totalRegistered}</p>
                        </div>
                        <Users className="h-8 w-8 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">Completed (Approved)</p>
                          <p className="text-2xl font-bold">{candidateStatistics.totalApproved}</p>
                        </div>
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Completion Progress</p>
                          <span className="text-sm font-medium">{Math.round(candidateStatistics.completionPercentage)}%</span>
                        </div>
                        <Progress value={candidateStatistics.completionPercentage} className="h-2" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Registration Period Info */}
                {selectedExam.registration_period && (
                  <Alert>
                    <Calendar className="h-4 w-4" />
                    <AlertDescription>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <strong>Registration Period:</strong>{" "}
                          {new Date(selectedExam.registration_period.registration_start_date).toLocaleDateString()} -{" "}
                          {new Date(selectedExam.registration_period.registration_end_date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {getRegistrationPeriodStatus(selectedExam).status === "active" ? "Currently Active" : getRegistrationPeriodStatus(selectedExam).label}
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </>
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
                <div className="flex items-center justify-between">
                  <CardTitle>Register New Candidate</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearForm}
                    disabled={submitting}
                    aria-label="Clear form"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Form
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Basic Information */}
                  <Collapsible open={basicInfoOpen} onOpenChange={setBasicInfoOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Basic Information</h3>
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      </div>
                      {basicInfoOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name *</Label>
                      <Input
                        id="name"
                        placeholder="John Doe"
                        value={formData.name}
                        onChange={(e) => {
                          setFormData({ ...formData, name: e.target.value });
                          validateField("name", e.target.value);
                        }}
                        onBlur={(e) => validateField("name", e.target.value)}
                        required
                        disabled={submitting}
                        aria-invalid={!!validationErrors.name}
                        aria-describedby={validationErrors.name ? "name-error" : undefined}
                      />
                      {validationErrors.name && (
                        <p id="name-error" className="text-sm text-red-600 flex items-center gap-1">
                          <XCircle className="h-4 w-4" />
                          {validationErrors.name}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="date_of_birth">Date of Birth *</Label>
                        <Input
                          id="date_of_birth"
                          type="date"
                          value={formData.date_of_birth || ""}
                          onChange={(e) => {
                            const value = e.target.value || null;
                            setFormData({ ...formData, date_of_birth: value });
                            validateField("date_of_birth", value);
                          }}
                          onBlur={(e) => validateField("date_of_birth", e.target.value)}
                          disabled={submitting}
                          aria-invalid={!!validationErrors.date_of_birth}
                          aria-describedby={validationErrors.date_of_birth ? "date_of_birth-error" : undefined}
                        />
                        {validationErrors.date_of_birth && (
                          <p id="date_of_birth-error" className="text-sm text-red-600 flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            {validationErrors.date_of_birth}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gender">Gender *</Label>
                        <Select
                          value={formData.gender || ""}
                          onValueChange={(value) => {
                            const val = value || null;
                            setFormData({ ...formData, gender: val });
                            validateField("gender", val);
                          }}
                        >
                          <SelectTrigger
                            aria-invalid={!!validationErrors.gender}
                            aria-describedby={validationErrors.gender ? "gender-error" : undefined}
                          >
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {validationErrors.gender && (
                          <p id="gender-error" className="text-sm text-red-600 flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            {validationErrors.gender}
                          </p>
                        )}
                      </div>
                    </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Programme Selection */}
                  <Collapsible open={programmeInfoOpen} onOpenChange={setProgrammeInfoOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Programme & Subjects</h3>
                        {selectedSubjectCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {selectedSubjectCount} selected
                          </Badge>
                        )}
                      </div>
                      {programmeInfoOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="programme">Programme</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-4 w-4 p-0" type="button">
                              <Info className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <p className="text-sm">Select a programme to automatically load required subjects for this examination.</p>
                          </PopoverContent>
                        </Popover>
                      </div>
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
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Contact Information */}
                  <Collapsible open={contactInfoOpen} onOpenChange={setContactInfoOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Contact Information</h3>
                        <Badge variant="outline" className="text-xs">Optional</Badge>
                      </div>
                      {contactInfoOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="contact_email">Contact Email</Label>
                        <Input
                          id="contact_email"
                          type="email"
                          placeholder="candidate@example.com"
                          value={formData.contact_email || ""}
                          onChange={(e) => {
                            const value = e.target.value || null;
                            setFormData({ ...formData, contact_email: value });
                            validateField("contact_email", value);
                          }}
                          onBlur={(e) => validateField("contact_email", e.target.value)}
                          disabled={submitting}
                          aria-invalid={!!validationErrors.contact_email}
                          aria-describedby={validationErrors.contact_email ? "contact_email-error" : undefined}
                        />
                        {validationErrors.contact_email && (
                          <p id="contact_email-error" className="text-sm text-red-600 flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            {validationErrors.contact_email}
                          </p>
                        )}
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
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Guardian Information */}
                  <Collapsible open={guardianInfoOpen} onOpenChange={setGuardianInfoOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Guardian Information</h3>
                        <Badge variant="outline" className="text-xs">Optional</Badge>
                      </div>
                      {guardianInfoOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="guardian_name">Guardian Name</Label>
                      <Input
                        id="guardian_name"
                        placeholder="Guardian full name"
                        value={formData.guardian_name || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, guardian_name: e.target.value || null })
                        }
                        disabled={submitting}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="guardian_phone">Guardian Phone</Label>
                        <Input
                          id="guardian_phone"
                          placeholder="+1234567890"
                          value={formData.guardian_phone || ""}
                          onChange={(e) =>
                            setFormData({ ...formData, guardian_phone: e.target.value || null })
                          }
                          disabled={submitting}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="guardian_address">Guardian Address</Label>
                      <Input
                        id="guardian_address"
                        placeholder="Guardian street address"
                        value={formData.guardian_address || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, guardian_address: e.target.value || null })
                        }
                        disabled={submitting}
                      />
                    </div>
                    </CollapsibleContent>
                  </Collapsible>

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

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bulk-file">Upload CSV/Excel File</Label>
                    <div className="flex items-center gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" type="button">
                            <HelpCircle className="h-4 w-4 mr-2" />
                            Template Format Help
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-96">
                          <div className="space-y-2">
                            <h4 className="font-semibold">Template Format Guide</h4>
                            <p className="text-sm text-muted-foreground">
                              The template includes required and optional columns. Required columns are highlighted in green, optional columns in yellow.
                            </p>
                            <div className="text-sm space-y-1">
                              <p><strong>Required:</strong> name, date_of_birth, gender, programme_code</p>
                              <p><strong>Optional:</strong> national_id, contact_email, contact_phone, address, guardian_name, guardian_phone, guardian_address</p>
                              <p className="text-xs text-muted-foreground mt-2">
                                For MAY/JUNE exams, subject columns are not included. All columns are formatted as text to preserve leading zeros.
                              </p>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
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
                  </div>

                  {/* Drag and Drop Area */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                    } ${bulkUploading ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <Input
                      ref={(input) => {
                        if (input) {
                          input.style.display = "none";
                        }
                      }}
                      id="bulk-file"
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => setBulkUploadFile(e.target.files?.[0] || null)}
                      disabled={bulkUploading}
                      className="hidden"
                    />
                    <label htmlFor="bulk-file" className="cursor-pointer">
                      <div className="flex flex-col items-center gap-4">
                        <Upload className={`h-12 w-12 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className="text-sm font-medium">
                            {bulkUploadFile ? bulkUploadFile.name : "Drop your file here, or click to browse"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Supports CSV, XLSX, and XLS files
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>

                  {bulkUploadFile && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{bulkUploadFile.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setBulkUploadFile(null)}
                          disabled={bulkUploading}
                          type="button"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {bulkUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Uploading...</span>
                        <span>Processing file</span>
                      </div>
                      <Progress value={50} className="h-2" />
                    </div>
                  )}

                  <Button
                    onClick={handleBulkUpload}
                    disabled={!bulkUploadFile || bulkUploading}
                    className="w-full"
                  >
                    {bulkUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload File
                      </>
                    )}
                  </Button>
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
          <CardContent className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search by name or registration number..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-10"
                  aria-label="Search candidates"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap gap-2">
                {(["ALL", "PENDING", "APPROVED", "REJECTED", "DRAFT"] as const).map((status) => (
                  <Button
                    key={status}
                    variant={statusFilter === status ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setStatusFilter(status);
                      setCurrentPage(1);
                    }}
                    type="button"
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => handleSort("name")}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Name {getSortIcon("name")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => handleSort("registration_number")}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Registration Number {getSortIcon("registration_number")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => handleSort("status")}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Status {getSortIcon("status")}
                      </button>
                    </TableHead>
                    <TableHead>
                      <button
                        type="button"
                        onClick={() => handleSort("registration_date")}
                        className="flex items-center gap-2 hover:text-foreground"
                      >
                        Registration Date {getSortIcon("registration_date")}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCandidates.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        {candidates.length === 0
                          ? "No candidates registered for this examination yet"
                          : "No candidates match your search criteria"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCandidates.map((candidate) => (
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
                          <Badge
                            variant={
                              candidate.registration_status === "APPROVED"
                                ? "default"
                                : candidate.registration_status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                            }
                            className={
                              candidate.registration_status === "APPROVED"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : candidate.registration_status === "REJECTED"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                            }
                          >
                            {candidate.registration_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(candidate.registration_date).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {filteredCandidates.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredCandidates.length)} of{" "}
                  {filteredCandidates.length} candidates
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    type="button"
                  >
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          type="button"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    type="button"
                  >
                    Next
                  </Button>
                </div>
                <Select value={pageSize.toString()} onValueChange={(value) => { setPageSize(parseInt(value)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
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
