"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import type { UnmatchedExtractionRecord, Document, CandidateScoreEntry } from "@/types/document";
import { getCandidatesForManualEntry, resolveUnmatchedRecord } from "@/lib/api";
import { toast } from "sonner";

interface ResolveUnmatchedRecordDialogProps {
  record: UnmatchedExtractionRecord;
  document: Document;
  open: boolean;
  onClose: () => void;
  onResolve: () => void;
}

interface CandidateWithSubjects extends CandidateScoreEntry {
  // Already includes subject_registration_id, subject_id, subject_code, subject_name
}

export function ResolveUnmatchedRecordDialog({
  record,
  document,
  open,
  onClose,
  onResolve,
}: ResolveUnmatchedRecordDialogProps) {
  const [indexNumber, setIndexNumber] = useState(record.index_number || "");
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<CandidateWithSubjects[]>([]);
  const [selectedSubjectRegistrationId, setSelectedSubjectRegistrationId] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  // Auto-determine score_field from document.test_type
  const getScoreField = (): "obj" | "essay" | "pract" => {
    if (document.test_type === "1") return "obj";
    if (document.test_type === "2") return "essay";
    if (document.test_type === "3") return "pract";
    return "obj"; // Default fallback
  };

  const [scoreField, setScoreField] = useState<"obj" | "essay" | "pract">(getScoreField());

  // Auto-search when dialog opens
  useEffect(() => {
    if (open && record.index_number && document.exam_id) {
      // Reset state
      setCandidates([]);
      setSelectedSubjectRegistrationId(null);
      // Trigger search
      const performSearch = async () => {
        if (!record.index_number || !document.exam_id) return;

        setSearching(true);
        try {
          const allMatchingRegistrations: CandidateScoreEntry[] = [];
          let page = 1;
          let hasMore = true;
          const targetIndexNumber = record.index_number.trim();

          while (hasMore && page <= 10) {
            const response = await getCandidatesForManualEntry({
              exam_id: document.exam_id,
              page,
              page_size: 100,
            });

            const pageMatches = response.items.filter(
              (entry) => entry.candidate_index_number === targetIndexNumber
            );
            allMatchingRegistrations.push(...pageMatches);

            hasMore = response.items.length === 100 && page < response.total_pages;
            page++;
          }

          if (document.subject_id && allMatchingRegistrations.length > 0) {
            const matchingSubject = allMatchingRegistrations.find(
              (c) => c.subject_id === document.subject_id
            );
            if (matchingSubject) {
              setSelectedSubjectRegistrationId(matchingSubject.subject_registration_id);
            }
          }

          setCandidates(allMatchingRegistrations);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to search candidates");
          console.error("Error searching candidates:", error);
        } finally {
          setSearching(false);
        }
      };
      performSearch();
    }
  }, [open, record.index_number, document.exam_id, document.subject_id]);

  const handleSearch = async () => {
    if (!indexNumber.trim() || !document.exam_id) {
      toast.error("Index number and exam ID are required");
      return;
    }

    setSearching(true);
    setCandidates([]);
    setSelectedSubjectRegistrationId(null);

    try {
      // Search for candidates with this index number in the exam
      // Paginate through results to find all matching candidates
      const allMatchingRegistrations: CandidateScoreEntry[] = [];
      let page = 1;
      let hasMore = true;
      const targetIndexNumber = indexNumber.trim();

      while (hasMore && page <= 10) { // Safety limit of 10 pages
        const response = await getCandidatesForManualEntry({
          exam_id: document.exam_id,
          page,
          page_size: 100,
        });

        // Filter by index_number
        const pageMatches = response.items.filter(
          (entry) => entry.candidate_index_number === targetIndexNumber
        );
        allMatchingRegistrations.push(...pageMatches);

        // Check if we should continue paginating
        hasMore = response.items.length === 100 && page < response.total_pages;

        // If we found matches, we can stop (typically only one candidate per index_number)
        // But continue if we haven't checked all pages yet
        page++;
      }

      // If we have document.subject_id, prioritize subject registrations matching it
      if (document.subject_id && allMatchingRegistrations.length > 0) {
        const matchingSubject = allMatchingRegistrations.find(
          (c) => c.subject_id === document.subject_id
        );
        if (matchingSubject) {
          // Auto-select the matching subject registration
          setSelectedSubjectRegistrationId(matchingSubject.subject_registration_id);
        }
      }

      setCandidates(allMatchingRegistrations);

      if (allMatchingRegistrations.length === 0) {
        toast.info("No candidates found with this index number");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to search candidates");
      console.error("Error searching candidates:", error);
    } finally {
      setSearching(false);
    }
  };

  const handleResolve = async () => {
    if (!selectedSubjectRegistrationId) {
      toast.error("Please select a subject registration");
      return;
    }

    setResolving(true);
    try {
      await resolveUnmatchedRecord(record.id, {
        subject_registration_id: selectedSubjectRegistrationId,
        score_field: scoreField,
        score_value: record.score || null,
      });
      toast.success("Record resolved successfully");
      onResolve();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to resolve record");
      console.error("Error resolving record:", error);
    } finally {
      setResolving(false);
    }
  };

  const selectedSubjectRegistration = candidates.find(
    (c) => c.subject_registration_id === selectedSubjectRegistrationId
  );

  const canResolve = selectedSubjectRegistrationId !== null && !resolving;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Resolve Unmatched Record</DialogTitle>
          <DialogDescription>
            Search for candidates and select the appropriate subject registration to resolve this record.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* Search Section */}
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="index-number" className="text-sm font-medium">
                  Index Number
                </label>
                <Input
                  id="index-number"
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSearch();
                    }
                  }}
                  placeholder="Enter index number"
                />
              </div>
              <Button onClick={handleSearch} disabled={searching || !indexNumber.trim()}>
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Score Field Selection (if test_type is missing) */}
          {!document.test_type && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Score Field</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scoreField === "obj"}
                    onChange={() => setScoreField("obj")}
                  />
                  Objective (obj)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scoreField === "essay"}
                    onChange={() => setScoreField("essay")}
                  />
                  Essay
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={scoreField === "pract"}
                    onChange={() => setScoreField("pract")}
                  />
                  Practical (pract)
                </label>
              </div>
            </div>
          )}

          {document.test_type && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Score Field</label>
              <p className="text-sm text-muted-foreground">
                {scoreField === "obj" && "Objective (obj)"}
                {scoreField === "essay" && "Essay"}
                {scoreField === "pract" && "Practical (pract)"}
                {" (auto-determined from document test_type)"}
              </p>
            </div>
          )}

          {/* Results Section */}
          {candidates.length > 0 && (
            <div className="space-y-4">
              <label className="text-sm font-medium">Select Subject Registration</label>
              <div className="space-y-2 max-h-96 overflow-auto border rounded-md p-4">
                {candidates.map((candidate) => {
                  const isMatchingSubject = document.subject_id && candidate.subject_id === document.subject_id;
                  const isSelected = selectedSubjectRegistrationId === candidate.subject_registration_id;
                  return (
                    <div
                      key={candidate.subject_registration_id}
                      onClick={() => setSelectedSubjectRegistrationId(candidate.subject_registration_id)}
                      className={`flex items-start space-x-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : isMatchingSubject
                          ? "bg-primary/5 border-primary hover:bg-primary/10"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div
                        className={`mt-1 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        }`}
                      >
                        {isSelected && (
                          <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{candidate.candidate_name}</span>
                          {isMatchingSubject && (
                            <Badge variant="default" className="text-xs">
                              Matches Document Subject
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Index: {candidate.candidate_index_number}</div>
                          <div>
                            Subject: {candidate.subject_code} - {candidate.subject_name}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview Section */}
          {selectedSubjectRegistration && (
            <div className="space-y-2 p-4 bg-muted rounded-md">
              <label className="text-sm font-medium">Preview</label>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Candidate:</span> {selectedSubjectRegistration.candidate_name}
                </div>
                <div>
                  <span className="font-medium">Subject:</span> {selectedSubjectRegistration.subject_code} - {selectedSubjectRegistration.subject_name}
                </div>
                <div>
                  <span className="font-medium">Score Field:</span> {scoreField}
                </div>
                <div>
                  <span className="font-medium">Score Value:</span> {record.score || "N/A"}
                </div>
              </div>
            </div>
          )}

          {/* No Results */}
          {!searching && candidates.length === 0 && indexNumber && (
            <div className="flex items-center gap-2 p-4 border border-border rounded-md text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <span>No candidates found. Please check the index number and try again.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={resolving}>
            Cancel
          </Button>
          <Button
            onClick={handleResolve}
            disabled={!canResolve}
          >
            {resolving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resolving...
              </>
            ) : (
              "Resolve"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
