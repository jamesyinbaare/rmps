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
import { createAdminUser, listSchools } from "@/lib/api";
import { toast } from "sonner";
import type { School, Role } from "@/types";
import { Eye, EyeOff } from "lucide-react";

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
  SchoolAdmin: "School Admin",
  SchoolStaff: "SchoolStaff",
  PublicUser: "Public User",
};

export function CreateAdminUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateAdminUserDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role | "">("");
  const [schoolId, setSchoolId] = useState<string>("");
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (open) {
      listSchools()
        .then(setSchools)
        .catch((error) => {
          toast.error("Failed to load schools");
          console.error(error);
        });
    } else {
      // Reset form when dialog closes
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setFullName("");
      setRole("");
      setSchoolId("");
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role) {
      toast.error("Please select a role");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    if (role === "SchoolAdmin" && !schoolId) {
      toast.error("Please select a school for School Admin role");
      return;
    }

    setLoading(true);

    try {
      await createAdminUser({
        email,
        password,
        full_name: fullName,
        role: role as Role,
        school_id: schoolId ? parseInt(schoolId) : null,
      });
      toast.success("User created successfully");
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
            Create a new admin user account. User and PublicUser roles are reserved for self-registration.
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
              <Select value={role} onValueChange={(value) => {
                setRole(value as Role);
                if (value !== "SchoolAdmin") {
                  setSchoolId("");
                }
              }} disabled={loading}>
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
                <Label htmlFor="school">School <span className="text-destructive">*</span></Label>
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
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={8}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={loading}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
