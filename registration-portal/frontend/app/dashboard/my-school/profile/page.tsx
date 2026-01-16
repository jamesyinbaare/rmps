"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSchoolProfile, updateSchoolProfile } from "@/lib/api";
import { toast } from "sonner";
import type { School } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, AlertCircle, CheckCircle2, Building2 } from "lucide-react";

export default function SchoolProfilePage() {
  const router = useRouter();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form state
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [digitalAddress, setDigitalAddress] = useState("");
  const [postOfficeAddress, setPostOfficeAddress] = useState("");
  const [isPrivate, setIsPrivate] = useState<boolean | null>(null);
  const [principalName, setPrincipalName] = useState("");
  const [principalEmail, setPrincipalEmail] = useState("");
  const [principalPhone, setPrincipalPhone] = useState("");

  useEffect(() => {
    const loadSchool = async () => {
      try {
        const schoolData = await getSchoolProfile();
        setSchool(schoolData);
        // Populate form fields
        setEmail(schoolData.email || "");
        setPhone(schoolData.phone || "");
        setDigitalAddress(schoolData.digital_address || "");
        setPostOfficeAddress(schoolData.post_office_address || "");
        setIsPrivate(schoolData.is_private ?? null);
        setPrincipalName(schoolData.principal_name || "");
        setPrincipalEmail(schoolData.principal_email || "");
        setPrincipalPhone(schoolData.principal_phone || "");
      } catch (error) {
        toast.error("Failed to load school profile");
        console.error(error);
        router.push("/dashboard/my-school");
      } finally {
        setLoading(false);
      }
    };

    loadSchool();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const updatedSchool = await updateSchoolProfile({
        email: email || null,
        phone: phone || null,
        digital_address: digitalAddress || null,
        post_office_address: postOfficeAddress || null,
        is_private: isPrivate,
        principal_name: principalName || null,
        principal_email: principalEmail || null,
        principal_phone: principalPhone || null,
      });
      setSchool(updatedSchool);
      toast.success(
        updatedSchool.profile_completed
          ? "School profile updated and completed successfully!"
          : "School profile updated successfully"
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update school profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading school profile...</div>
      </div>
    );
  }

  if (!school) {
    return null;
  }

  const isProfileComplete = school.profile_completed;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back Button */}
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">School Profile</h1>
        <p className="text-muted-foreground">Manage your school profile information</p>
      </div>

      {/* Profile Completion Alert */}
      {!isProfileComplete && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Complete your school profile</strong>
            <p className="mt-1">
              Please fill in all required fields to complete your school profile. A complete profile
              is required for full access to all features.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {isProfileComplete && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Profile Complete</strong>
            <p className="mt-1">Your school profile is complete and up to date.</p>
          </AlertDescription>
        </Alert>
      )}

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            <CardTitle>School Information</CardTitle>
          </div>
          <CardDescription>Update your school profile information</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* School Contact Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">School Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">
                    School Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="school@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    School Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="digital_address">
                  Digital Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="digital_address"
                  placeholder="GA-123-4567"
                  value={digitalAddress}
                  onChange={(e) => setDigitalAddress(e.target.value)}
                  required
                  disabled={saving}
                />
                <p className="text-xs text-muted-foreground">Ghana digital address format</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="post_office_address">
                  Post Office Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="post_office_address"
                  placeholder="P.O. Box 123, City"
                  value={postOfficeAddress}
                  onChange={(e) => setPostOfficeAddress(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="is_private">
                  School Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={isPrivate === null ? "" : isPrivate ? "private" : "public"}
                  onValueChange={(value) => {
                    if (value === "private") setIsPrivate(true);
                    else if (value === "public") setIsPrivate(false);
                    else setIsPrivate(null);
                  }}
                  disabled={saving}
                  required
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
            </div>

            {/* Principal Information */}
            <div className="space-y-4 pt-4 border-t">
              <h3 className="text-lg font-semibold">Principal/Headmaster Information</h3>
              <div className="space-y-2">
                <Label htmlFor="principal_name">
                  Principal/Headmaster Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="principal_name"
                  placeholder="Full name"
                  value={principalName}
                  onChange={(e) => setPrincipalName(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="principal_email">
                    Principal Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="principal_email"
                    type="email"
                    placeholder="principal@example.com"
                    value={principalEmail}
                    onChange={(e) => setPrincipalEmail(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="principal_phone">
                    Principal Phone <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="principal_phone"
                    placeholder="+1234567890"
                    value={principalPhone}
                    onChange={(e) => setPrincipalPhone(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
