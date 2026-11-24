"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createSchoolAdmin, getSchoolAdmins, listSchools } from "@/lib/api";
import { toast } from "sonner";
import type { School } from "@/types";

interface CreateSchoolAdminDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultSchoolId?: number;
}

export function CreateSchoolAdminDialog({
  open,
  onOpenChange,
  onSuccess,
  defaultSchoolId,
}: CreateSchoolAdminDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState<string>(defaultSchoolId?.toString() || "");
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [hasActiveAdmin, setHasActiveAdmin] = useState(false);

  useEffect(() => {
    if (open) {
      listSchools()
        .then(setSchools)
        .catch((error) => {
          toast.error("Failed to load schools");
          console.error(error);
        });
      if (defaultSchoolId) {
        setSchoolId(defaultSchoolId.toString());
      }
    } else {
      setHasActiveAdmin(false);
    }
  }, [open, defaultSchoolId]);

  useEffect(() => {
    if (!open || !schoolId) {
      setHasActiveAdmin(false);
      return;
    }
    let cancelled = false;
    setCheckingAdmin(true);
    getSchoolAdmins(parseInt(schoolId, 10))
      .then((admins) => {
        if (!cancelled) {
          setHasActiveAdmin(admins.some((a) => a.is_active));
        }
      })
      .catch(() => {
        if (!cancelled) setHasActiveAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setCheckingAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, schoolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!schoolId) {
      toast.error("Please select a school");
      return;
    }

    if (hasActiveAdmin) {
      toast.error(
        "This school already has an active coordinator. Use Replace coordinator instead."
      );
      return;
    }

    setLoading(true);

    try {
      const created = await createSchoolAdmin({
        email,
        full_name: fullName,
        school_id: parseInt(schoolId),
      });
      if (created.invite_sent === false) {
        toast.warning(
          "Coordinator created, but the invite email failed to send. Use Resend invite."
        );
      } else {
        toast.success("Coordinator created — invite email sent to set their password");
      }
      onSuccess();
      onOpenChange(false);
      setEmail("");
      setFullName("");
      setSchoolId("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create coordinator");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Coordinator</DialogTitle>
          <DialogDescription>
            Create a coordinator account. They will receive an email to set their own password.
            One active coordinator per school.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@school.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school">School</Label>
              <Select value={schoolId} onValueChange={setSchoolId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id.toString()}>
                      {school.name} ({school.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveAdmin && (
                <p className="text-sm text-destructive">
                  This school already has an active coordinator. Use Replace coordinator
                  on the school page instead.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || checkingAdmin || hasActiveAdmin}>
              {loading ? "Creating..." : "Create & send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
