"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, BarChart3 } from "lucide-react";
import {
  analyzeBoundaryMethod,
  compareBoundaryMethods,
  type ScoringMethod,
  type MethodAnalysis,
  type MethodComparison,
} from "@/lib/api";
import { ScoresAnalysisDashboard } from "./ScoresAnalysisDashboard";

interface ScoresAnalysisPanelProps {
  examSubjectId: number;
  filters?: {
    region?: string;
    zone?: string;
    schoolId?: number;
  };
  includePending?: boolean;
  includeAbsent?: boolean;
}

const SCORING_METHODS: Array<{ value: ScoringMethod; label: string }> = [
  { value: "norm_referenced", label: "Norm-Referenced (Percentile-Based)" },
  { value: "criterion_referenced", label: "Criterion-Referenced (Standards-Based)" },
  { value: "statistical_std", label: "Statistical (Standard Deviation)" },
  { value: "statistical_zscore", label: "Statistical (Z-Score)" },
  { value: "fixed_distribution", label: "Fixed Distribution" },
  { value: "modified_curve", label: "Modified Curve" },
  { value: "mastery_based", label: "Mastery-Based" },
  { value: "hybrid", label: "Hybrid" },
];

export function ScoresAnalysisPanel({
  examSubjectId,
  filters,
  includePending = false,
  includeAbsent = false,
}: ScoresAnalysisPanelProps) {
  const [analysisMode, setAnalysisMode] = useState<"single" | "compare">("single");
  const [selectedMethod, setSelectedMethod] = useState<ScoringMethod>("norm_referenced");
  const [selectedMethods, setSelectedMethods] = useState<ScoringMethod[]>([
    "norm_referenced",
    "criterion_referenced",
  ]);
  const [singleAnalysis, setSingleAnalysis] = useState<MethodAnalysis | null>(null);
  const [comparison, setComparison] = useState<MethodComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>([]);

  const handleRunAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      if (analysisMode === "single") {
        const result = await analyzeBoundaryMethod(
          examSubjectId,
          selectedMethod,
          filters,
          includePending,
          includeAbsent
        );
        setSingleAnalysis(result);
        setComparison(null);
        setScores(result.scores || []);
      } else {
        if (selectedMethods.length < 2) {
          setError("Please select at least 2 methods for comparison");
          setLoading(false);
          return;
        }
        const result = await compareBoundaryMethods(
          examSubjectId,
          selectedMethods,
          filters,
          includePending,
          includeAbsent
        );
        setComparison(result);
        setSingleAnalysis(null);
        setScores(result.scores || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run analysis");
      console.error("Analysis error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMethodToggle = (method: ScoringMethod, checked: boolean) => {
    if (checked) {
      setSelectedMethods([...selectedMethods, method]);
    } else {
      setSelectedMethods(selectedMethods.filter((m) => m !== method));
    }
  };

  return (
    <div className="space-y-6">
      {/* Analysis Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Scores Analysis Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Analysis Mode Selection */}
          <div className="space-y-2">
            <Label>Analysis Mode</Label>
            <Select
              value={analysisMode}
              onValueChange={(value) => {
                setAnalysisMode(value as "single" | "compare");
                setSingleAnalysis(null);
                setComparison(null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Method Analysis</SelectItem>
                <SelectItem value="compare">Compare Multiple Methods</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Single Method Selection */}
          {analysisMode === "single" && (
            <div className="space-y-2">
              <Label>Select Method</Label>
              <Select value={selectedMethod} onValueChange={(value) => setSelectedMethod(value as ScoringMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORING_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Multiple Methods Selection */}
          {analysisMode === "compare" && (
            <div className="space-y-2">
              <Label>Select Methods (at least 2)</Label>
              <div className="grid grid-cols-2 gap-3 p-4 border rounded-md">
                {SCORING_METHODS.map((method) => (
                  <div key={method.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={method.value}
                      checked={selectedMethods.includes(method.value)}
                      onCheckedChange={(checked) =>
                        handleMethodToggle(method.value, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={method.value}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {method.label}
                    </Label>
                  </div>
                ))}
              </div>
              {selectedMethods.length < 2 && (
                <p className="text-sm text-muted-foreground">
                  Please select at least 2 methods for comparison
                </p>
              )}
            </div>
          )}

          {/* Run Button */}
          <Button
            onClick={handleRunAnalysis}
            disabled={loading || (analysisMode === "compare" && selectedMethods.length < 2)}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Analysis...
              </>
            ) : (
              "Run Analysis"
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {(singleAnalysis || comparison) && (
        <ScoresAnalysisDashboard
          singleAnalysis={singleAnalysis}
          comparison={comparison}
          scores={scores}
        />
      )}
    </div>
  );
}
