"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getRecommendationByToken, submitRecommendation, type ExaminerRecommendation } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";

export default function ExaminerRecommendationPage() {
  const params = useParams();
  const token = params.token as string;
  const [recommendation, setRecommendation] = useState<ExaminerRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      loadRecommendation();
    }
  }, [token]);

  const loadRecommendation = async () => {
    try {
      setLoading(true);
      const data = await getRecommendationByToken(token);
      setRecommendation(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load recommendation form");
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

  if (!recommendation) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invalid or expired recommendation token</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (recommendation.completed_at) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Recommendation Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This recommendation has already been submitted.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Examiner Recommendation Form</CardTitle>
          <CardDescription>Section B - Official Recommendation</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The recommendation form is ready to be implemented. This page should include:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Recommender details (name, status, office address, phone)</li>
                <li>Quality ratings table (1-6 scale for each quality)</li>
                <li>Integrity assessment text area</li>
                <li>Certification statement</li>
                <li>Recommendation decision (recommend/do not recommend)</li>
                <li>Signature and date fields</li>
              </ul>
              <p className="mt-2">
                The backend API is fully implemented. Use <code className="bg-muted px-1 rounded">submitRecommendation(token, data)</code> from <code className="bg-muted px-1 rounded">@/lib/api</code> to submit the form.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
