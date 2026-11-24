"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import { getSchoolAdmins, resendPasswordSetup } from "@/lib/api";
import { CreateCoordinatorDialog } from "@/components/admin/CreateCoordinatorDialog";
import { ReplaceCoordinatorDialog } from "@/components/admin/ReplaceCoordinatorDialog";
import { toast } from "sonner";
import { Plus, RefreshCw, UserRound, Mail } from "lucide-react";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

function coordinatorStatus(user: User): "inactive" | "pending" | "active" {
  if (!user.is_active) return "inactive";
  if (!user.last_login) return "pending";
  return "active";
}

function StatusChip({ user }: { user: User }) {
  const status = coordinatorStatus(user);
  if (status === "inactive") {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Former
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
        Pending invite
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      Current
    </span>
  );
}

export function CoordinatorsSection({ schoolId }: { schoolId: number }) {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const data = await getSchoolAdmins(schoolId);
      setAdmins(data);
    } catch (error) {
      toast.error("Failed to load coordinators");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId]);

  const activeAdmin = admins.find((a) => a.is_active) ?? null;
  const hasActiveAdmin = Boolean(activeAdmin);
  const isVacant = !loading && !hasActiveAdmin;

  const handleResend = async (user: User) => {
    setResendingId(user.id);
    try {
      await resendPasswordSetup(user.id);
      toast.success("Invite email sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resend invite");
    } finally {
      setResendingId(null);
    }
  };

  const headerAction = hasActiveAdmin ? (
    <Button onClick={() => setReplaceOpen(true)} size="sm" variant="outline" className="gap-2 shadow-none">
      <RefreshCw className="h-4 w-4" />
      Replace coordinator
    </Button>
  ) : (
    <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
      <Plus className="h-4 w-4" />
      Add coordinator
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-5 md:p-6 shadow-none">
        <SectionLabel action={headerAction}>Coordinators</SectionLabel>
        <p className="mb-4 text-sm text-muted-foreground">
          One active coordinator per school. They manage the school registration portal.
        </p>

        {isVacant && (
          <div className="mb-5 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">No active coordinator</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  School portal is blocked until a coordinator is invited.
                </p>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" />
                Invite coordinator
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : admins.length === 0 ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">No coordinators yet.</p>
            <p className="text-sm text-muted-foreground">
              One active coordinator per school.
            </p>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} className="gap-2 shadow-none">
              <Plus className="h-4 w-4" />
              Add coordinator
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Full name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => {
                  const status = coordinatorStatus(admin);
                  return (
                    <TableRow
                      key={admin.id}
                      className={cn(
                        status === "inactive" && "text-muted-foreground",
                        status === "active" && "bg-muted/30"
                      )}
                    >
                      <TableCell className="font-mono text-sm">{admin.email}</TableCell>
                      <TableCell>{admin.full_name}</TableCell>
                      <TableCell>
                        <StatusChip user={admin} />
                      </TableCell>
                      <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        {status === "pending" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-2 shadow-none"
                            disabled={resendingId === admin.id}
                            onClick={() => handleResend(admin)}
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {resendingId === admin.id ? "Sending…" : "Resend invite"}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateCoordinatorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={loadAdmins}
        defaultSchoolId={schoolId}
      />
      <ReplaceCoordinatorDialog
        open={replaceOpen}
        onOpenChange={setReplaceOpen}
        onSuccess={loadAdmins}
        schoolId={schoolId}
        currentAdmin={activeAdmin}
      />
    </div>
  );
}
