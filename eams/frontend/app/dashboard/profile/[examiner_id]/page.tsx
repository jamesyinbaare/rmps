"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplicationStatusTracker } from "@/components/applications/ApplicationStatusTracker";
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
            } catch (error) {
              console.error("Error loading photo:", error);
              // Continue even if photo fails to load
            }
          }
        }
      } catch (e) {
        console.error(e);
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
        console.warn("No access token available for photo loading");
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
        const errorText = await response.text().catch(() => response.statusText);
        console.error(`Failed to load photo: ${response.status} ${response.statusText}`, errorText);
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
    } catch (error) {
      console.error("Failed to load photo:", error);
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
    return <div className="p-6">Loading…</div>;
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <p>You can only view your own profile.</p>
        <Link href="/dashboard/application">
          <Button variant="outline" className="mt-4">
            Back to application
          </Button>
        </Link>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">No submitted application found.</p>
        <Link href="/dashboard/application">
          <Button className="mt-4">Go to application</Button>
        </Link>
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/application">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Profile</h1>
          <p className="text-muted-foreground">Your examiner application profile</p>
        </div>
      </div>

      {/* Header: name, title, status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              {photoLoading ? (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted shrink-0">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : photoUrl ? (
                <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-primary bg-muted shrink-0">
                  <img
                    src={photoUrl}
                    alt={`${application.full_name} photo`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted shrink-0">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-semibold">{application.full_name}</h2>
                {application.title && (
                  <p className="text-muted-foreground">{application.title}</p>
                )}
              </div>
            </div>
            <Badge variant={getStatusBadgeVariant(application.status)} className="w-fit">
              {application.status}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <ApplicationStatusTracker status={application.status} />

      <Card>
        <CardHeader>
          <CardTitle>Personal particulars</CardTitle>
          <CardDescription>Contact and institutional information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Full name</p>
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
                <p className="text-sm font-medium text-muted-foreground">Date of birth</p>
                <p className="mt-1">{new Date(application.date_of_birth).toLocaleDateString()}</p>
              </div>
            )}
          </div>
          {(application.office_address || application.residential_address) && (
            <div className="space-y-2">
              {application.office_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Office address</p>
                  <p className="mt-1">{application.office_address}</p>
                </div>
              )}
              {application.residential_address && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Residential address</p>
                  <p className="mt-1">{application.residential_address}</p>
                </div>
              )}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {application.email_address && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="mt-1">{application.email_address}</p>
              </div>
            )}
            {application.telephone_office && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Telephone (office)</p>
                <p className="mt-1">{application.telephone_office}</p>
              </div>
            )}
            {application.telephone_cell && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Telephone (cell)</p>
                <p className="mt-1">{application.telephone_cell}</p>
              </div>
            )}
            {application.present_school_institution && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Present school</p>
                <p className="mt-1">{application.present_school_institution}</p>
              </div>
            )}
            {application.present_rank_position && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Present rank</p>
                <p className="mt-1">{application.present_rank_position}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject area</CardTitle>
        </CardHeader>
        <CardContent>
          {application.subject_area ? (
            <p className="whitespace-pre-wrap">{application.subject_area}</p>
          ) : (
            <p className="text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      {(application.additional_information || application.ceased_examining_explanation) && (
        <Card>
          <CardHeader>
            <CardTitle>Additional information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {application.additional_information && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Additional information</p>
                <p className="mt-1 whitespace-pre-wrap">{application.additional_information}</p>
              </div>
            )}
            {application.ceased_examining_explanation && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Ceased examining explanation
                </p>
                <p className="mt-1 whitespace-pre-wrap">{application.ceased_examining_explanation}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
          <CardDescription>Reference and timeline</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Application number</p>
            <p className="mt-1">{application.application_number}</p>
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
    </div>
  );
}
