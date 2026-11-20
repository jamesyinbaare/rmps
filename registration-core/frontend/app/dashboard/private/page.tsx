"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getDraftRegistration, listMyRegistrations, downloadMyIndexSlip, listRegistrationInvoices, downloadInvoicePdf } from "@/lib/api";
import type { RegistrationCandidate, Invoice } from "@/types";
import { toast } from "sonner";
import { GraduationCap, FileText, Plus, Clock, CheckCircle, XCircle, Edit, Download, Receipt, Loader2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SectionLabel } from "@/components/dashboard/SectionLabel";

export default function PrivateCandidateDashboard() {
  const router = useRouter();
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
      await getCurrentUser();

      try {
        const draft = await getDraftRegistration();
        setDraftRegistration(draft);
      } catch {
        setDraftRegistration(null);
      }

      try {
        const regs = await listMyRegistrations();
        const completedRegs = regs.filter((r) => r.registration_status !== "DRAFT");
        setRegistrations(completedRegs);

        for (const reg of completedRegs) {
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
          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-foreground">
            <Clock className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        );
      case "PENDING":
        return (
          <Badge variant="outline" className="border-primary/30 bg-accent text-accent-foreground">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            <CheckCircle className="mr-1 h-3 w-3" />
            Approved
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  const canEditRegistration = (registration: RegistrationCandidate): boolean => {
    if (registration.registration_status !== "PENDING" && registration.registration_status !== "APPROVED") {
      return false;
    }

    if (!registration.exam?.registration_period) {
      return false;
    }

    const period = registration.exam.registration_period;
    const now = new Date();
    const endDate = new Date(period.registration_end_date);

    return (
      registration.exam?.exam_kind === "private" &&
      period.is_active &&
      period.allows_private_registration &&
      endDate >= now
    );
  };

  const handleViewRegistration = (registration: RegistrationCandidate) => {
    router.push(`/dashboard/private/register?registration_id=${registration.id}`);
  };

  const isIndexSlipAvailable = (registration: RegistrationCandidate): boolean => {
    if (registration.index_number) {
      return true;
    }

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
          <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
            Paid
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="border-warning/40 bg-warning/15 text-foreground">
            Pending
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const draftExamTitle = draftRegistration?.exam
    ? `${draftRegistration.exam.exam_type} (${draftRegistration.exam.exam_series} ${draftRegistration.exam.year})`
    : "Exam";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="My registrations"
        subtitle="Continue a draft, start a new exam registration, or download slips and invoices."
        actions={
          draftRegistration ? (
            <Link href={`/dashboard/private/register?exam_id=${draftRegistration.registration_exam_id}`}>
              <Button>
                <FileText className="mr-2 h-4 w-4" />
                Continue registration
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard/private/register">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Start registration
              </Button>
            </Link>
          )
        }
      />

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel>
            {draftRegistration ? "Continue registration" : "Start registration"}
          </SectionLabel>
          {draftRegistration ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <p className="text-sm font-medium">{draftExamTitle}</p>
                <p className="text-sm text-muted-foreground">
                  Registration Number: {draftRegistration.registration_number}
                </p>
                {getStatusBadge(draftRegistration.registration_status)}
              </div>
              <Link href={`/dashboard/private/register?exam_id=${draftRegistration.registration_exam_id}`}>
                <Button variant="outline">Continue</Button>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No draft in progress. Use the button above to begin a new examination registration.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5 md:p-6">
          <SectionLabel>
            <span className="inline-flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              My registrations
            </span>
          </SectionLabel>

          {registrations.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No registrations yet. Start a new registration to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {registrations.map((registration) => {
                const canEdit = canEditRegistration(registration);
                const indexSlipAvailable = isIndexSlipAvailable(registration);
                const registrationInvoices = invoices[registration.id] || [];
                const hasInvoices = registrationInvoices.length > 0;
                const isLoadingInvoices = loadingInvoices[registration.id] || false;

                return (
                  <div key={registration.id} className="space-y-3">
                    <div className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {registration.exam
                            ? `${registration.exam.exam_type}${registration.exam.exam_series ? ` (${registration.exam.exam_series} ${registration.exam.year})` : ` ${registration.exam.year}`}`
                            : "Exam"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Registration Number: {registration.registration_number}
                        </p>
                        <div className="mt-2">{getStatusBadge(registration.registration_status)}</div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {indexSlipAvailable && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadIndexSlip(registration)}
                            className="flex items-center gap-2"
                            title={registration.index_number ? "Download your index slip" : "Index slip will be available after index numbers are generated"}
                          >
                            <Download className="h-4 w-4" />
                            Index slip
                          </Button>
                        )}
                        {canEdit ? (
                          <Button
                            size="sm"
                            onClick={() => handleViewRegistration(registration)}
                            className="flex items-center gap-2"
                          >
                            <Edit className="h-4 w-4" />
                            Edit
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewRegistration(registration)}
                            className="flex items-center gap-2"
                            title="View registration details (read-only mode)"
                          >
                            View
                          </Button>
                        )}
                      </div>
                    </div>

                    {(hasInvoices || isLoadingInvoices) && (
                      <div className="ml-3 space-y-2 border-l-2 border-border pl-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-muted-foreground" />
                            <h4 className="text-sm font-medium">Invoices</h4>
                          </div>
                          {isLoadingInvoices && (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        {hasInvoices ? (
                          <div className="space-y-2">
                            {registrationInvoices.map((invoice) => (
                              <div
                                key={invoice.id}
                                className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3"
                              >
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-medium">
                                      {invoice.invoice_number}
                                    </span>
                                    {getInvoiceStatusBadge(invoice.status)}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    Amount: {invoice.currency} {invoice.amount.toFixed(2)}
                                    {invoice.paid_at && (
                                      <span className="ml-2">
                                        • Paid on {new Date(invoice.paid_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadInvoice(invoice)}
                                  className="h-7 text-xs"
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  Download
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
