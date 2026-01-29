"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getAdminApplication,
  processAdminApplication,
  acceptAdminApplication,
  rejectAdminApplication,
  getAdminDocumentDownloadUrl,
  getAccessToken,
} from "@/lib/api";
import type {
  ExaminerApplicationResponse,
  ExaminerApplicationDocumentResponse,
  ExaminerRecommendationResponse,
  Qualification,
  TeachingExperience,
  WorkExperience,
  ExaminingExperience,
  TrainingCourse,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Download,
  Check,
  X,
  Eye,
  User,
  GraduationCap,
  Briefcase,
  BookOpen,
  FileText,
} from "lucide-react";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  PHOTOGRAPH: "Photograph",
  CERTIFICATE: "Certificate",
  TRANSCRIPT: "Transcript",
};

// Human-readable labels for recommendation quality ratings (match examiner-recommendation form)
const QUALITY_RATING_LABELS: Record<string, string> = {
  knowledge_of_subject: "Knowledge of Subject",
  reliability: "Reliability",
  integrity: "Integrity",
  communication_skills: "Communication Skills",
  professionalism: "Professionalism",
  teaching_ability: "Teaching Ability",
  examination_experience: "Examination Experience",
  analytical_thinking: "Analytical Thinking",
};

function humanizeQualityKey(key: string): string {
  return (
    QUALITY_RATING_LABELS[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ")
  );
}

function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "DRAFT":
      return "secondary";
    case "SUBMITTED":
    case "UNDER_REVIEW":
    case "ACCEPTED":
      return "default";
    case "REJECTED":
      return "destructive";
    default:
      return "outline";
  }
}

