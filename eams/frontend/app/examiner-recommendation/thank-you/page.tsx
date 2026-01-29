"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

export default function RecommendationThankYouPage() {
  return (
    <div className="w-full container mx-auto py-8 max-w-2xl px-4 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Thank you
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Your recommendation has been submitted successfully. No further action is needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
