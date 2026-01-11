"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getDraftRegistration, listMyRegistrations, enableEditRegistration } from "@/lib/api";
import type { User, RegistrationCandidate } from "@/types";
import { toast } from "sonner";
import { GraduationCap, FileText, Plus, Clock, CheckCircle, XCircle, Edit } from "lucide-react";
import Link from "next/link";

export default function PrivateCandidateDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [draftRegistration, setDraftRegistration] = useState<RegistrationCandidate | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await getCurrentUser();
      setUser(userData);

      // Load draft registration
      try {
        const draft = await getDraftRegistration();
        setDraftRegistration(draft);
      } catch (error) {
        // No draft exists, that's okay
        setDraftRegistration(null);
      }

      // Load completed registrations
      try {
        const regs = await listMyRegistrations();
        setRegistrations(regs.filter((r) => r.registration_status !== "DRAFT"));
      } catch (error) {
        console.error("Failed to load registrations:", error);
      }
    } catch (error) {
      toast.error("Failed to load dashboard data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Clock className="mr-1 h-3 w-3" />
            Draft
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="mr-1 h-3 w-3" />
            Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  // Check if a registration can be edited (deadline hasn't passed)
  const canEditRegistration = (registration: RegistrationCandidate): boolean => {
    // Only PENDING or APPROVED registrations can be edited
    if (registration.registration_status !== "PENDING" && registration.registration_status !== "APPROVED") {
      return false;
    }

    // Check if registration period is still open
    if (!registration.exam?.registration_period) {
      return false;
    }

    const period = registration.exam.registration_period;
    const now = new Date();
    const endDate = new Date(period.registration_end_date);

    // Can edit if period is active and deadline hasn't passed
    return period.is_active && period.allows_private_registration && endDate >= now;
  };

  const handleEditRegistration = async (registration: RegistrationCandidate) => {
    try {
      await enableEditRegistration(registration.id);
      toast.success("Registration unlocked for editing");
      // Redirect to registration page with the registration ID
      router.push(`/dashboard/private/register?registration_id=${registration.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to enable editing");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Registrations</h1>
        <p className="text-muted-foreground">Welcome back, {user?.full_name || "Candidate"}</p>
      </div>

      {/* Draft Registration Card */}
      {draftRegistration ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Continue Registration
            </CardTitle>
            <CardDescription>
              You have an incomplete registration. Continue where you left off.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {draftRegistration.exam
                    ? `${draftRegistration.exam.exam_type} (${draftRegistration.exam.exam_series} ${draftRegistration.exam.year})`
                    : "Exam"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Registration Number: {draftRegistration.registration_number}
                </p>
                {getStatusBadge(draftRegistration.registration_status)}
              </div>
              <Link href={`/dashboard/private/register?exam_id=${draftRegistration.registration_exam_id}`}>
                <Button>Continue Registration</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Start New Registration
            </CardTitle>
            <CardDescription>Begin a new examination registration</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/private/register">
              <Button>Start Registration</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Completed Registrations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            My Registrations
          </CardTitle>
          <CardDescription>View your examination registrations</CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-muted-foreground">No registrations yet. Start a new registration to get started.</p>
          ) : (
            <div className="space-y-4">
              {registrations.map((registration) => {
                const canEdit = canEditRegistration(registration);
                return (
                  <div
                    key={registration.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                  <div>
                    <p className="font-medium">
                      {registration.exam
                        ? `${registration.exam.exam_type} (${registration.exam.exam_series} ${registration.exam.year})`
                        : "Exam"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Registration Number: {registration.registration_number}
                    </p>
                    <div className="mt-2">{getStatusBadge(registration.registration_status)}</div>
                  </div>
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <Button
                          variant="default"
                          onClick={() => handleEditRegistration(registration)}
                          className="flex items-center gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit Application
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          disabled
                          className="flex items-center gap-2"
                          title="Registration period has ended. Applications can no longer be edited."
                        >
                          View Application
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
