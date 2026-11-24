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
import { createAdminUser, getSchoolAdmins, listSchools } from "@/lib/api";
import { toast } from "sonner";
import type { School, Role } from "@/types";

interface CreateAdminUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const ALLOWED_ROLES: Role[] = [
  "Director",
  "DeputyDirector",
  "PrincipalManager",
  "SeniorManager",
  "Manager",
  "Staff",
  "SchoolAdmin",
];

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  SystemAdmin: "System Admin",
  Director: "Director",
  DeputyDirector: "Deputy Director",
  PrincipalManager: "Principal Manager",
  SeniorManager: "Senior Manager",
  Manager: "Manager",
  Staff: "Staff",
  SchoolAdmin: "Coordinator",
  SchoolStaff: "School Staff",
  PublicUser: "Public User",
  APIUSER: "API User",
};

export function CreateAdminUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateAdminUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [schoolId, setSchoolId] = useState<string>("");
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
    } else {
      setEmail("");
      setFullName("");
      setRole("");
      setSchoolId("");
      setHasActiveAdmin(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || role !== "SchoolAdmin" || !schoolId) {
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
  }, [open, role, schoolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      toast.error("Please select a role");
      return;
    }

    if (role === "SchoolAdmin" && !schoolId) {
      toast.error("Please select a school for the coordinator role");
      return;
    }

    if (role === "SchoolAdmin" && hasActiveAdmin) {
      toast.error(
        "This school already has an active coordinator. Use Replace coordinator on the school page."
      );
      return;
    }

    setLoading(true);

    try {
      const created = await createAdminUser({
        email,
        full_name: fullName,
        role: role as Role,
        school_id: schoolId ? parseInt(schoolId) : null,
      });
      if (created.invite_sent === false) {
        toast.warning("User created, but the invite email failed to send. Use Resend invite.");
      } else {
        toast.success("User created — invite email sent to set their password");
      }
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const requiresSchool = role === "SchoolAdmin";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Admin User</DialogTitle>
          <DialogDescription>
            Create a new admin user. They will receive an email to set their own password.
            PublicUser and SchoolStaff roles are reserved for self-registration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
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
              <Label htmlFor="role">Role</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  setRole(value as Role);
                  if (value !== "SchoolAdmin") {
                    setSchoolId("");
                    setHasActiveAdmin(false);
                  }
                }}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ALLOWED_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_DISPLAY_NAMES[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {requiresSchool && (
              <div className="space-y-2">
                <Label htmlFor="school">
                  School <span className="text-destructive">*</span>
                </Label>
                <Select value={schoolId} onValueChange={setSchoolId} disabled={loading} required>
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
                {hasActiveAdmin ? (
                  <p className="text-sm text-destructive">
                    This school already has an active coordinator. Open the school page and use
                    Replace coordinator.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    A school may have only one active coordinator.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || checkingAdmin || (requiresSchool && hasActiveAdmin)}
            >
              {loading ? "Creating..." : "Create & send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
