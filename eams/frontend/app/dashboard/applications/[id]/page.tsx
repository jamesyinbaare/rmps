"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplicationForm } from "@/components/applications/ApplicationForm";
import { DocumentUpload } from "@/components/applications/DocumentUpload";
import { RecommendationRequest } from "@/components/applications/RecommendationRequest";
import { ApplicationStatusTracker } from "@/components/applications/ApplicationStatusTracker";
import { getApplication, updateApplication, submitApplication } from "@/lib/api";
import type { ExaminerApplicationResponse, ExaminerApplicationUpdate } from "@/types";
import { toast } from "sonner";
import { ArrowLeft, Save, Send } from "lucide-react";
import Link from "next/link";

export default function ApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = params.id as string;
  const [application, setApplication] = useState<ExaminerApplicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const loadApplication = async () => {
      try {
        const app = await getApplication(applicationId);
        setApplication(app);
        setIsEditing(app.status === "DRAFT");
      } catch (error) {
        toast.error("Failed to load application");
        router.push("/dashboard/applications");
      } finally {
        setLoading(false);
      }
    };

    if (applicationId) {
      loadApplication();
    }
  }, [applicationId, router]);

  const handleUpdate = async (data: ExaminerApplicationUpdate) => {
    if (!application) return;
    setSaving(true);
    try {
      const updated = await updateApplication(application.id, data);
      setApplication(updated);
      toast.success("Application updated successfully");
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update application");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!application) return;
    setSubmitting(true);
    try {
      await submitApplication(application.id);
      toast.success("Application submitted successfully");
      // Reload application to get updated status
      const updated = await getApplication(application.id);
      setApplication(updated);
      setIsEditing(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit application";
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!application) {
    return <div>Application not found</div>;
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "DRAFT":
        return "secondary";
      case "SUBMITTED":
        return "default";
      case "UNDER_REVIEW":
        return "default";
      case "ACCEPTED":
        return "default";
      case "REJECTED":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/applications">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{application.application_number}</h1>
              <Badge variant={getStatusBadgeVariant(application.status)}>
                {application.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">Application Details</p>
          </div>
        </div>
        {application.status === "DRAFT" && !isEditing && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Save className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Submitting..." : "Submit Application"}
            </Button>
          </div>
        )}
      </div>

      {isEditing && application.status === "DRAFT" ? (
        <ApplicationForm
          initialData={application}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
          submitLabel="Save Changes"
          loading={saving}
        />
      ) : (
        <div className="space-y-6">
          <ApplicationStatusTracker status={application.status} />

          <Card>
            <CardHeader>
              <CardTitle>Personal Particulars</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                  <p className="mt-1">{application.full_name}</p>
                </div>
                {application.title && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Title</p>
                    <p className="mt-1">{application.title}</p>
                  </div>
                )}
                {application.nationality && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Nationality</p>
                    <p className="mt-1">{application.nationality}</p>
                  </div>
                )}
                {application.date_of_birth && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                    <p className="mt-1">{new Date(application.date_of_birth).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              {application.office_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Office Address</p>
                  <p className="mt-1">{application.office_address}</p>
                </div>
              )}
              {application.residential_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Residential Address</p>
                  <p className="mt-1">{application.residential_address}</p>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {application.email_address && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Email Address</p>
                    <p className="mt-1">{application.email_address}</p>
                  </div>
                )}
                {application.telephone_office && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Telephone (Office)</p>
                    <p className="mt-1">{application.telephone_office}</p>
                  </div>
                )}
                {application.telephone_cell && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Telephone (Cell)</p>
                    <p className="mt-1">{application.telephone_cell}</p>
                  </div>
                )}
                {application.present_school_institution && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Present School/Institution</p>
                    <p className="mt-1">{application.present_school_institution}</p>
                  </div>
                )}
                {application.present_rank_position && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Present Rank/Position</p>
                    <p className="mt-1">{application.present_rank_position}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subject Area & Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {application.subject_area && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Subject Area</p>
                  <p className="mt-1 whitespace-pre-wrap">{application.subject_area}</p>
                </div>
              )}
              {application.additional_information && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Additional Information</p>
                  <p className="mt-1 whitespace-pre-wrap">{application.additional_information}</p>
                </div>
              )}
              {application.ceased_examining_explanation && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Ceased Examining Explanation
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{application.ceased_examining_explanation}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Application Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Application Number</p>
                <p className="mt-1">{application.application_number}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={getStatusBadgeVariant(application.status)} className="mt-1">
                  {application.status}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Created</p>
                <p className="mt-1">{new Date(application.created_at).toLocaleString()}</p>
              </div>
              {application.submitted_at && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                  <p className="mt-1">{new Date(application.submitted_at).toLocaleString()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document Upload - Only for DRAFT applications */}
          {application.status === "DRAFT" && (
            <DocumentUpload
              applicationId={application.id}
              onUploadSuccess={() => {
                // Optionally reload application to show uploaded documents
                getApplication(application.id).then(setApplication).catch(console.error);
              }}
            />
          )}

          {/* Recommendation Request - Only for SUBMITTED applications */}
          {application.status === "SUBMITTED" && (
            <RecommendationRequest
              applicationId={application.id}
              applicationNumber={application.application_number}
              applicantName={application.full_name}
            />
          )}
        </div>
      )}
    </div>
  );
}
