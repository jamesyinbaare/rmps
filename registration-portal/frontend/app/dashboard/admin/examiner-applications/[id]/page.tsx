"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAdminExaminerApplication,
  processExaminerApplication,
  acceptExaminerApplication,
  rejectExaminerApplication,
  listCtvetStaffUsers,
  getCurrentUser,
  fetchWithAuth,
  type ExaminerApplication,
  type User,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  AlertCircle,
  ArrowLeft,
  User,
  GraduationCap,
  Briefcase,
  Award,
  BookOpen,
  FileText,
  CheckCircle2,
  XCircle,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Building2,
  FileCheck,
  Download,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

interface ExaminerApplicationProcessing {
  checked_by_user_id?: string | null;
  received_date?: string | null;
  certificate_types?: string[] | null;
  certificates_checked_by_user_id?: string | null;
  certificates_checked_date?: string | null;
  accepted_first_invitation_date?: string | null;
  accepted_subject?: string | null;
  accepted_officer_user_id?: string | null;
  accepted_date?: string | null;
  rejected_reasons?: string | null;
  rejected_officer_user_id?: string | null;
  rejected_date?: string | null;
}

export default function AdminExaminerApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = parseInt(params.id as string);
  const [application, setApplication] = useState<ExaminerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<ExaminerApplicationProcessing>({});
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReasons, setRejectReasons] = useState("");
  const [selectedCertificateTypes, setSelectedCertificateTypes] = useState<string[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<{ id: number; name: string; type: string; url: string; mime_type?: string } | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [loadingDocument, setLoadingDocument] = useState(false);

  const certificateTypeOptions = ["Degree Certificate", "Diploma Certificate", "Transcript", "Other"];

  useEffect(() => {
    if (applicationId) {
      loadApplication();
      loadUsers();
      loadCurrentUser();
    }
  }, [applicationId]);

  const loadApplication = async () => {
    try {
      setLoading(true);
      const data = await getAdminExaminerApplication(applicationId);
      setApplication(data);
      // Initialize processing data if it exists
      if ((data as any).processing) {
        setProcessing((data as any).processing);
        if ((data as any).processing.certificate_types) {
          setSelectedCertificateTypes((data as any).processing.certificate_types);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load application");
      router.push("/dashboard/admin/examiner-applications");
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const response = await listCtvetStaffUsers({ page_size: 100 });
      setUsers(response.items);
    } catch (error: any) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadCurrentUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (error: any) {
      console.error("Failed to load current user:", error);
    }
  };

  const handleProcess = async () => {
    try {
      setSaving(true);
      // Auto-populate checked_by_user_id if not set and current user is available
      const processData: any = {
        ...processing,
        certificate_types: selectedCertificateTypes.length > 0 ? selectedCertificateTypes : null,
      };
      if (!processData.checked_by_user_id && currentUser) {
        processData.checked_by_user_id = currentUser.id;
      }
      // Auto-populate certificates_checked_by_user_id if certificates are checked
      if (selectedCertificateTypes.length > 0 && !processData.certificates_checked_by_user_id && currentUser) {
        processData.certificates_checked_by_user_id = currentUser.id;
      }
      await processExaminerApplication(applicationId, processData);
      toast.success("Processing information saved successfully");
      loadApplication();
    } catch (error: any) {
      toast.error(error.message || "Failed to save processing information");
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = async () => {
    try {
      setSaving(true);
      await acceptExaminerApplication(applicationId, {
        ...processing,
        certificate_types: selectedCertificateTypes.length > 0 ? selectedCertificateTypes : null,
        accepted_date: new Date().toISOString().split("T")[0],
      });
      toast.success("Application accepted successfully");
      setShowAcceptDialog(false);
      loadApplication();
    } catch (error: any) {
      toast.error(error.message || "Failed to accept application");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReasons.trim()) {
      toast.error("Please provide rejection reasons");
      return;
    }
    try {
      setSaving(true);
      await rejectExaminerApplication(applicationId, {
        rejected_reasons: rejectReasons,
      });
      toast.success("Application rejected successfully");
      setShowRejectDialog(false);
      setRejectReasons("");
      loadApplication();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject application");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const handleViewDocument = async (doc: { id: number; document_type: string; file_name: string; mime_type: string }) => {
    try {
      setLoadingDocument(true);
      setSelectedDocument({
        id: doc.id,
        name: doc.file_name,
        type: doc.document_type,
        url: "",
        mime_type: doc.mime_type,
      });

      // Fetch document with authentication (use admin endpoint)
      const response = await fetchWithAuth(
        `/api/v1/admin/examiner-applications/${applicationId}/documents/${doc.id}/download`
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Failed to load document: ${response.status} ${errorText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDocumentUrl(url);
      setSelectedDocument({
        id: doc.id,
        name: doc.file_name,
        type: doc.document_type,
        url: url,
        mime_type: doc.mime_type,
      });
    } catch (error: any) {
      toast.error(error.message || "Failed to load document");
      setSelectedDocument(null);
      setDocumentUrl(null);
    } finally {
      setLoadingDocument(false);
    }
  };

  const handleCloseDocument = () => {
    if (documentUrl) {
      URL.revokeObjectURL(documentUrl);
      setDocumentUrl(null);
    }
    setSelectedDocument(null);
  };

  const handleDownloadDocument = () => {
    if (selectedDocument && documentUrl) {
      const link = document.createElement("a");
      link.href = documentUrl;
      link.download = selectedDocument.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const isImage = (mimeType: string) => {
    return mimeType.startsWith("image/");
  };

  const isPdf = (mimeType: string) => {
    return mimeType === "application/pdf";
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      DRAFT: "outline",
      SUBMITTED: "secondary",
      UNDER_REVIEW: "default",
      ACCEPTED: "default",
      REJECTED: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status.replace("_", " ")}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!application) {
    return null;
  }

  const canAccept = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const canReject = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const isAccepted = application.status === "ACCEPTED";
  const isRejected = application.status === "REJECTED";

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Examiner Application</h1>
            <p className="text-muted-foreground">Application #{application.application_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(application.status)}
          {canAccept && (
            <Button onClick={() => setShowAcceptDialog(true)} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Accept
            </Button>
          )}
          {canReject && (
            <Button variant="destructive" onClick={() => setShowRejectDialog(true)} className="gap-2">
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="section-a" className="space-y-6">
        <TabsList>
          <TabsTrigger value="section-a">Section A - Application</TabsTrigger>
          <TabsTrigger value="section-b">Section B - Recommendation</TabsTrigger>
          <TabsTrigger value="section-c">Section C - Processing</TabsTrigger>
        </TabsList>

        {/* Section A - Application Details */}
        <TabsContent value="section-a" className="space-y-6">
          {/* Personal Particulars */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Particulars
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Full Name</Label>
                <p className="font-medium">{application.full_name}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Title</Label>
                <p className="font-medium">{application.title || "N/A"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Nationality</Label>
                <p className="font-medium">{application.nationality || "N/A"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Date of Birth</Label>
                <p className="font-medium">{formatDate(application.date_of_birth)}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-muted-foreground">Office Address</Label>
                <p className="font-medium">{application.office_address || "N/A"}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-muted-foreground">Residential Address</Label>
                <p className="font-medium">{application.residential_address || "N/A"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {application.email_address || "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Telephone (Office)</Label>
                <p className="font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {application.telephone_office || "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Telephone (Cell)</Label>
                <p className="font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {application.telephone_cell || "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Present School/Institution</Label>
                <p className="font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {application.present_school_institution || "N/A"}
                </p>
              </div>
              <div>
                <Label className="text-muted-foreground">Present Rank/Position</Label>
                <p className="font-medium">{application.present_rank_position || "N/A"}</p>
              </div>
              <div className="md:col-span-2">
                <Label className="text-muted-foreground">Subject Area</Label>
                <p className="font-medium">{application.subject_area || "N/A"}</p>
              </div>
              {application.additional_information && (
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Additional Information</Label>
                  <p className="font-medium whitespace-pre-wrap">{application.additional_information}</p>
                </div>
              )}
              {application.ceased_examining_explanation && (
                <div className="md:col-span-2">
                  <Label className="text-muted-foreground">Ceased Examining Explanation</Label>
                  <p className="font-medium whitespace-pre-wrap">{application.ceased_examining_explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Academic Qualifications */}
          {application.qualifications && application.qualifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Academic Qualifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {application.qualifications.map((qual, index) => (
                  <div key={qual.id} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">University/College</Label>
                        <p className="font-medium">{qual.university_college}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Degree/Diploma</Label>
                        <p className="font-medium">{qual.degree_diploma}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Class of Degree</Label>
                        <p className="font-medium">{qual.class_of_degree || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Date of Award</Label>
                        <p className="font-medium">{formatDate(qual.date_of_award)}</p>
                      </div>
                      {qual.major_subjects && (
                        <div className="md:col-span-2">
                          <Label className="text-muted-foreground">Major Subjects</Label>
                          <p className="font-medium">{qual.major_subjects}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Teaching Experience */}
          {application.teaching_experiences && application.teaching_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Teaching Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {application.teaching_experiences.map((exp) => (
                  <div key={exp.id} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Institution</Label>
                        <p className="font-medium">{exp.institution_name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Period</Label>
                        <p className="font-medium">
                          {formatDate(exp.date_from)} - {formatDate(exp.date_to)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Subject</Label>
                        <p className="font-medium">{exp.subject || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Level</Label>
                        <p className="font-medium">{exp.level || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Work Experience */}
          {application.work_experiences && application.work_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Work Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {application.work_experiences.map((exp) => (
                  <div key={exp.id} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Occupation</Label>
                        <p className="font-medium">{exp.occupation}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Employer</Label>
                        <p className="font-medium">{exp.employer_name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Period</Label>
                        <p className="font-medium">
                          {formatDate(exp.date_from)} - {formatDate(exp.date_to)}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Position Held</Label>
                        <p className="font-medium">{exp.position_held || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Examining Experience */}
          {application.examining_experiences && application.examining_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5" />
                  Examining Experience
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {application.examining_experiences.map((exp) => (
                  <div key={exp.id} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Examination Body</Label>
                        <p className="font-medium">{exp.examination_body}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Subject</Label>
                        <p className="font-medium">{exp.subject || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Level</Label>
                        <p className="font-medium">{exp.level || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <p className="font-medium">{exp.status || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Period</Label>
                        <p className="font-medium">
                          {formatDate(exp.date_from)} - {formatDate(exp.date_to)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Training Courses */}
          {application.training_courses && application.training_courses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Training Courses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {application.training_courses.map((course) => (
                  <div key={course.id} className="p-4 border rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Organizer</Label>
                        <p className="font-medium">{course.organizer}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Course Name</Label>
                        <p className="font-medium">{course.course_name}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Place</Label>
                        <p className="font-medium">{course.place || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Period</Label>
                        <p className="font-medium">
                          {formatDate(course.date_from)} - {formatDate(course.date_to)}
                        </p>
                      </div>
                      {course.reason_for_participation && (
                        <div className="md:col-span-2">
                          <Label className="text-muted-foreground">Reason for Participation</Label>
                          <p className="font-medium">{course.reason_for_participation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Subject Preferences */}
          {application.subject_preferences && application.subject_preferences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck className="h-5 w-5" />
                  Subject Preferences
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {application.subject_preferences.map((pref) => (
                    <Badge key={pref.id} variant="outline">
                      {pref.preference_type}: {pref.subject_area || "N/A"}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documents */}
          {application.documents && application.documents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {application.documents.map((doc) => (
                    <div key={doc.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{doc.document_type}</p>
                          <p className="text-sm text-muted-foreground">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(doc.file_size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDocument(doc)}
                        >
                          View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Section B - Recommendation */}
        <TabsContent value="section-b" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recommendation (Section B)</CardTitle>
              <CardDescription>Submitted by recommender</CardDescription>
            </CardHeader>
            <CardContent>
              {(application as any).recommendation ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Recommender Name</Label>
                      <p className="font-medium">{(application as any).recommendation.recommender_name || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Recommender Status</Label>
                      <p className="font-medium">{(application as any).recommendation.recommender_status || "N/A"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-muted-foreground">Office Address</Label>
                      <p className="font-medium">{(application as any).recommendation.recommender_office_address || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium">{(application as any).recommendation.recommender_phone || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Date</Label>
                      <p className="font-medium">{formatDate((application as any).recommendation.recommender_date)}</p>
                    </div>
                    {(application as any).recommendation.integrity_assessment && (
                      <div className="md:col-span-2">
                        <Label className="text-muted-foreground">Integrity Assessment</Label>
                        <p className="font-medium whitespace-pre-wrap">{(application as any).recommendation.integrity_assessment}</p>
                      </div>
                    )}
                    {(application as any).recommendation.certification_statement && (
                      <div className="md:col-span-2">
                        <Label className="text-muted-foreground">Certification Statement</Label>
                        <p className="font-medium whitespace-pre-wrap">{(application as any).recommendation.certification_statement}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Recommendation Decision</Label>
                      <Badge variant={(application as any).recommendation.recommendation_decision ? "default" : "destructive"}>
                        {(application as any).recommendation.recommendation_decision ? "Recommended" : "Not Recommended"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No recommendation submitted yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section C - Processing Form */}
        <TabsContent value="section-c" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Section C - Office Use Only</CardTitle>
              <CardDescription>Processing information and decisions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Submission of Application Form */}
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold text-lg">Submission of Application Form</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Received Date</Label>
                    <p className="font-medium text-muted-foreground">
                      {application.submitted_at ? formatDate(application.submitted_at) : "N/A"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Auto-filled from submission date</p>
                  </div>
                  <div>
                    <Label>Checked By</Label>
                    <p className="font-medium text-muted-foreground">
                      {processing.checked_by_user_id
                        ? users.find((u) => u.id === processing.checked_by_user_id)?.full_name || "N/A"
                        : currentUser?.full_name || "Not yet checked"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Auto-filled when processing starts</p>
                  </div>
                </div>
              </div>

              {/* Photocopies of Certificate/Transcript */}
              <div className="space-y-4 p-4 border rounded-lg">
                <h3 className="font-semibold text-lg">Photocopies of Certificate/Transcript Attached</h3>
                <div className="space-y-4">
                  <div>
                    <Label>Certificate Types</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {certificateTypeOptions.map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={`cert-${type}`}
                            checked={selectedCertificateTypes.includes(type)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedCertificateTypes([...selectedCertificateTypes, type]);
                              } else {
                                setSelectedCertificateTypes(selectedCertificateTypes.filter((t) => t !== type));
                              }
                            }}
                          />
                          <Label htmlFor={`cert-${type}`} className="font-normal cursor-pointer">
                            {type}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Checked By</Label>
                      <p className="font-medium text-muted-foreground">
                        {processing.certificates_checked_by_user_id
                          ? users.find((u) => u.id === processing.certificates_checked_by_user_id)?.full_name || "N/A"
                          : selectedCertificateTypes.length > 0
                          ? currentUser?.full_name || "Will be auto-filled on save"
                          : "Not yet checked"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Auto-filled when certificates are checked</p>
                    </div>
                    <div>
                      <Label>Checked Date</Label>
                      <p className="font-medium text-muted-foreground">
                        {processing.certificates_checked_date
                          ? formatDate(processing.certificates_checked_date)
                          : selectedCertificateTypes.length > 0
                          ? "Will be auto-filled on save"
                          : "Not yet checked"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Auto-filled when certificates are checked</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Application Accepted */}
              {isAccepted && (
                <div className="space-y-4 p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                  <h3 className="font-semibold text-lg text-green-700 dark:text-green-400">Application Accepted</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>First Invitation Date</Label>
                      <p className="font-medium">{formatDate(processing.accepted_first_invitation_date)}</p>
                    </div>
                    <div>
                      <Label>Subject</Label>
                      <p className="font-medium">{processing.accepted_subject || "N/A"}</p>
                    </div>
                    <div>
                      <Label>Officer</Label>
                      <p className="font-medium">
                        {users.find((u) => u.id === processing.accepted_officer_user_id)?.full_name || "N/A"}
                      </p>
                    </div>
                    <div>
                      <Label>Date</Label>
                      <p className="font-medium">{formatDate(processing.accepted_date)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Auto-filled on acceptance</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Application Rejected */}
              {isRejected && (
                <div className="space-y-4 p-4 border rounded-lg bg-red-50 dark:bg-red-950/20">
                  <h3 className="font-semibold text-lg text-red-700 dark:text-red-400">Application Rejected</h3>
                  <div className="space-y-4">
                    <div>
                      <Label>Reasons</Label>
                      <p className="font-medium whitespace-pre-wrap">{processing.rejected_reasons || "N/A"}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Officer</Label>
                        <p className="font-medium">
                          {users.find((u) => u.id === processing.rejected_officer_user_id)?.full_name || "N/A"}
                        </p>
                      </div>
                      <div>
                        <Label>Date</Label>
                        <p className="font-medium">{formatDate(processing.rejected_date)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Auto-filled on rejection</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Accept Form (only if not already accepted/rejected) */}
              {!isAccepted && !isRejected && (
                <>
                  <div className="space-y-4 p-4 border rounded-lg">
                    <h3 className="font-semibold text-lg">Application Accepted</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="accepted_first_invitation_date">First Invitation Date</Label>
                        <Input
                          id="accepted_first_invitation_date"
                          type="date"
                          value={processing.accepted_first_invitation_date || ""}
                          onChange={(e) =>
                            setProcessing({ ...processing, accepted_first_invitation_date: e.target.value || null })
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="accepted_subject">Subject</Label>
                        <Input
                          id="accepted_subject"
                          value={processing.accepted_subject || ""}
                          onChange={(e) =>
                            setProcessing({ ...processing, accepted_subject: e.target.value || null })
                          }
                          maxLength={255}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={handleProcess} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Processing Information
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Accept Dialog */}
      <AlertDialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accept Application</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to accept this application? This action will update the application status to ACCEPTED.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Accept
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Application</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide the reasons for rejection. This action will update the application status to REJECTED.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="reject_reasons">Rejection Reasons *</Label>
              <Textarea
                id="reject_reasons"
                value={rejectReasons}
                onChange={(e) => setRejectReasons(e.target.value)}
                placeholder="Enter the reasons for rejection..."
                rows={4}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReasons("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReject} disabled={saving || !rejectReasons.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Viewer Dialog */}
      <Dialog open={!!selectedDocument} onOpenChange={handleCloseDocument}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>{selectedDocument?.name}</DialogTitle>
                <DialogDescription>{selectedDocument?.type}</DialogDescription>
              </div>
              <div className="flex gap-2">
                {documentUrl && (
                  <Button variant="outline" size="sm" onClick={handleDownloadDocument}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={handleCloseDocument}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 p-4">
            {loadingDocument ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-sm text-muted-foreground">Loading document...</p>
              </div>
            ) : documentUrl && selectedDocument ? (
              <>
                {selectedDocument.mime_type && isImage(selectedDocument.mime_type) ? (
                  <img
                    src={documentUrl}
                    alt={selectedDocument.name}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg"
                  />
                ) : selectedDocument.mime_type && isPdf(selectedDocument.mime_type) ? (
                  <div className="w-full h-[70vh] rounded-lg border overflow-hidden">
                    <embed
                      src={documentUrl}
                      type="application/pdf"
                      className="w-full h-full"
                      title={selectedDocument.name}
                    />
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Preview not available for this file type
                    </p>
                    <Button variant="outline" onClick={handleDownloadDocument}>
                      <Download className="h-4 w-4 mr-2" />
                      Download to view
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Failed to load document</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
