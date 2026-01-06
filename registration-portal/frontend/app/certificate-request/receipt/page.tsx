"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { getCertificateRequestStatus, downloadInvoice } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, Download, FileText, Search, Copy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CertificateRequestReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [requestData, setRequestData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const reqNumber = searchParams.get("request_number") || searchParams.get("ref");
    if (reqNumber) {
      setRequestNumber(reqNumber);
      loadRequestData(reqNumber);
    } else {
      setLoading(false);
    }
  }, [searchParams]);

  const loadRequestData = async (reqNumber: string) => {
    setLoading(true);
    try {
      const data = await getCertificateRequestStatus(reqNumber);
      setRequestData(data);
    } catch (error: any) {
      toast.error("Failed to load request details");
      console.error("Error loading request:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!requestNumber) return;

    try {
      const blob = await downloadInvoice(requestNumber);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${requestNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Invoice downloaded successfully");
    } catch (error) {
      toast.error("Failed to download invoice");
      console.error("Error downloading invoice:", error);
    }
  };

  const handleCopyRequestNumber = () => {
    if (requestNumber) {
      navigator.clipboard.writeText(requestNumber);
      toast.success("Request number copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground">Loading receipt...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!requestNumber) {
    return (
      <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
        <Navbar />
        <main className="flex-1">
          <div className="container mx-auto px-4 py-12">
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardHeader>
                  <CardTitle>Payment Receipt</CardTitle>
                  <CardDescription>No request number provided</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => router.push("/certificate-request/status")}>
                    Check Request Status
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Success Message */}
            <Card className="border-green-500 bg-green-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <h2 className="text-xl font-semibold text-green-900">Payment Successful!</h2>
                    <p className="text-sm text-green-700">
                      Your payment has been received and your request is being processed.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Request Number Card */}
            <Card>
              <CardHeader>
                <CardTitle>Your Request Number</CardTitle>
                <CardDescription>
                  Save this number to track your request status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">Request Number</p>
                    <p className="text-2xl font-mono font-bold">{requestNumber}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleCopyRequestNumber}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>

                <Alert>
                  <AlertDescription>
                    <strong>Important:</strong> Please save this request number. You can use it to check the status of your request at any time.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button onClick={() => router.push(`/certificate-request/status?q=${requestNumber}`)}>
                    <Search className="mr-2 h-4 w-4" />
                    Check Status
                  </Button>
                  <Button variant="outline" onClick={handleDownloadInvoice}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Invoice
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Request Details */}
            {requestData && (
              <Card>
                <CardHeader>
                  <CardTitle>Request Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Request Type</p>
                      <p className="font-medium">
                        {requestData.request_type === "certificate" ? "Certificate" : "Attestation"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant="default" className="mt-1">
                        {requestData.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </div>
                    {requestData.invoice && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Invoice Number</p>
                          <p className="font-medium">{requestData.invoice.invoice_number}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Amount Paid</p>
                          <p className="font-medium">
                            {new Intl.NumberFormat("en-GH", {
                              style: "currency",
                              currency: requestData.invoice.currency || "GHS",
                            }).format(parseFloat(requestData.invoice.amount))}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Next Steps */}
            <Card>
              <CardHeader>
                <CardTitle>What's Next?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Save Your Request Number</p>
                    <p className="text-sm text-muted-foreground">
                      Keep this number safe. You'll need it to track your request.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    2
                  </div>
                  <div>
                    <p className="font-medium">Check Status Anytime</p>
                    <p className="text-sm text-muted-foreground">
                      Visit the status check page and enter your request number to see updates.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    3
                  </div>
                  <div>
                    <p className="font-medium">Processing Time</p>
                    <p className="text-sm text-muted-foreground">
                      Your request will be processed within 5-10 business days. You'll be notified when it's ready.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
