"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplicationStatusTracker } from "@/components/applications/ApplicationStatusTracker";
import { RecommendationRequest } from "@/components/applications/RecommendationRequest";
import { getCurrentUser, getApplications, getApplication, getAccessToken } from "@/lib/api";
import type { ExaminerApplicationResponse } from "@/types";
import { toast } from "sonner";
import { User, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ExaminerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const examinerId = params.examiner_id as string;
  const [application, setApplication] = useState<ExaminerApplicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const [me, apps] = await Promise.all([getCurrentUser(), getApplications()]);
        if (me.examiner_id !== examinerId) {
          setForbidden(true);
          return;
        }
        const submitted = apps.find(
          (a) =>
            (a.status === "SUBMITTED" ||
              a.status === "UNDER_REVIEW" ||
              a.status === "ACCEPTED") &&
            a.examiner_id === examinerId
        );
        if (submitted) {
          const app = await getApplication(submitted.id);
          setApplication(app);

          // Load photo if available
          const photo = app.documents?.find((d) => d.document_type === "PHOTOGRAPH");
          if (photo && photo.id) {
            try {
              await loadPhoto(app.id, photo.id);
            } catch {
              // Continue even if photo fails to load
            }
          }
        }
      } catch {
        toast.error("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [examinerId]);

  const loadPhoto = async (applicationId: string, documentId: string) => {
    setPhotoLoading(true);
    try {
      const token = getAccessToken();
      if (!token) {
        return;
      }

      const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002";
      const url = `${API_BASE_URL}/api/v1/examiner/applications/${applicationId}/documents/${documentId}/download`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load photo: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      // Revoke old URL if it exists
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
      }

      const blobUrl = URL.createObjectURL(blob);
      photoUrlRef.current = blobUrl;
      setPhotoUrl(blobUrl);
    } catch {
      setPhotoUrl(null);
      // Don't show error toast as it's not critical - just show placeholder
    } finally {
      setPhotoLoading(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (photoUrlRef.current) {
        URL.revokeObjectURL(photoUrlRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 rounded-md bg-muted animate-pulse" />
          <div className="space-y-1">
            <div className="h-8 w-48 rounded bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="h-16 w-16 shrink-0 rounded-full bg-muted animate-pulse md:h-24 md:w-24" />
            <div className="space-y-2">
              <div className="h-6 w-40 rounded bg-muted animate-pulse" />
              <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-6 w-20 rounded-full bg-muted animate-pulse" />
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 md:p-6">
          <div className="space-y-3 md:space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <div className="h-4 w-20 rounded bg-muted animate-pulse" />
                <div className="h-5 w-32 rounded bg-muted animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="h-4 w-16 rounded bg-muted animate-pulse" />
                <div className="h-5 w-28 rounded bg-muted animate-pulse" />
              </div>
            </div>
            <div className="h-4 w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="mx-auto max-w-md">
          <CardContent className="p-6">
            <p className="text-muted-foreground">You can only view your own profile.</p>
            <Link href="/application" className="mt-4 block">
              <Button variant="outline" className="w-full min-h-11 sm:w-auto">
                Back to application
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="mx-auto max-w-md">
          <CardContent className="p-6">
            <p className="text-muted-foreground">No submitted application found.</p>
            <Link href="/application" className="mt-4 block">
              <Button className="w-full min-h-11 sm:w-auto">Go to application</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusBadgeVariant = (status: string) => {
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
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 md:space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/application" className="shrink-0">
          <Button variant="ghost" size="icon" className="min-h-11 min-w-11 sm:min-w-[unset] sm:gap-2 sm:px-3">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">Profile</h1>
          <p className="text-sm text-muted-foreground md:text-base">Your examiner application profile</p>
        </div>
      </div>

      {/* Header: name, title, status */}
      <Card>
        <CardContent className="p-4 pt-6 md:p-6">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {photoLoading ? (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted md:h-20 md:w-20 lg:h-24 lg:w-24">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : photoUrl ? (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-primary bg-muted md:h-20 md:w-20 lg:h-24 lg:w-24">
                <img
                  src={photoUrl}
                  alt={`${application.full_name} photo`}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted md:h-20 md:w-20 lg:h-24 lg:w-24">
                <User className="h-8 w-8 text-muted-foreground md:h-9 md:w-9 lg:h-10 lg:w-10" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="wrap-break-word text-xl font-semibold md:text-2xl">{application.full_name}</h2>
              {application.title && (
                <p className="wrap-break-word text-muted-foreground">{application.title}</p>
              )}
            </div>
            <Badge variant={getStatusBadgeVariant(application.status)} className="w-fit shrink-0">
              {application.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ApplicationStatusTracker status={application.status} />

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-2xl">Personal particulars</CardTitle>
          <CardDescription>Contact and institutional information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0 md:space-y-4 md:p-6 md:pt-0">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Full name</p>
              <p className="mt-1 wrap-break-word">{application.full_name}</p>
            </div>
            {application.title && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Title</p>
                <p className="mt-1 wrap-break-word">{application.title}</p>
              </div>
            )}
            {application.nationality && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Nationality</p>
                <p className="mt-1 wrap-break-word">{application.nationality}</p>
              </div>
            )}
            {application.date_of_birth && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date of birth</p>
                <p className="mt-1">{new Date(application.date_of_birth).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {(application.office_address || application.residential_address) && (
            <div className="space-y-3 md:space-y-4">
              {application.office_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Office address</p>
                  <p className="mt-1 wrap-break-word">{application.office_address}</p>
                </div>
              )}
              {application.residential_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Residential address</p>
                  <p className="mt-1 wrap-break-word">{application.residential_address}</p>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {application.email_address && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="mt-1 wrap-break-word">{application.email_address}</p>
              </div>
            )}
            {application.telephone_office && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Telephone (office)</p>
                <p className="mt-1 wrap-break-word">{application.telephone_office}</p>
              </div>
            )}
            {application.telephone_cell && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Telephone (cell)</p>
                <p className="mt-1 wrap-break-word">{application.telephone_cell}</p>
              </div>
            )}
            {application.present_school_institution && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Present school</p>
                <p className="mt-1 wrap-break-word">{application.present_school_institution}</p>
              </div>
            )}
            {application.present_rank_position && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Present rank</p>
                <p className="mt-1 wrap-break-word">{application.present_rank_position}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-2xl">Subject</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
          {application.subject?.name ? (
            <p className="wrap-break-word">{application.subject.name}</p>
          ) : application.subject_area ? (
            <p className="whitespace-pre-wrap wrap-break-word">{application.subject_area}</p>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      {(application.additional_information || application.ceased_examining_explanation) && (
        <Card>
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-lg md:text-2xl">Additional information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 md:space-y-4 md:p-6 md:pt-0">
            {application.additional_information && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Additional information</p>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word">{application.additional_information}</p>
              </div>
            )}
            {application.ceased_examining_explanation && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Ceased examining explanation
                </p>
                <p className="mt-1 whitespace-pre-wrap wrap-break-word">{application.ceased_examining_explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-2xl">Application</CardTitle>
          <CardDescription>Reference and timeline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 p-4 pt-0 md:p-6 md:pt-0">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Application number</p>
            <p className="mt-1 wrap-break-word">{application.application_number}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Submitted</p>
            <p className="mt-1">
              {application.submitted_at
                ? new Date(application.submitted_at).toLocaleString()
                : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recommendation Request - For submitted applications (SUBMITTED, UNDER_REVIEW, ACCEPTED) */}
      {(application.status === "SUBMITTED" ||
        application.status === "UNDER_REVIEW" ||
        application.status === "ACCEPTED") && (
        <RecommendationRequest
          applicationId={application.id}
          applicationNumber={application.application_number}
          applicantName={application.full_name}
          recommendationStatus={application.recommendation_status}
        />
      )}
    </div>
  );
}
