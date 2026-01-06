"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { getCertificateRequestStatus, downloadInvoice } from "@/lib/api";
import { toast } from "sonner";
import { Search, FileText, Download, CheckCircle2, Clock, XCircle, Package, Truck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const getStatusIcon = (status: string) => {
  switch (status.toLowerCase()) {
    case "pending_payment":
      return <Clock className="h-5 w-5 text-yellow-500" />;
    case "paid":
      return <CheckCircle2 className="h-5 w-5 text-blue-500" />;
    case "in_process":
      return <Clock className="h-5 w-5 text-blue-500" />;
    case "ready_for_dispatch":
      return <Package className="h-5 w-5 text-purple-500" />;
    case "dispatched":
      return <Truck className="h-5 w-5 text-indigo-500" />;
    case "received":
      return <Package className="h-5 w-5 text-green-500" />;
    case "completed":
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    case "cancelled":
      return <XCircle className="h-5 w-5 text-red-500" />;
    default:
      return <Clock className="h-5 w-5 text-gray-500" />;
  }
};

const getStatusLabel = (status: string) => {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const getStatusBadgeVariant = (status: string) => {
  switch (status.toLowerCase()) {
    case "pending_payment":
      return "secondary";
    case "paid":
      return "default";
    case "in_process":
      return "default";
    case "ready_for_dispatch":
      return "default";
    case "dispatched":
      return "default";
    case "received":
      return "default";
    case "completed":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
};

export default function CertificateRequestStatusPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requestNumber, setRequestNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestData, setRequestData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Check for query parameter
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setRequestNumber(q);
      handleSearchWithNumber(q);
    }
  }, [searchParams]);

  const handleSearchWithNumber = async (reqNumber: string) => {
    setLoading(true);
    setError(null);
    setRequestData(null);

    try {
      const data = await getCertificateRequestStatus(reqNumber.trim());
      setRequestData(data);
    } catch (err: any) {
      setError(err.message || "Request not found. Please check your request number.");
      setRequestData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!requestNumber.trim()) {
      toast.error("Please enter a request number");
      return;
    }

    setLoading(true);
    setError(null);
    setRequestData(null);

    try {
      const data = await getCertificateRequestStatus(requestNumber.trim());
      setRequestData(data);
    } catch (err: any) {
      setError(err.message || "Request not found. Please check your request number.");
      setRequestData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!requestData?.request_number) return;

    try {
      const blob = await downloadInvoice(requestData.request_number);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${requestData.request_number}.pdf`;
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

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-background via-background to-primary/5">
      <Navbar />

      <main className="flex-1">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-3xl mx-auto">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <Search className="h-6 w-6" />
                  Check Request Status
                </CardTitle>
                <CardDescription>
                  Enter your request number to check the status of your certificate or attestation request
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Search Form */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="requestNumber">Request Number</Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="requestNumber"
                        value={requestNumber}
                        onChange={(e) => setRequestNumber(e.target.value.toUpperCase())}
                        placeholder="e.g., REQ-20260105-000001"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSearch();
                          }
                        }}
                      />
                      <Button onClick={handleSearch} disabled={loading || !requestNumber.trim()}>
                        {loading ? "Searching..." : "Search"}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your request number was provided when you submitted your request
                    </p>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Request Details */}
                {requestData && (
                  <div className="space-y-6 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">Request Status</h3>
                        <p className="text-sm text-muted-foreground">Request Number: {requestData.request_number}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(requestData.status)} className="text-sm px-3 py-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(requestData.status)}
                          {getStatusLabel(requestData.status)}
                        </div>
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Request Type</Label>
                        <p className="font-medium">
                          {requestData.request_type === "certificate" ? "Certificate" : "Attestation"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p className="font-medium">
                          {new Date(requestData.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      {requestData.tracking_number && (
                        <div>
                          <Label className="text-muted-foreground">Tracking Number</Label>
                          <p className="font-medium">{requestData.tracking_number}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-muted-foreground">Last Updated</Label>
                        <p className="font-medium">
                          {new Date(requestData.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Payment Information */}
                    {requestData.payment && (
                      <div className="pt-4 border-t">
                        <h4 className="font-semibold mb-2">Payment Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-muted-foreground">Payment Status</Label>
                            <p className="font-medium capitalize">{requestData.payment.status}</p>
                          </div>
                          <div>
                            <Label className="text-muted-foreground">Amount</Label>
                            <p className="font-medium">
                              {new Intl.NumberFormat("en-GH", {
                                style: "currency",
                                currency: requestData.payment.currency || "GHS",
                              }).format(parseFloat(requestData.payment.amount))}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Invoice Download */}
                    {requestData.invoice && (
                      <div className="pt-4 border-t">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold mb-1">Invoice</h4>
                            <p className="text-sm text-muted-foreground">
                              Invoice Number: {requestData.invoice.invoice_number}
                            </p>
                          </div>
                          <Button onClick={handleDownloadInvoice} variant="outline">
                            <Download className="mr-2 h-4 w-4" />
                            Download Invoice
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Status Messages */}
                    <div className="pt-4 border-t">
                      {requestData.status === "pending_payment" && (
                        <Alert>
                          <AlertDescription>
                            Your request is pending payment. Please complete payment to proceed with processing.
                          </AlertDescription>
                        </Alert>
                      )}
                      {requestData.status === "paid" && (
                        <Alert>
                          <AlertDescription>
                            Payment received. Your request is being processed.
                          </AlertDescription>
                        </Alert>
                      )}
                      {requestData.status === "in_process" && (
                        <Alert>
                          <AlertDescription>
                            Your request is currently being processed. This typically takes 5-10 business days.
                          </AlertDescription>
                        </Alert>
                      )}
                      {requestData.status === "dispatched" && (
                        <Alert>
                          <AlertDescription>
                            Your request has been dispatched. {requestData.tracking_number && `Tracking number: ${requestData.tracking_number}`}
                          </AlertDescription>
                        </Alert>
                      )}
                      {requestData.status === "completed" && (
                        <Alert className="border-green-500 bg-green-50">
                          <AlertDescription className="text-green-800">
                            Your request has been completed. You can collect your certificate/attestation as per your delivery method.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help Section */}
            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-2">Need Help?</h3>
                <p className="text-sm text-muted-foreground">
                  If you cannot find your request number, please check your email for the confirmation message sent when you submitted your request.
                  You can also contact our support team for assistance.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
