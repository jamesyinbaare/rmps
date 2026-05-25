"use client";

import { useCallback, useEffect, useState } from "react";

import { getMyInspectorPostings, getStaffDefaultExamination, type MyInspectorPostingRow } from "@/lib/api";

export function useInspectorPostings(enabled = true) {
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setPostings([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const exam = await getStaffDefaultExamination();
      const res = await getMyInspectorPostings(exam.id);
      setPostings(res.items);
    } catch (e) {
      setPostings([]);
      setError(e instanceof Error ? e.message : "Could not load postings");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    postings,
    loading,
    error,
    count: postings.length,
    refetch,
  };
}
