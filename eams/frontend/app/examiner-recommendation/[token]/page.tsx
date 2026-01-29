"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getRecommendationByToken, submitRecommendation } from "@/lib/api";
import type { ExaminerRecommendationResponse } from "@/types";
import { toast } from "sonner";
import { Loader2, AlertCircle, CheckCircle, Send } from "lucide-react";

// Quality ratings that need to be assessed (1-6 scale)
const QUALITY_RATINGS = [
  { key: "knowledge_of_subject", label: "Knowledge of Subject" },
  { key: "reliability", label: "Reliability" },
  { key: "integrity", label: "Integrity" },
  { key: "communication_skills", label: "Communication Skills" },
  { key: "professionalism", label: "Professionalism" },
  { key: "teaching_ability", label: "Teaching Ability" },
  { key: "examination_experience", label: "Examination Experience" },
  { key: "analytical_thinking", label: "Analytical Thinking" },
] as const;

interface RecommendationFormData {
  recommender_name: string;
  recommender_status: string;
  recommender_office_address: string;
  recommender_phone: string;
  quality_ratings: Record<string, number>;
  recommendation_decision: boolean | null;
  recommender_signature: string;
  recommender_date: string;
}

export default function ExaminerRecommendationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [recommendation, setRecommendation] = useState<ExaminerRecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<RecommendationFormData>({
    recommender_name: "",
    recommender_status: "",
    recommender_office_address: "",
    recommender_phone: "",
    quality_ratings: {},
    recommendation_decision: null,
    recommender_signature: "",
    recommender_date: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoError, setPhotoError] = useState(false);
  const submittingRef = useRef(false);

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

      // Pre-fill form with existing data if available
      if (data) {
        setFormData({
          recommender_name: data.recommender_name || "",
          recommender_status: data.recommender_status || "",
          recommender_office_address: data.recommender_office_address || "",
          recommender_phone: data.recommender_phone || "",
          quality_ratings: data.quality_ratings || {},
          recommendation_decision: data.recommendation_decision ?? null,
          recommender_signature: data.recommender_signature || "",
          recommender_date: "", // Date will be set automatically on submission
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load recommendation form");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.recommender_name.trim()) {
      newErrors.recommender_name = "Recommender name is required";
    }

    if (formData.recommendation_decision === null) {
      newErrors.recommendation_decision = "Recommendation decision is required";
    }

    // Check if all quality ratings are provided
    const missingRatings = QUALITY_RATINGS.filter(
      (quality) => !formData.quality_ratings[quality.key] || formData.quality_ratings[quality.key] < 1 || formData.quality_ratings[quality.key] > 6
    );
    if (missingRatings.length > 0) {
      newErrors.quality_ratings = "All quality ratings must be provided (1-6)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (submittingRef.current) return;

    if (!validateForm()) {
      toast.error("Please fill in all required fields");
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // Automatically set date to today's date
      const today = new Date().toISOString().split("T")[0];

      const submitData = {
        recommender_name: formData.recommender_name,
        recommender_status: formData.recommender_status || null,
        recommender_office_address: formData.recommender_office_address || null,
        recommender_phone: formData.recommender_phone || null,
        quality_ratings: formData.quality_ratings,
        recommendation_decision: formData.recommendation_decision!,
        recommender_signature: formData.recommender_signature || null,
        recommender_date: today,
      };

      await submitRecommendation(token, submitData);
      toast.success("Thank you. Your recommendation has been submitted.");
      router.push("/examiner-recommendation/thank-you");
    } catch (error: any) {
      const message = error?.message ?? "";
      if (message.includes("already been submitted")) {
        router.push("/examiner-recommendation/thank-you");
      } else {
        toast.error(message || "Failed to submit recommendation");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const updateQualityRating = (qualityKey: string, rating: number) => {
    setFormData((prev) => ({
      ...prev,
      quality_ratings: {
        ...prev.quality_ratings,
        [qualityKey]: rating,
      },
    }));
    // Clear error when rating is set
    if (errors.quality_ratings) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.quality_ratings;
        return newErrors;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full px-4 sm:px-6">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="w-full container mx-auto py-8 max-w-2xl px-4 sm:px-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invalid or expired recommendation token</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (recommendation.completed_at) {
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
              Your recommendation has been submitted. No further action is needed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full container mx-auto py-8 max-w-4xl px-4 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Examiner Recommendation Form</CardTitle>
          <CardDescription>Official Recommendation</CardDescription>
          {recommendation.applicant_name && (
            <p className="text-sm text-muted-foreground mt-1">
              Recommendation for <strong>{recommendation.applicant_name}</strong>
            </p>
          )}
          {!photoError && (
            <div className="mt-3 flex justify-start">
              <img
                src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8002"}/api/v1/public/examiner-recommendations/${token}/applicant-photo`}
                alt="Applicant photograph"
                className="h-24 w-24 rounded-lg border object-cover object-top"
                onError={() => setPhotoError(true)}
              />
            </div>
          )}

          <p className="text-sm text-muted-foreground mt-2 rounded-md border border-border bg-muted/50 p-3">
          Please complete this form honestly and to the best of your knowledge. Your responses will be used to assess the applicant's suitability to serve as an examiner. All information provided will be treated as confidential and used solely for this purpose.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6 pb-20 sm:pb-0">
            {/* Recommender Details */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Recommender Details</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="recommender_name">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="recommender_name"
                    value={formData.recommender_name}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, recommender_name: e.target.value }));
                      if (errors.recommender_name) {
                        setErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors.recommender_name;
                          return newErrors;
                        });
                      }
                    }}
                    required
                    className={`text-base ${errors.recommender_name ? "border-destructive" : ""}`}
                    aria-invalid={!!errors.recommender_name}
                    aria-describedby={errors.recommender_name ? "recommender_name_error" : undefined}
                  />
                  {errors.recommender_name && (
                    <p id="recommender_name_error" className="text-sm text-destructive" role="alert">
                      {errors.recommender_name}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recommender_status">Status/Position</Label>
                  <Input
                    id="recommender_status"
                    value={formData.recommender_status}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, recommender_status: e.target.value }))
                    }
                    placeholder="e.g., Professor, Head of Department"
                    className="text-base"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recommender_office_address">Office Address</Label>
                <Textarea
                  id="recommender_office_address"
                  value={formData.recommender_office_address}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, recommender_office_address: e.target.value }))
                  }
                  rows={3}
                  placeholder="Enter office address"
                  className="text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recommender_phone">Phone Number</Label>
                <Input
                  id="recommender_phone"
                  type="tel"
                  value={formData.recommender_phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, recommender_phone: e.target.value }))
                  }
                  placeholder="Enter phone number"
                  className="text-base"
                />
              </div>
            </div>

            {/* Quality Ratings */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Quality Ratings</h3>
                <p className="text-sm text-muted-foreground">
                  Please rate the applicant on each quality using a scale of 1-6 (1 = Poor, 6 = Excellent)
                </p>
              </div>

              <div className="space-y-4 border rounded-lg p-4">
                {QUALITY_RATINGS.map((quality) => (
                  <div key={quality.key} className="space-y-2">
                    <Label className="font-medium">{quality.label}</Label>
                    <div
                      className="grid grid-cols-6 gap-2"
                      role="group"
                      aria-label={`${quality.label}, rate 1 to 6`}
                    >
                      {[1, 2, 3, 4, 5, 6].map((rating) => (
                        <button
                          key={rating}
                          type="button"
                          onClick={() => updateQualityRating(quality.key, rating)}
                          className={`min-h-[44px] rounded-md border px-2 py-2 text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                            formData.quality_ratings[quality.key] === rating
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
                          }`}
                          aria-pressed={formData.quality_ratings[quality.key] === rating}
                          aria-label={`Rate ${rating}`}
                        >
                          {rating}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {errors.quality_ratings && (
                <p id="quality_ratings_error" className="text-sm text-destructive" role="alert">
                  {errors.quality_ratings}
                </p>
              )}
            </div>

            {/* Recommendation Decision */}
            <div
              className="space-y-2"
              role="group"
              aria-labelledby="recommendation_decision_label"
              aria-describedby={errors.recommendation_decision ? "recommendation_decision_error" : undefined}
              aria-invalid={!!errors.recommendation_decision}
            >
              <Label id="recommendation_decision_label">
                Recommendation Decision <span className="text-destructive">*</span>
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <Button
                  type="button"
                  variant={formData.recommendation_decision === true ? "default" : "outline"}
                  className="min-h-[44px] w-full sm:flex-1 text-base"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, recommendation_decision: true }));
                    if (errors.recommendation_decision) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.recommendation_decision;
                        return newErrors;
                      });
                    }
                  }}
                  aria-pressed={formData.recommendation_decision === true}
                >
                  I recommend this applicant
                </Button>
                <Button
                  type="button"
                  variant={formData.recommendation_decision === false ? "destructive" : "outline"}
                  className="min-h-[44px] w-full sm:flex-1 text-base"
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, recommendation_decision: false }));
                    if (errors.recommendation_decision) {
                      setErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.recommendation_decision;
                        return newErrors;
                      });
                    }
                  }}
                  aria-pressed={formData.recommendation_decision === false}
                >
                  I do not recommend this applicant
                </Button>
              </div>
              {errors.recommendation_decision && (
                <p id="recommendation_decision_error" className="text-sm text-destructive">
                  {errors.recommendation_decision}
                </p>
              )}
            </div>

            {/* Signature */}
            <div className="space-y-2">
              <Label htmlFor="recommender_signature">Signature</Label>
              <Input
                id="recommender_signature"
                value={formData.recommender_signature}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, recommender_signature: e.target.value }))
                }
                placeholder="Type your full name as signature"
                className="text-base"
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-4 border-t sticky bottom-0 bg-background -mx-1 px-1 pb-4 sm:pb-0 sm:static sm:bg-transparent sm:mx-0 sm:px-0">
              <Button type="submit" disabled={submitting} size="lg" className="w-full sm:w-auto min-h-[44px] text-base">
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Recommendation
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