function Field({
  label,
  value,
  stripIndex,
}: {
  label: string;
  value: string | number | null | undefined;
  stripIndex?: number;
}) {
  const v = value == null || value === "" ? "—" : String(value);
  const row = (
    <div className="grid grid-cols-[minmax(0,8rem)_1fr] gap-2 text-sm">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span>{v}</span>
    </div>
  );
  if (stripIndex !== undefined) {
    return (
      <div
        className={`rounded px-2 py-1.5 ${stripIndex % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
      >
        {row}
      </div>
    );
  }
  return row;
}

function RecommendationDetail({
  recommendation,
  status,
}: {
  recommendation: ExaminerRecommendationResponse | null | undefined;
  status: { completed: boolean; recommender_name: string | null } | null | undefined;
}) {
  if (recommendation) {
    const completedAt = recommendation.completed_at
      ? new Date(recommendation.completed_at).toLocaleString()
      : null;
    const qualityRatings = recommendation.quality_ratings
      ? Object.entries(recommendation.quality_ratings)
      : [];
    const decision =
      recommendation.recommendation_decision === true
        ? "Recommend"
        : recommendation.recommendation_decision === false
          ? "Do not recommend"
          : null;
    return (
      <div className="space-y-4 text-sm">
        {decision && (
          <div className="flex items-center gap-2">
            <Badge
              variant={recommendation.recommendation_decision === true ? "default" : "destructive"}
            >
              {decision}
            </Badge>
          </div>
        )}
        <Field label="Completed" value="Yes" stripIndex={0} />
        <Field label="Completed at" value={completedAt} stripIndex={1} />
        <Field label="Recommender" value={recommendation.recommender_name} stripIndex={2} />
        <Field label="Recommender status" value={recommendation.recommender_status} stripIndex={3} />
        <Field label="Office address" value={recommendation.recommender_office_address} stripIndex={4} />
        <Field label="Phone" value={recommendation.recommender_phone} stripIndex={5} />
        <Field label="Decision" value={decision} stripIndex={6} />
        <Field label="Recommender date" value={recommendation.recommender_date ?? undefined} stripIndex={7} />
        <Field label="Signature" value={recommendation.recommender_signature} stripIndex={8} />
        {qualityRatings.length > 0 && (
          <div>
            <p className="mb-2 font-medium text-muted-foreground">Quality ratings (1–6)</p>
            <ul className="space-y-0 rounded border">
              {qualityRatings.map(([key, rating], i) => (
                <li
                  key={key}
                  className={`flex justify-between gap-4 px-3 py-2 ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                >
                  <span>{humanizeQualityKey(key)}</span>
                  <span>{rating}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (status) {
    return (
      <div className="space-y-0 text-sm">
        <Field label="Completed" value={status.completed ? "Yes" : "No"} stripIndex={0} />
        {status.recommender_name && (
          <Field label="Recommender" value={status.recommender_name} stripIndex={1} />
        )}
      </div>
    );
  }
  return null;
}

export default function AdminApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [application, setApplication] = useState<ExaminerApplicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReasons, setRejectReasons] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{
    url: string;
    mimeType: string;
    fileName: string;
  } | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  const load = () => {
    setLoading(true);
    getAdminApplication(id)
      .then(setApplication)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load application");
        router.replace("/dashboard/admin/applications");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id, router]);

  // Load applicant photo (PHOTOGRAPH document) for the photo card
  useEffect(() => {
    if (!application?.documents) {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
      }
      setPhotoUrl(null);
      return;
    }
    const photoDoc = application.documents.find((d) => d.document_type === "PHOTOGRAPH");
    if (!photoDoc) {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
      }
      setPhotoUrl(null);
      return;
    }
    const token = getAccessToken();
    const url = getAdminDocumentDownloadUrl(application.id, photoDoc.id);
    let cancelled = false;
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(res.statusText))))
      .then((blob) => {
        if (cancelled) return;
        if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        photoUrlRef.current = objectUrl;
        setPhotoUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setPhotoUrl(null);
      });

    return () => {
      cancelled = true;
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
        photoUrlRef.current = null;
      }
      setPhotoUrl(null);
    };
  }, [application?.id, application?.documents]);

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await processAdminApplication(id);
      toast.success("Marked as processed");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const updated = await acceptAdminApplication(id);
      setApplication(updated);
      toast.success("Application accepted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectReasons.trim()) {
      toast.error("Please provide rejection reasons");
      return;
    }
    setRejecting(true);
    try {
      const updated = await rejectAdminApplication(id, rejectReasons);
      setApplication(updated);
      setShowRejectForm(false);
      setRejectReasons("");
      toast.success("Application rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setRejecting(false);
    }
  };

  const fetchDocumentBlob = useCallback(
    async (doc: ExaminerApplicationDocumentResponse) => {
      const token = getAccessToken();
      const url = getAdminDocumentDownloadUrl(application!.id, doc.id);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      return res.blob();
    },
    [application?.id]
  );

  const handleDownloadDocument = async (
    applicationId: string,
    documentId: string,
    fileName: string
  ) => {
    try {
      const token = getAccessToken();
      const url = getAdminDocumentDownloadUrl(applicationId, documentId);
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName || "document";
      a.click();
      URL.revokeObjectURL(objectUrl);
      toast.success("Download started");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  const handlePreviewDocument = async (doc: ExaminerApplicationDocumentResponse) => {
    try {
      const blob = await fetchDocumentBlob(doc);
      const url = URL.createObjectURL(blob);
      const mime = doc.mime_type || "application/octet-stream";
      const canPreview =
        mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/");
      if (canPreview) {
        setPreviewState({ url, mimeType: mime, fileName: doc.file_name });
      } else {
        toast.info("Preview not available for this file type. Use Download instead.");
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    }
  };

  const closePreview = () => {
    if (previewState) {
      URL.revokeObjectURL(previewState.url);
      setPreviewState(null);
    }
  };

  if (loading || !application) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canAccept = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";
  const canReject = application.status === "SUBMITTED" || application.status === "UNDER_REVIEW";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/admin/applications">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{application.application_number}</h1>
            <Badge variant={getStatusBadgeVariant(application.status)}>{application.status}</Badge>
          </div>
          <p className="text-muted-foreground">{application.full_name}</p>
        </div>
      </div>

      {/* Sticky action bar — Mark as processed, Accept, Reject; aligned right */}
      {(canAccept || canReject) && (
        <div className="sticky top-0 z-40 -mx-2 flex flex-wrap items-center justify-end gap-2 rounded-md border bg-background/95 px-2 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/60 md:-mx-0 md:px-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleProcess}
            disabled={processing}
          >
            {processing ? "Processing..." : "Mark as processed"}
          </Button>
          {canAccept && (
            <Button size="sm" onClick={handleAccept} disabled={accepting}>
              <Check className="mr-2 h-4 w-4" />
              {accepting ? "Accepting..." : "Accept"}
            </Button>
          )}
          {canReject && !showRejectForm && (
            <Button variant="destructive" size="sm" onClick={() => setShowRejectForm(true)}>
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
          )}
        </div>
      )}

      {/* Photo and reject form — side-by-side on md+ when reject form is open */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <Card className="w-fit shrink-0">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Passport photo
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {photoUrl ? (
              <div className="relative aspect-[3/4] w-48 overflow-hidden rounded-md border bg-muted">
                <img
                  src={photoUrl}
                  alt="Applicant"
                  className="h-full w-full object-cover object-top"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photograph uploaded.</p>
            )}
          </CardContent>
        </Card>

        {showRejectForm && (
          <Card>
            <CardHeader>
              <CardTitle>Reject application</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleReject} className="space-y-2">
                <Label htmlFor="reject-reasons">Rejection reasons (required)</Label>
                <Textarea
                  id="reject-reasons"
                  value={rejectReasons}
                  onChange={(e) => setRejectReasons(e.target.value)}
                  placeholder="Enter reasons for rejection..."
                  rows={4}
                  required
                />
                <div className="flex gap-2">
                  <Button type="submit" variant="destructive" disabled={rejecting} size="sm">
                    {rejecting ? "Rejecting..." : "Confirm reject"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowRejectForm(false);
                      setRejectReasons("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Application details in tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="experience">Experience</TabsTrigger>
          <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <Field label="Full name" value={application.full_name} stripIndex={0} />
              <Field label="Title" value={application.title} stripIndex={1} />
              <Field label="Nationality" value={application.nationality} stripIndex={2} />
              <Field
                label="Date of birth"
                value={
                  application.date_of_birth
                    ? new Date(application.date_of_birth).toLocaleDateString()
                    : null
                }
                stripIndex={3}
              />
              <Field label="Email" value={application.email_address} stripIndex={4} />
              <Field label="Telephone (office)" value={application.telephone_office} stripIndex={5} />
              <Field label="Telephone (cell)" value={application.telephone_cell} stripIndex={6} />
              <Field label="Office address" value={application.office_address} stripIndex={7} />
              <Field label="Residential address" value={application.residential_address} stripIndex={8} />
              <Field label="Subject area" value={application.subject_area} stripIndex={9} />
              <Field
                label="Subject"
                value={
                  application.subject
                    ? `${application.subject.code} – ${application.subject.name}`
                    : application.subject_id
                }
                stripIndex={10}
              />
              <Field label="Present institution" value={application.present_school_institution} stripIndex={11} />
              <Field label="Present rank / position" value={application.present_rank_position} stripIndex={12} />
              <Field
                label="Submitted"
                value={
                  application.submitted_at
                    ? new Date(application.submitted_at).toLocaleString()
                    : null
                }
                stripIndex={13}
              />
            </CardContent>
          </Card>

          {(application.additional_information || application.ceased_examining_explanation) && (
            <Card>
              <CardHeader>
                <CardTitle>Additional information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {application.additional_information && (
                  <div>
                    <p className="font-medium text-muted-foreground">Additional information</p>
                    <p className="mt-1 whitespace-pre-wrap">{application.additional_information}</p>
                  </div>
                )}
                {application.ceased_examining_explanation && (
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Ceased examining explanation
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">
                      {application.ceased_examining_explanation}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="experience" className="mt-4 space-y-6">
          {application.qualifications && application.qualifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Qualifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {application.qualifications.map((q: Qualification, i: number) => (
                    <li
                      key={i}
                      className={`rounded border p-3 text-sm ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                    >
                      <Field label="Institution" value={q.university_college} />
                      <Field label="Degree type" value={q.degree_type} />
                      <Field label="Programme" value={q.programme} />
                      <Field label="Class of degree" value={q.class_of_degree} />
                      <Field label="Major subjects" value={q.major_subjects} />
                      <Field
                        label="Date of award"
                        value={q.date_of_award ? new Date(q.date_of_award).toLocaleDateString() : null}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {application.teaching_experiences && application.teaching_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Teaching experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {application.teaching_experiences.map((t: TeachingExperience, i: number) => (
                    <li
                      key={i}
                      className={`rounded border p-3 text-sm ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                    >
                      <Field label="Institution" value={t.institution_name} />
                      <Field label="Subject" value={t.subject} />
                      <Field label="Level" value={t.level} />
                      <Field
                        label="From"
                        value={t.date_from ? new Date(t.date_from).toLocaleDateString() : null}
                      />
                      <Field
                        label="To"
                        value={t.date_to ? new Date(t.date_to).toLocaleDateString() : null}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {application.work_experiences && application.work_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Work experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {application.work_experiences.map((w: WorkExperience, i: number) => (
                    <li
                      key={i}
                      className={`rounded border p-3 text-sm ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                    >
                      <Field label="Occupation" value={w.occupation} />
                      <Field label="Employer" value={w.employer_name} />
                      <Field label="Position" value={w.position_held} />
                      <Field
                        label="From"
                        value={w.date_from ? new Date(w.date_from).toLocaleDateString() : null}
                      />
                      <Field
                        label="To"
                        value={w.date_to ? new Date(w.date_to).toLocaleDateString() : null}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {application.examining_experiences && application.examining_experiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Examining experience
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-4">
                  {application.examining_experiences.map((e: ExaminingExperience, i: number) => (
                    <li key={i} className="rounded border p-3 text-sm">
                      <Field label="Examination body" value={e.examination_body} />
                      <Field label="Subject" value={e.subject} />
                      <Field label="Level" value={e.level} />
                      <Field label="Status" value={e.status} />
                      <Field
                        label="From"
                        value={e.date_from ? new Date(e.date_from).toLocaleDateString() : null}
                      />
                      <Field
                        label="To"
                        value={e.date_to ? new Date(e.date_to).toLocaleDateString() : null}
                      />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {application.training_courses && application.training_courses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Training courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {application.training_courses.map((t: TrainingCourse, i: number) => (
                    <li
                      key={i}
                      className={`rounded border p-3 text-sm ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                    >
                      <Field label="Organizer" value={t.organizer} />
                      <Field label="Course name" value={t.course_name} />
                      <Field label="Place" value={t.place} />
                      <Field
                        label="From"
                        value={t.date_from ? new Date(t.date_from).toLocaleDateString() : null}
                      />
                      <Field
                        label="To"
                        value={t.date_to ? new Date(t.date_to).toLocaleDateString() : null}
                      />
                      <Field label="Reason for participation" value={t.reason_for_participation} />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recommendation" className="mt-4 space-y-6">
          {(application.recommendation_status || application.recommendation) && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                <RecommendationDetail recommendation={application.recommendation} status={application.recommendation_status} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-6">
          {application.documents && application.documents.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {application.documents.map((doc, i) => (
                    <li
                      key={doc.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 ${i % 2 === 0 ? "bg-muted/50" : "bg-transparent"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="shrink-0">
                          {DOCUMENT_TYPE_LABELS[doc.document_type] ?? doc.document_type}
                        </Badge>
                        <span className="text-sm font-medium">{doc.file_name}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreviewDocument(doc)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleDownloadDocument(application.id, doc.id, doc.file_name)
                          }
                        >
                          <Download className="mr-1 h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No documents uploaded.</p>
          )}
        </TabsContent>
      </Tabs>

      {/* Preview modal */}
      {previewState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={closePreview}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="truncate text-sm font-medium">{previewState.fileName}</span>
              <Button variant="ghost" size="sm" onClick={closePreview}>
                Close
              </Button>
            </div>
            <div className="flex max-h-[calc(90vh-3rem)] items-center justify-center overflow-auto p-4">
              {previewState.mimeType.startsWith("image/") ? (
                <img
                  src={previewState.url}
                  alt={previewState.fileName}
                  className="max-h-full max-w-full object-contain"
                />
              ) : previewState.mimeType === "application/pdf" ? (
                <iframe
                  src={previewState.url}
                  title={previewState.fileName}
                  className="h-[80vh] w-full min-w-[400px] rounded border"
                />
              ) : previewState.mimeType.startsWith("text/") ? (
                <iframe
                  src={previewState.url}
                  title={previewState.fileName}
                  className="h-[80vh] w-full min-w-[400px] rounded border"
                />
              ) : (
                <p className="text-muted-foreground">Preview not available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
