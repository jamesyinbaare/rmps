"use client";

import { useEffect, useState } from "react";
import {
  listExaminerAllocations,
  acceptExaminerAllocation,
  declineExaminerAllocation,
} from "@/lib/api";
import type { ExaminerAcceptanceResponse } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const DECLINE_CONFIRM_WORD = "decline";

export default function MyInvitationsPage() {
  const [invitations, setInvitations] = useState<ExaminerAcceptanceResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null); // "${acceptanceId}:accept" | "${acceptanceId}:decline"
  const [declineDialogAcceptance, setDeclineDialogAcceptance] = useState<ExaminerAcceptanceResponse | null>(null);
  const [declineConfirmText, setDeclineConfirmText] = useState("");

  const load = () => {
    setLoading(true);
    listExaminerAllocations()
      .then(setInvitations)
      .catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAccept = async (acc: ExaminerAcceptanceResponse) => {
    setActingId(`${acc.id}:accept`);
    try {
      await acceptExaminerAllocation(acc.id);
      toast.success("Invitation accepted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept");
    } finally {
      setActingId(null);
    }
  };

  const openDeclineDialog = (acc: ExaminerAcceptanceResponse) => {
    setDeclineDialogAcceptance(acc);
    setDeclineConfirmText("");
  };

  const closeDeclineDialog = () => {
    setDeclineDialogAcceptance(null);
    setDeclineConfirmText("");
  };

  const handleDeclineConfirm = async () => {
    if (!declineDialogAcceptance) return;
    if (declineConfirmText.trim().toLowerCase() !== DECLINE_CONFIRM_WORD) return;
    setActingId(`${declineDialogAcceptance.id}:decline`);
    try {
      await declineExaminerAllocation(declineDialogAcceptance.id);
      toast.success("Invitation declined");
      closeDeclineDialog();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decline");
    } finally {
      setActingId(null);
    }
  };

  const formatDate = (s: string | null) =>
    s ? new Date(s).toLocaleString() : "—";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">My invitations</h1>
      <p className="text-muted-foreground text-sm">
        Invitations you have been given for marking cycles. Accept or decline by the response deadline.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : invitations.length === 0 ? (
            <p className="text-muted-foreground">
              [No invitations yet.]
            </p>
          ) : (
            <div className="space-y-4">
              {invitations.map((acc) => (
                <div
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
                >
                  <div className="text-sm">
                    <span className="font-medium">
                      {acc.subject_code != null && acc.subject_name != null
                        ? `${acc.subject_code} - ${acc.subject_name}`
                        : acc.subject_id}
                    </span>
                    {acc.examination_year != null && (
                      <>
                        <span className="mx-2">·</span>
                        <span className="text-muted-foreground">
                          Cycle {acc.examination_year}
                        </span>
                      </>
                    )}
                    <span className="mx-2">·</span>
                    <span className="font-medium">Response by </span>
                    <span className="text-muted-foreground">
                      {formatDate(acc.response_deadline)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        acc.status === "PENDING"
                          ? "secondary"
                          : acc.status === "ACCEPTED"
                            ? "default"
                            : "outline"
                      }
                    >
                      {acc.status}
                    </Badge>
                    {acc.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleAccept(acc)}
                          disabled={actingId !== null}
                        >
                          {actingId === `${acc.id}:accept` ? "Accepting..." : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openDeclineDialog(acc)}
                          disabled={actingId !== null}
                        >
                          Decline
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={declineDialogAcceptance !== null} onOpenChange={(open) => !open && closeDeclineDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm decline</DialogTitle>
            <DialogDescription>
              To decline this invitation, type <strong>decline</strong> in the box below and submit.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="decline-confirm">Type &quot;decline&quot;</Label>
            <Input
              id="decline-confirm"
              value={declineConfirmText}
              onChange={(e) => setDeclineConfirmText(e.target.value)}
              placeholder="decline"
              autoComplete="off"
              onKeyDown={(e) => e.key === "Enter" && declineConfirmText.trim().toLowerCase() === DECLINE_CONFIRM_WORD && handleDeclineConfirm()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeclineDialog} disabled={actingId !== null}>
              Cancel
            </Button>
            <Button
              onClick={handleDeclineConfirm}
              disabled={
                actingId !== null || declineConfirmText.trim().toLowerCase() !== DECLINE_CONFIRM_WORD
              }
            >
              {declineDialogAcceptance && actingId === `${declineDialogAcceptance.id}:decline` ? "Declining..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
