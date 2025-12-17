"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Edit, Save, X, Loader2 } from "lucide-react";
import type { ExamSubject } from "@/lib/api";
import { updateExamSubject } from "@/lib/api";
import { toast } from "sonner";

interface ExamSubjectCardProps {
  examSubject: ExamSubject;
  onUpdate?: (updatedSubject: ExamSubject) => void;
}

export function ExamSubjectCard({ examSubject, onUpdate }: ExamSubjectCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    obj_max_score: examSubject.obj_max_score?.toString() || "",
    essay_max_score: examSubject.essay_max_score?.toString() || "",
    pract_max_score: examSubject.pract_max_score?.toString() || "",
    obj_pct: examSubject.obj_pct?.toString() || "",
    essay_pct: examSubject.essay_pct?.toString() || "",
    pract_pct: examSubject.pract_pct?.toString() || "",
  });

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData({
      obj_max_score: examSubject.obj_max_score?.toString() || "",
      essay_max_score: examSubject.essay_max_score?.toString() || "",
      pract_max_score: examSubject.pract_max_score?.toString() || "",
      obj_pct: examSubject.obj_pct?.toString() || "",
      essay_pct: examSubject.essay_pct?.toString() || "",
      pract_pct: examSubject.pract_pct?.toString() || "",
    });
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

      const updated = await updateExamSubject(examSubject.exam_id, examSubject.subject_id, updateData);
      toast.success("Subject updated successfully");
      setIsEditing(false);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">
              {examSubject.subject_code} - {examSubject.subject_name}
            </CardTitle>
            <Badge variant={examSubject.subject_type === "CORE" ? "default" : "secondary"}>
              {examSubject.subject_type}
            </Badge>
          </div>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={handleEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
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
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {/* Max Scores */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground">Maximum Scores</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Objective Max Score</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.obj_max_score}
                    onChange={(e) => handleChange("obj_max_score", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.obj_max_score ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Essay Max Score</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.essay_max_score}
                    onChange={(e) => handleChange("essay_max_score", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.essay_max_score ?? "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Practical Max Score</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.pract_max_score}
                    onChange={(e) => handleChange("pract_max_score", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.pract_max_score ?? "-"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Percentages */}
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-muted-foreground">Percentages</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Objective %</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.obj_pct}
                    onChange={(e) => handleChange("obj_pct", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.obj_pct !== null ? `${examSubject.obj_pct}%` : "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Essay %</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.essay_pct}
                    onChange={(e) => handleChange("essay_pct", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.essay_pct !== null ? `${examSubject.essay_pct}%` : "-"}
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Practical %</label>
                {isEditing ? (
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.pract_pct}
                    onChange={(e) => handleChange("pract_pct", e.target.value)}
                    className="mt-1"
                  />
                ) : (
                  <div className="text-sm font-medium mt-1">
                    {examSubject.pract_pct !== null ? `${examSubject.pract_pct}%` : "-"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
