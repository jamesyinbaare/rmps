"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { updateExam, getExam } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import type { RegistrationExam } from "@/types";

interface PricingModelSelectorProps {
  examId: number;
  onUpdate?: () => void;
}

export function PricingModelSelector({ examId, onUpdate }: PricingModelSelectorProps) {
  const [exam, setExam] = useState<RegistrationExam | null>(null);
  const [pricingModel, setPricingModel] = useState<string>("auto");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExam();
  }, [examId]);

  const loadExam = async () => {
    setLoading(true);
    try {
      const examData = await getExam(examId);
      setExam(examData);
      setPricingModel(examData.pricing_model_preference || "auto");
    } catch (error) {
      toast.error("Failed to load exam data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!exam) return;

    setSaving(true);
    try {
      await updateExam(examId, {
        pricing_model_preference: pricingModel,
      });
      toast.success("Pricing model updated successfully");
      await loadExam();
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      toast.error("Failed to update pricing model");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="ml-2">Loading...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Model</CardTitle>
        <CardDescription>
          Select the pricing model to use for this examination. This determines how fees are calculated.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pricing-model">Pricing Model Preference</Label>
          <Select value={pricingModel} onValueChange={setPricingModel}>
            <SelectTrigger id="pricing-model">
              <SelectValue placeholder="Select pricing model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">
                Auto (Use tiered if available, otherwise per-subject)
              </SelectItem>
              <SelectItem value="per_subject">Per-Subject Pricing</SelectItem>
              <SelectItem value="tiered">Tiered Pricing</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {pricingModel === "auto" && "Automatically selects the best pricing model based on configured pricing."}
            {pricingModel === "per_subject" && "Uses per-subject pricing only. Each subject has its own price."}
            {pricingModel === "tiered" && "Uses tiered pricing only. Price depends on the number of subjects selected."}
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving || !exam}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Pricing Model
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
