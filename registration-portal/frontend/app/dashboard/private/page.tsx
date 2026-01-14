"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getDraftRegistration, listMyRegistrations, downloadMyIndexSlip, listRegistrationInvoices, downloadInvoicePdf } from "@/lib/api";
import type { User, RegistrationCandidate, Invoice } from "@/types";
import { toast } from "sonner";
import { GraduationCap, FileText, Plus, Clock, CheckCircle, XCircle, Edit, Download, Receipt, Loader2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function PrivateCandidateDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [draftRegistration, setDraftRegistration] = useState<RegistrationCandidate | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Record<number, Invoice[]>>({});
  const [loadingInvoices, setLoadingInvoices] = useState<Record<number, boolean>>({});

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
        const completedRegs = regs.filter((r) => r.registration_status !== "DRAFT");
        setRegistrations(completedRegs);

        // Automatically load invoices for registrations that likely have payments
        // We'll check if registration has total_paid_amount > 0 by trying to load invoices
        // (The backend will return empty array if no invoices exist)
        for (const reg of completedRegs) {
          // Load invoices in background
          loadInvoices(reg.id).catch((err) => {
            console.error(`Failed to load invoices for registration ${reg.id}:`, err);
          });
        }
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

  const handleViewRegistration = (registration: RegistrationCandidate) => {
    // Navigate directly to register page with registration_id parameter
    // The register page will handle checking if period ended and loading in appropriate mode
    router.push(`/dashboard/private/register?registration_id=${registration.id}`);
  };

  // Check if index slip is available
  const isIndexSlipAvailable = (registration: RegistrationCandidate): boolean => {
    // Available if index_number exists
    if (registration.index_number) {
      return true;
    }

    // Or if registration period has ended
    if (registration.exam?.registration_period) {
      const period = registration.exam.registration_period;
      const now = new Date();
      const endDate = new Date(period.registration_end_date);
      return endDate < now;
    }

    return false;
  };

  const handleDownloadIndexSlip = async (registration: RegistrationCandidate) => {
    if (!isIndexSlipAvailable(registration)) {
      toast.error("Index slip is not yet available. Index numbers will be generated after the registration period ends.");
      return;
    }

    try {
      const blob = await downloadMyIndexSlip(registration.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = registration.index_number
        ? `index_slip_${registration.index_number}_${registration.exam?.year || "unknown"}.pdf`
        : `index_slip_${registration.registration_number}_${registration.exam?.year || "unknown"}.pdf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Index Slip downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download Index Slip");
    }
  };

  const loadInvoices = async (registrationId: number) => {
    if (loadingInvoices[registrationId]) return;

    setLoadingInvoices((prev) => ({ ...prev, [registrationId]: true }));
    try {
      const invoiceList = await listRegistrationInvoices(registrationId);
      setInvoices((prev) => ({ ...prev, [registrationId]: invoiceList }));
    } catch (error) {
      console.error("Failed to load invoices:", error);
      toast.error("Failed to load invoices");
    } finally {
      setLoadingInvoices((prev) => ({ ...prev, [registrationId]: false }));
    }
  };

  const handleDownloadInvoice = async (invoice: Invoice) => {
    try {
      const blob = await downloadInvoicePdf(invoice.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${invoice.invoice_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Invoice downloaded successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download invoice");
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Paid
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="default" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            Pending
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="default" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
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
            <div className="space-y-6">
              {registrations.map((registration) => {
                const canEdit = canEditRegistration(registration);
                const indexSlipAvailable = isIndexSlipAvailable(registration);
                const registrationInvoices = invoices[registration.id] || [];
                const hasInvoices = registrationInvoices.length > 0;
                const isLoadingInvoices = loadingInvoices[registration.id] || false;

                return (
                  <div key={registration.id} className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="font-medium">
                          {registration.exam
                            ? `${registration.exam.exam_type}${registration.exam.exam_series ? ` (${registration.exam.exam_series} ${registration.exam.year})` : ` ${registration.exam.year}`}`
                            : "Exam"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Registration Number: {registration.registration_number}
                        </p>
                        <div className="mt-2">{getStatusBadge(registration.registration_status)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {indexSlipAvailable && (
                          <Button
                            variant="outline"
                            onClick={() => handleDownloadIndexSlip(registration)}
                            className="flex items-center gap-2"
                            title={registration.index_number ? "Download your index slip" : "Index slip will be available after index numbers are generated"}
                          >
                            <Download className="h-4 w-4" />
                            Download Index Slip
                          </Button>
                        )}
                        {canEdit ? (
                          <Button
                            variant="default"
                            onClick={() => handleViewRegistration(registration)}
                            className="flex items-center gap-2"
                          >
                            <Edit className="h-4 w-4" />
                            Edit Application
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            onClick={() => handleViewRegistration(registration)}
                            className="flex items-center gap-2"
                            title="View registration details (read-only mode)"
                          >
                            View Application
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Invoices Section - Only show if there are invoices or we're loading */}
                    {(hasInvoices || isLoadingInvoices) && (
                      <div className="ml-4 border-l-2 border-muted pl-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-muted-foreground" />
                            <h4 className="font-medium text-sm">Invoices</h4>
                          </div>
                          {isLoadingInvoices && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        {hasInvoices ? (
                          registrationInvoices.length > 0 ? (
                            <div className="space-y-2">
                              {registrationInvoices.map((invoice) => (
                                <div
                                  key={invoice.id}
                                  className="flex items-center justify-between rounded-md border p-3 bg-muted/30"
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{invoice.invoice_number}</span>
                                      {getInvoiceStatusBadge(invoice.status)}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Amount: {invoice.currency} {invoice.amount.toFixed(2)}
                                      {invoice.paid_at && (
                                        <span className="ml-2">• Paid on {new Date(invoice.paid_at).toLocaleDateString()}</span>
                                      )}
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownloadInvoice(invoice)}
                                    className="h-7 text-xs"
                                  >
                                    <Download className="h-3 w-3 mr-1" />
                                    Download
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No invoices found for this registration.</p>
                          )
                        ) : null}
                      </div>
                    )}
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
