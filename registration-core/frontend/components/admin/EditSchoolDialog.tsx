"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateSchool } from "@/lib/api";
import { toast } from "sonner";
import type { SchoolDetail } from "@/types";

interface EditSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: SchoolDetail | null;
  onSuccess: () => void;
}

export function EditSchoolDialog({
  open,
  onOpenChange,
  school,
  onSuccess,
}: EditSchoolDialogProps) {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPrivateExaminationCenter, setIsPrivateExaminationCenter] = useState(false);
  // Profile fields
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [digitalAddress, setDigitalAddress] = useState("");
  const [postOfficeAddress, setPostOfficeAddress] = useState("");
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [principalName, setPrincipalName] = useState("");
  const [principalEmail, setPrincipalEmail] = useState("");
  const [principalPhone, setPrincipalPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (school) {
      setName(school.name);
      setIsActive(school.is_active);
      setIsPrivateExaminationCenter(school.is_private_examination_center ?? false);
      // Profile fields
      setEmail(school.email || "");
      setPhone(school.phone || "");
      setDigitalAddress(school.digital_address || "");
      setPostOfficeAddress(school.post_office_address || "");
      setIsPrivate(school.is_private ?? null);
      setPrincipalName(school.principal_name || "");
      setPrincipalEmail(school.principal_email || "");
      setPrincipalPhone(school.principal_phone || "");
    }
  }, [school, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!school) return;

    setLoading(true);

    try {
      await updateSchool(school.id, {
        name,
        is_active: isActive,
        is_private_examination_center: isPrivateExaminationCenter,
        email: email || null,
        phone: phone || null,
        digital_address: digitalAddress || null,
        post_office_address: postOfficeAddress || null,
        is_private: isPrivate,
        principal_name: principalName || null,
        principal_email: principalEmail || null,
        principal_phone: principalPhone || null,
      });
      toast.success("School updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update school");
    } finally {
      setLoading(false);
    }
  };

  if (!school) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit School</DialogTitle>
          <DialogDescription>Update school information and profile.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">School Code</Label>
              <Input id="code" value={school.code} disabled />
              <p className="text-xs text-muted-foreground">School code cannot be changed</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">School Name</Label>
              <Input
                id="name"
                placeholder="School name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="isActive" className="font-normal cursor-pointer">
                  Active
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Inactive schools cannot register candidates
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPrivateExaminationCenter"
                  checked={isPrivateExaminationCenter}
                  onCheckedChange={(checked) => setIsPrivateExaminationCenter(checked === true)}
                  disabled={loading}
                />
                <Label htmlFor="isPrivateExaminationCenter" className="font-normal cursor-pointer">
                  Private Examination Center
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Allow this school to serve as an examination center for private candidates
              </p>
            </div>

            {/* Profile Section */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold">School Profile</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">School Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="school@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">School Phone</Label>
                  <Input
                    id="phone"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="digital_address">Digital Address</Label>
                <Input
                  id="digital_address"
                  placeholder="GA-123-4567"
                  value={digitalAddress}
                  onChange={(e) => setDigitalAddress(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post_office_address">Post Office Address</Label>
                <Input
                  id="post_office_address"
                  placeholder="P.O. Box 123, City"
                  value={postOfficeAddress}
                  onChange={(e) => setPostOfficeAddress(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_private">School Type</Label>
                <Select
                  value={isPrivate === null ? "" : isPrivate ? "private" : "public"}
                  onValueChange={(value) => {
                    if (value === "private") setIsPrivate(true);
                    else if (value === "public") setIsPrivate(false);
                    else setIsPrivate(null);
                  }}
                  disabled={loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select school type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 pt-2 border-t">
                <h4 className="text-md font-medium">Principal/Headmaster Information</h4>

                <div className="space-y-2">
                  <Label htmlFor="principal_name">Principal/Headmaster Name</Label>
                  <Input
                    id="principal_name"
                    placeholder="Full name"
                    value={principalName}
                    onChange={(e) => setPrincipalName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="principal_email">Principal Email</Label>
                    <Input
                      id="principal_email"
                      type="email"
                      placeholder="principal@example.com"
                      value={principalEmail}
                      onChange={(e) => setPrincipalEmail(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="principal_phone">Principal Phone</Label>
                    <Input
                      id="principal_phone"
                      placeholder="+1234567890"
                      value={principalPhone}
                      onChange={(e) => setPrincipalPhone(e.target.value)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {school.profile_completed && (
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-800">
                  Profile completed
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
