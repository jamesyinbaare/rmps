"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getExaminerApplication, type ExaminerApplication } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";

export default function ExaminerApplicationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const applicationId = parseInt(params.id as string);
  const [application, setApplication] = useState<ExaminerApplication | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (applicationId) {
      loadApplication();
    }
  }, [applicationId]);

  const loadApplication = async () => {
    try {
      setLoading(true);
      const data = await getExaminerApplication(applicationId);
      setApplication(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load application");
      router.push("/dashboard/examiner-applications");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!application) {
    return null;
  }

  return (
    <div className="container mx-auto py-8">
      <Button variant="ghost" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{application.application_number}</CardTitle>
              <CardDescription>{application.full_name}</CardDescription>
            </div>
            <Badge>{application.status}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Personal Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p>{application.email_address || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p>{application.telephone_cell || application.telephone_office || "N/A"}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Academic Qualifications</h3>
              <p className="text-sm text-muted-foreground">{application.qualifications.length} qualification(s)</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Documents</h3>
              <p className="text-sm text-muted-foreground">{application.documents.length} document(s) uploaded</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
