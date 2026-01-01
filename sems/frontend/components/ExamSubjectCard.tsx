"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit, Save, X, Loader2, GraduationCap, CheckCircle, AlertTriangle, Info } from "lucide-react";
import type { ExamSubject } from "@/lib/api";
import { updateExamSubject, listExamSubjects } from "@/lib/api";
import { toast } from "sonner";
import { GradeRangeModal } from "@/components/GradeRangeModal";

interface ExamSubjectCardProps {
  examSubject: ExamSubject;
  onUpdate?: (updatedSubject: ExamSubject) => void;
  isComplete?: boolean;
}

export function ExamSubjectCard({ examSubject, onUpdate, isComplete }: ExamSubjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [currentSubject, setCurrentSubject] = useState<ExamSubject>(examSubject);
  const [formData, setFormData] = useState({
    obj_max_score: examSubject.obj_max_score?.toString() || "",
    essay_max_score: examSubject.essay_max_score?.toString() || "",
    pract_max_score: examSubject.pract_max_score?.toString() || "",
    obj_pct: examSubject.obj_pct?.toString() || "",
    essay_pct: examSubject.essay_pct?.toString() || "",
    pract_pct: examSubject.pract_pct?.toString() || "",
  });

  // Update currentSubject when examSubject prop changes
  useEffect(() => {
    setCurrentSubject(examSubject);
    setFormData({
      obj_max_score: examSubject.obj_max_score?.toString() || "",
      essay_max_score: examSubject.essay_max_score?.toString() || "",
      pract_max_score: examSubject.pract_max_score?.toString() || "",
      obj_pct: examSubject.obj_pct?.toString() || "",
      essay_pct: examSubject.essay_pct?.toString() || "",
      pract_pct: examSubject.pract_pct?.toString() || "",
    });
  }, [examSubject]);

  // Calculate percentage total
  const percentageTotal = (() => {
    const obj = currentSubject.obj_pct ?? 0;
    const essay = currentSubject.essay_pct ?? 0;
    const pract = currentSubject.pract_pct ?? 0;
    return obj + essay + pract;
  })();

  // Check if grade ranges are configured
  const hasGradeRanges = currentSubject.grade_ranges_json && currentSubject.grade_ranges_json.length > 0;
  const gradeRangesCount = currentSubject.grade_ranges_json?.length || 0;

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      obj_max_score: currentSubject.obj_max_score?.toString() || "",
      essay_max_score: currentSubject.essay_max_score?.toString() || "",
      pract_max_score: currentSubject.pract_max_score?.toString() || "",
      obj_pct: currentSubject.obj_pct?.toString() || "",
      essay_pct: currentSubject.essay_pct?.toString() || "",
      pract_pct: currentSubject.pract_pct?.toString() || "",
    });
  };

  // Refresh exam subject data
  const refreshExamSubject = async () => {
    try {
      const subjects = await listExamSubjects(currentSubject.exam_id);
      const updated = subjects.find((s) => s.id === currentSubject.id);
      if (updated) {
        setCurrentSubject(updated);
        onUpdate?.(updated);
      }
    } catch (error) {
      console.error("Error refreshing exam subject:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updateData = {
        obj_max_score: formData.obj_max_score ? parseFloat(formData.obj_max_score) : null,
        essay_max_score: formData.essay_max_score ? parseFloat(formData.essay_max_score) : null,
        pract_max_score: formData.pract_max_score ? parseFloat(formData.pract_max_score) : null,
        obj_pct: formData.obj_pct ? parseFloat(formData.obj_pct) : null,
        essay_pct: formData.essay_pct ? parseFloat(formData.essay_pct) : null,
        pract_pct: formData.pract_pct ? parseFloat(formData.pract_pct) : null,
      };

      // Validate percentages if provided
      if (
        updateData.obj_pct !== null &&
        updateData.essay_pct !== null &&
        updateData.pract_pct !== null
      ) {
        const total = updateData.obj_pct + updateData.essay_pct + updateData.pract_pct;
        if (Math.abs(total - 100) > 0.01) {
          toast.error("Percentages must sum to 100");
          setLoading(false);
          return;
        }
      } else if (updateData.obj_pct !== null && updateData.essay_pct !== null) {
        const total = updateData.obj_pct + updateData.essay_pct;
        if (updateData.pract_pct !== null) {
          const totalWithPract = total + updateData.pract_pct;
          if (Math.abs(totalWithPract - 100) > 0.01) {
            toast.error("Percentages must sum to 100");
            setLoading(false);
            return;
          }
        }
      }

      const updated = await updateExamSubject(currentSubject.exam_id, currentSubject.subject_id, updateData);
      toast.success("Subject updated successfully");
      setIsEditing(false);
      setCurrentSubject(updated);
      onUpdate?.(updated);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to update subject";
      toast.error(errorMessage);
      console.error("Error updating exam subject:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <Card className="min-w-0 w-full flex flex-col h-full">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-lg wrap-break-word">
                {currentSubject.original_code || currentSubject.subject_code} - {currentSubject.subject_name}
              </CardTitle>
              {isComplete !== undefined && (
                isComplete ? (
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" title="Complete configuration" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0" title="Incomplete configuration" />
                )
              )}
            </div>
            <Badge variant={currentSubject.subject_type === "CORE" ? "default" : "secondary"}>
              {currentSubject.subject_type}
            </Badge>
          </div>
          {!isEditing ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setGradeModalOpen(true)}>
                <GraduationCap className="h-4 w-4 mr-2" />
                Manage Grades
              </Button>
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button variant="default" size="sm" onClick={handleSave} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {/* Summary Section */}
        <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Total %:</span>
            <span className={`text-sm font-semibold ${Math.abs(percentageTotal - 100) < 0.01 ? "text-green-600" : "text-orange-600"}`}>
              {percentageTotal.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Grade Ranges:</span>
            <span className={`text-sm font-semibold ${hasGradeRanges ? "text-green-600" : "text-muted-foreground"}`}>
              {hasGradeRanges ? `${gradeRangesCount} configured` : "Not configured"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Max Scores */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground border-b pb-1">Maximum Scores</h4>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-muted-foreground">Objective</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.obj_max_score}
                    onChange={(e) => handleChange("obj_max_score", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.obj_max_score ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Essay</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.essay_max_score}
                    onChange={(e) => handleChange("essay_max_score", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.essay_max_score ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Practical</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pract_max_score}
                    onChange={(e) => handleChange("pract_max_score", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.pract_max_score ?? "-"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Percentages */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground border-b pb-1">Percentages</h4>
            <div className="space-y-2.5">
              <div>
                <label className="text-xs text-muted-foreground">Objective</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.obj_pct}
                    onChange={(e) => handleChange("obj_pct", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.obj_pct !== null ? `${currentSubject.obj_pct}%` : "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Essay</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.essay_pct}
                    onChange={(e) => handleChange("essay_pct", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.essay_pct !== null ? `${currentSubject.essay_pct}%` : "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Practical</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.pract_pct}
                    onChange={(e) => handleChange("pract_pct", e.target.value)}
                    className="mt-1 h-9"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1 h-9 flex items-center">
                    {currentSubject.pract_pct !== null ? `${currentSubject.pract_pct}%` : "-"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Percentage Total Validation */}
        {isEditing && (
          <div className={`text-xs p-2 rounded ${
            Math.abs(
              (parseFloat(formData.obj_pct) || 0) +
              (parseFloat(formData.essay_pct) || 0) +
              (parseFloat(formData.pract_pct) || 0) - 100
            ) < 0.01
              ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300"
              : "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300"
          }`}>
            Total: {(
              (parseFloat(formData.obj_pct) || 0) +
              (parseFloat(formData.essay_pct) || 0) +
              (parseFloat(formData.pract_pct) || 0)
            ).toFixed(1)}% (must equal 100%)
          </div>
        )}
      </CardContent>

      <GradeRangeModal
        examSubject={currentSubject}
        open={gradeModalOpen}
        onOpenChange={setGradeModalOpen}
        onSuccess={async () => {
          // Refresh exam subject data to get updated grade ranges
          await refreshExamSubject();
        }}
      />
    </Card>
  );
}
