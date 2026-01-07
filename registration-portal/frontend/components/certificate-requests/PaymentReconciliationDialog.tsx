"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  listPendingPayments,
  reconcilePayment,
  reconcilePaymentByReference,
  type PendingPayment,
  type PendingPaymentsResponse,
} from "@/lib/api";

interface PaymentReconciliationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReconciled?: () => void;
}

export function PaymentReconciliationDialog({
  open,
  onOpenChange,
  onReconciled,
}: PaymentReconciliationDialogProps) {
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState<Set<number>>(new Set());
  const [hoursThreshold, setHoursThreshold] = useState(24);
  const [referenceInput, setReferenceInput] = useState("");
  const [reconcilingReference, setReconcilingReference] = useState(false);
  const [cutoffTime, setCutoffTime] = useState<string>("");

  const loadPendingPayments = async () => {
    setLoading(true);
    try {
      const response: PendingPaymentsResponse = await listPendingPayments(hoursThreshold);
      setPendingPayments(response.payments);
      setCutoffTime(response.cutoff_time);
    } catch (error: any) {
      toast.error(error.message || "Failed to load pending payments");
      console.error("Error loading pending payments:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadPendingPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hoursThreshold]);

  const handleReconcile = async (paymentId: number) => {
    setReconciling((prev) => new Set(prev).add(paymentId));
    try {
      const result = await reconcilePayment(paymentId);
      toast.success(result.message || "Payment reconciled successfully");

      // Refresh the list
      await loadPendingPayments();

      // Notify parent to refresh requests if needed
      if (onReconciled) {
        onReconciled();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to reconcile payment");
      console.error("Error reconciling payment:", error);
    } finally {
      setReconciling((prev) => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  };

  const handleReconcileByReference = async () => {
    if (!referenceInput.trim()) {
      toast.error("Please enter a Paystack reference");
      return;
    }

    setReconcilingReference(true);
    try {
      const result = await reconcilePaymentByReference(referenceInput.trim());
      toast.success(result.message || "Payment reconciled successfully");

      // Clear input and refresh list
      setReferenceInput("");
      await loadPendingPayments();

      // Notify parent to refresh requests if needed
      if (onReconciled) {
        onReconciled();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to reconcile payment by reference");
      console.error("Error reconciling payment by reference:", error);
    } finally {
      setReconcilingReference(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "success":
        return <Badge variant="default" className="bg-green-600">Success</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-500">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Payment Reconciliation
          </DialogTitle>
          <DialogDescription>
            Reconcile payments that may have been completed on Paystack but not updated in the system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hours Threshold Filter */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="hours">Show payments older than:</Label>
              <Input
                id="hours"
                type="number"
                min="1"
                max="168"
                value={hoursThreshold}
                onChange={(e) => setHoursThreshold(parseInt(e.target.value) || 24)}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
            <Button onClick={loadPendingPayments} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {cutoffTime && (
              <span className="text-sm text-muted-foreground">
                Cutoff: {new Date(cutoffTime).toLocaleString()}
              </span>
            )}
          </div>

          {/* Reconcile by Reference */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <Label className="text-sm font-semibold mb-2 block">Reconcile by Paystack Reference</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter Paystack transaction reference"
                value={referenceInput}
                onChange={(e) => setReferenceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleReconcileByReference();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleReconcileByReference}
                disabled={reconcilingReference || !referenceInput.trim()}
              >
                {reconcilingReference ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reconciling...
                  </>
                ) : (
                  "Reconcile"
                )}
              </Button>
            </div>
          </div>

          {/* Pending Payments Table */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : pendingPayments.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                No pending payments found older than {hoursThreshold} hours.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="border rounded-lg">
              <div className="p-4 border-b">
                <h3 className="font-semibold">
                  Pending Payments ({pendingPayments.length})
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment ID</TableHead>
                    <TableHead>Paystack Reference</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Request Number</TableHead>
                    <TableHead>Request Type</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingPayments.map((payment) => (
                    <TableRow key={payment.payment_id}>
                      <TableCell className="font-mono text-sm">
                        {payment.payment_id}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {payment.paystack_reference}
                      </TableCell>
                      <TableCell>
                        {payment.currency} {payment.amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {payment.request_number || "N/A"}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.request_type?.replace("_", " ") || "N/A"}
                      </TableCell>
                      <TableCell>
                        {new Date(payment.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(payment.status)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => handleReconcile(payment.payment_id)}
                          disabled={reconciling.has(payment.payment_id)}
                        >
                          {reconciling.has(payment.payment_id) ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Reconciling...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Reconcile
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
