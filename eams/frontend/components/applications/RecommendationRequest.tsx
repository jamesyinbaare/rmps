"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requestRecommendation } from "@/lib/api";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";

interface RecommendationRequestProps {
  applicationId: string;
  applicationNumber: string;
  applicantName: string;
  recommendationStatus?: { completed: boolean; recommender_name: string | null } | null;
}

export function RecommendationRequest({
  applicationId,
  applicationNumber,
  applicantName,
  recommendationStatus,
}: RecommendationRequestProps) {
  const [requesting, setRequesting] = useState(false);
  const [recommenderEmail, setRecommenderEmail] = useState("");
  const [recommenderName, setRecommenderName] = useState("");

  const completed = recommendationStatus?.completed;
  const completedRecommenderName = recommendationStatus?.recommender_name ?? null;

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recommenderEmail || !recommenderName) {
      toast.error("Please fill in all fields");
      return;
    }

    setRequesting(true);
    try {
      const result = await requestRecommendation(applicationId, {
        recommender_email: recommenderEmail,
        recommender_name: recommenderName,
      });
      toast.success(
        `Recommendation request sent to ${result.recommender_email}. They will receive an email with instructions.`
      );
      setRecommenderEmail("");
      setRecommenderName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send recommendation request");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request Recommendation</CardTitle>
        <CardDescription>
          Send a recommendation request to a recommender. They will receive an email with a link to complete the recommendation form.
        </CardDescription>
        {completed && (
          <p className="text-sm text-muted-foreground mt-2">
            {completedRecommenderName ? (
              <>Recommendation received from <strong>{completedRecommenderName}</strong>. </>
            ) : (
              "Recommendation received. "
            )}
            The contents of the recommendation are confidential.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {completed ? null : (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recommenderName">Recommender Name</Label>
            <Input
              id="recommenderName"
              type="text"
              placeholder="Enter recommender's full name"
              value={recommenderName}
              onChange={(e) => setRecommenderName(e.target.value)}
              required
              disabled={requesting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommenderEmail">Recommender Email</Label>
            <Input
              id="recommenderEmail"
              type="email"
              placeholder="Enter recommender's email address"
              value={recommenderEmail}
              onChange={(e) => setRecommenderEmail(e.target.value)}
              required
              disabled={requesting}
            />
          </div>
          <div className="rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium mb-2">Application Details:</p>
            <p>Application Number: {applicationNumber}</p>
            <p>Applicant Name: {applicantName}</p>
          </div>
          <Button type="submit" disabled={requesting}>
            <Send className="mr-2 h-4 w-4" />
            {requesting ? "Sending Request..." : "Send Recommendation Request"}
          </Button>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
