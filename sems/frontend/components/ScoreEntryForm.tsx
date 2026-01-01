"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Save } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { getDocumentScores, updateScore, batchUpdateScores } from "@/lib/api";
import type { Document, ScoreResponse, ScoreUpdate, BatchScoreUpdateItem } from "@/types/document";

interface ScoreEntryFormProps {
  document: Document;
  onClose: () => void;
}

export function ScoreEntryForm({ document, onClose }: ScoreEntryFormProps) {
  const [scores, setScores] = useState<ScoreResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoreValues, setScoreValues] = useState<Record<number, ScoreUpdate>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);

  // Determine which fields to show based on document.test_type
  // test_type "1" = Objectives, "2" = Essay, "3" = Practicals
  const showObjScore = document.test_type === "1";
  const showEssayScore = document.test_type === "2";
  const showPractScore = document.test_type === "3";

  // Measure container height for row expansion
  useEffect(() => {
    const updateHeight = () => {
      if (tableContainerRef.current) {
        setContainerHeight(tableContainerRef.current.clientHeight);
      }
    };

    // Use ResizeObserver for more accurate measurements
    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current);
      updateHeight();
    }

    window.addEventListener('resize', updateHeight);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, [scores.length]);

  // Load scores for the document
  useEffect(() => {
    async function loadScores() {
      setLoading(true);
      setError(null);
      try {
        // Use extracted_id if available, otherwise use document.id as string
        // The document_id in SubjectScore is a string identifier
        const documentId = document.extracted_id || document.id.toString();
        const response = await getDocumentScores(documentId);
        setScores(response.scores);

        // Initialize score values
        const initialValues: Record<number, ScoreUpdate> = {};
        response.scores.forEach((score) => {
          initialValues[score.id] = {
            obj_raw_score: score.obj_raw_score,
            essay_raw_score: score.essay_raw_score,
            pract_raw_score: score.pract_raw_score,
          };
        });
        setScoreValues(initialValues);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load scores");
        console.error("Error loading scores:", err);
      } finally {
        setLoading(false);
      }
    }

    loadScores();
  }, [document.id, document.extracted_id]);

  const handleScoreChange = (scoreId: number, field: keyof ScoreUpdate, value: string) => {
    // Handle empty string as null (not entered)
    if (value === "") {
      setScoreValues((prev) => {
        const updated = {
          ...prev,
          [scoreId]: {
            ...prev[scoreId],
            [field]: null,
          },
        };
        return updated;
      });
      setHasChanges(true);
      return;
    }

    // Normalize to uppercase for absence indicators
    const normalizedValue = value.trim().toUpperCase();

    // Check for absence indicators
    if (normalizedValue === "A" || normalizedValue === "AA") {
      setScoreValues((prev) => {
        const updated = {
          ...prev,
          [scoreId]: {
            ...prev[scoreId],
            [field]: normalizedValue,
          },
        };
        return updated;
      });
      setHasChanges(true);
      return;
    }

    // Validate numeric input
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) {
      return; // Invalid input
    }

    // Store as string (numeric)
    setScoreValues((prev) => {
      const updated = {
        ...prev,
        [scoreId]: {
          ...prev[scoreId],
          [field]: value.trim(), // Keep as string
        },
      };
      return updated;
    });
    setHasChanges(true);
  };

  const handleSaveScore = useCallback(async (scoreId: number) => {
    const scoreUpdate = scoreValues[scoreId];
    if (!scoreUpdate) return;

    setSaving(true);
    try {
      await updateScore(scoreId, scoreUpdate);
      // Reload scores to get updated data
      const documentId = document.extracted_id || document.id.toString();
      const response = await getDocumentScores(documentId);
      setScores(response.scores);
      setHasChanges(false);
    } catch (err) {
      console.error("Error saving score:", err);
      alert("Failed to save score. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [scoreValues, document.id, document.extracted_id]);

  const handleBatchSave = async () => {
    if (!hasChanges) return;

    setSaving(true);
    try {
      const batchItems: BatchScoreUpdateItem[] = scores.map((score) => ({
        score_id: score.id,
        subject_registration_id: score.subject_registration_id,
        ...scoreValues[score.id],
      }));

      const documentId = document.extracted_id || document.id.toString();
      await batchUpdateScores(documentId, { scores: batchItems });

      // Reload scores
      const response = await getDocumentScores(documentId);
      setScores(response.scores);
      setHasChanges(false);
    } catch (err) {
      console.error("Error saving scores:", err);
      alert("Failed to save scores. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">Score Entry</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading scores...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
        <div>
          <h2 className="text-base font-semibold">Score Entry</h2>
          <p className="text-xs text-muted-foreground">
            Document: {document.extracted_id || document.file_name}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mx-4 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Scores Table */}
      <div className="flex-1 flex flex-col overflow-hidden px-4 py-2 min-h-0">
        {scores.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            No scores found for this document
          </div>
        ) : (
          <div className="rounded-md border flex-1 flex flex-col overflow-hidden min-h-0">
            <div
              ref={tableContainerRef}
              className="flex-1 overflow-y-auto min-h-0 h-full"
            >
              <Table className="h-full w-full">
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow className="h-8">
                    <TableHead className="w-[120px] text-s py-1.5">Index Number</TableHead>
                    <TableHead className="min-w-[200px] text-s py-1.5">Name</TableHead>
                    {showObjScore && (
                      <TableHead className="w-[120px] text-s py-1.5">Objectives</TableHead>
                    )}
                    {showEssayScore && (
                      <TableHead className="w-[120px] text-s py-1.5">Essay</TableHead>
                    )}
                    {showPractScore && (
                      <TableHead className="w-[120px] text-s py-1.5">Practical</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scores.map((score) => {
                    const currentValues = scoreValues[score.id] || {
                      obj_raw_score: score.obj_raw_score,
                      essay_raw_score: score.essay_raw_score,
                      pract_raw_score: score.pract_raw_score,
                    };

                    const minRows = 25;
                    const shouldExpand = scores.length < minRows && containerHeight !== null;
                    // Calculate row height: (container height - header height) / number of rows
                    const rowHeight = shouldExpand
                      ? `${Math.max((containerHeight - 32) / scores.length, 32)}px`
                      : undefined;

                    return (
                      <TableRow
                        key={score.id}
                        style={rowHeight ? { height: rowHeight } : undefined}
                        className={!shouldExpand ? "h-[32px]" : ""}
                      >
                        <TableCell className="font-mono text-xs py-1.5 align-middle">
                          {score.candidate_index_number}
                        </TableCell>
                        <TableCell className="font-medium text-sm py-1.5 align-middle">
                          {score.candidate_name}
                        </TableCell>
                        {showObjScore && (
                          <TableCell className="py-1.5 align-middle">
                            <Input
                              id={`obj-${score.id}`}
                              type="text"
                              value={currentValues.obj_raw_score ?? ""}
                              onChange={(e) => handleScoreChange(score.id, "obj_raw_score", e.target.value)}
                              onBlur={() => handleSaveScore(score.id)}
                              className={`w-full text-sm ${shouldExpand ? 'h-8' : 'h-6'}`}
                              placeholder=""
                              title="Enter numeric score (>=0), 'A' or 'AA' for absent, or leave empty for not entered"
                            />
                          </TableCell>
                        )}
                        {showEssayScore && (
                          <TableCell className="py-1.5 align-middle">
                            <Input
                              id={`essay-${score.id}`}
                              type="text"
                              value={currentValues.essay_raw_score ?? ""}
                              onChange={(e) => handleScoreChange(score.id, "essay_raw_score", e.target.value)}
                              onBlur={() => handleSaveScore(score.id)}
                              className={`w-full text-sm ${shouldExpand ? 'h-8' : 'h-6'}`}
                              placeholder=""
                              title="Enter numeric score (>=0), 'A' or 'AA' for absent, or leave empty for not entered"
                            />
                          </TableCell>
                        )}
                        {showPractScore && (
                          <TableCell className="py-1.5 align-middle">
                            <Input
                              id={`pract-${score.id}`}
                              type="text"
                              value={currentValues.pract_raw_score ?? ""}
                              onChange={(e) => handleScoreChange(score.id, "pract_raw_score", e.target.value)}
                              onBlur={() => handleSaveScore(score.id)}
                              className={`w-full text-sm ${shouldExpand ? 'h-8' : 'h-6'}`}
                              placeholder=""
                              title="Enter numeric score (>=0), 'A' or 'AA' for absent, or leave empty for not entered"
                            />
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Footer with Batch Save */}
      {scores.length > 0 && (
        <div className="border-t border-border px-4 py-2 shrink-0">
          <Button
            onClick={handleBatchSave}
            disabled={!hasChanges || saving}
            className="w-full h-8"
            size="sm"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      )}
    </div>
  );
}
