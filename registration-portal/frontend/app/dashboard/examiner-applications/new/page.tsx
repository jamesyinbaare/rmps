"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function NewExaminerApplicationPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>New Examiner Application</CardTitle>
          <CardDescription>Create a new application to become an examiner</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              The multi-step examiner application form is ready to be implemented. This page should include:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Step 1: Personal Particulars (Section A, Q1-7)</li>
                <li>Step 2: Academic Qualifications (Section A, Q8)</li>
                <li>Step 3: Teaching Experience (Section A, Q9)</li>
                <li>Step 4: Work Experience (Section A, Q10)</li>
                <li>Step 5: Examining Experience (Section A, Q11)</li>
                <li>Step 6: Training Courses (Section A, Q13)</li>
                <li>Step 7: Additional Information & Documents (Section A, Q14)</li>
                <li>Step 8: Review & Submit (payment integration)</li>
              </ul>
              <p className="mt-2">
                The backend API is fully implemented. Use the API functions from <code className="bg-muted px-1 rounded">@/lib/api</code> to build the form.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
