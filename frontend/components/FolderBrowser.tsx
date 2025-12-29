"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Folder, Loader2 } from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import { DocumentList } from "./DocumentList";
import {
  getExamsWithDocuments,
  getSchoolsForExam,
  getSubjectsForExamAndSchool,
  listDocuments,
  downloadDocument,
} from "@/lib/api";
import type { Exam, School, Subject, Document } from "@/types/document";

interface FolderBrowserProps {
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  onSelect?: (document: Document) => void;
}

export function FolderBrowser({
  viewMode = "grid",
  onViewModeChange,
  onSelect,
}: FolderBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const examParam = searchParams.get("exam");
  const schoolParam = searchParams.get("school");
  const subjectParam = searchParams.get("subject");

  const examId = examParam ? (isNaN(parseInt(examParam)) ? null : parseInt(examParam)) : null;
  const schoolId = schoolParam ? (isNaN(parseInt(schoolParam)) ? null : parseInt(schoolParam)) : null;
  const subjectId = subjectParam ? (isNaN(parseInt(subjectParam)) ? null : parseInt(subjectParam)) : null;

  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState<Exam[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [currentSubject, setCurrentSubject] = useState<Subject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [examCache, setExamCache] = useState<Map<number, Exam>>(new Map());
  const [schoolCache, setSchoolCache] = useState<Map<number, School>>(new Map());
  const [subjectCache, setSubjectCache] = useState<Map<number, Subject>>(new Map());

  // Reset state when navigating back
  useEffect(() => {
    if (!examId) {
      setSchools([]);
      setSubjects([]);
      setDocuments([]);
      setCurrentExam(null);
      setCurrentSchool(null);
      setCurrentSubject(null);
    } else if (!schoolId) {
      setSubjects([]);
      setDocuments([]);
      setCurrentSchool(null);
      setCurrentSubject(null);
    } else if (!subjectId) {
      setDocuments([]);
      setCurrentSubject(null);
    }
  }, [examId, schoolId, subjectId]);

  // Load exams (level 1)
  useEffect(() => {
    if (!examId) {
      loadExams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Load schools (level 2)
  useEffect(() => {
    if (examId && !schoolId) {
      loadSchools(examId);
      loadExamDetails(examId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, schoolId]);

  // Load subjects (level 3)
  useEffect(() => {
    if (examId && schoolId && !subjectId) {
      loadSubjects(examId, schoolId);
      loadSchoolDetails(schoolId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, schoolId, subjectId]);

  // Load documents (level 4)
  useEffect(() => {
    if (examId && schoolId && subjectId) {
      loadDocuments(examId, schoolId, subjectId);
      loadSubjectDetails(subjectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, schoolId, subjectId]);

  const loadExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const examsData = await getExamsWithDocuments();
      setExams(examsData);
      // Cache exams
      const newCache = new Map(examCache);
      examsData.forEach((exam) => newCache.set(exam.id, exam));
      setExamCache(newCache);
      setSchools([]);
      setSubjects([]);
      setDocuments([]);
      setCurrentExam(null);
      setCurrentSchool(null);
      setCurrentSubject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load examinations");
      console.error("Error loading exams:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadExamDetails = async (id: number) => {
    try {
      // Check cache first
      if (examCache.has(id)) {
        setCurrentExam(examCache.get(id)!);
        return;
      }
      // If not in cache, fetch all exams (shouldn't happen often)
      const allExams = await getExamsWithDocuments();
      const exam = allExams.find((e) => e.id === id);
      if (exam) {
        setCurrentExam(exam);
        setExamCache((prev) => new Map(prev).set(id, exam));
      }
    } catch (err) {
      console.error("Error loading exam details:", err);
    }
  };

  const loadSchools = async (examId: number) => {
    setLoading(true);
    setError(null);
    try {
      const schoolsData = await getSchoolsForExam(examId);
      setSchools(schoolsData);
      // Cache schools
      const newCache = new Map(schoolCache);
      schoolsData.forEach((school) => newCache.set(school.id, school));
      setSchoolCache(newCache);
      setSubjects([]);
      setDocuments([]);
      setCurrentSchool(null);
      setCurrentSubject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load schools");
      console.error("Error loading schools:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadSchoolDetails = async (id: number) => {
    try {
      // Check cache first
      if (schoolCache.has(id)) {
        setCurrentSchool(schoolCache.get(id)!);
        return;
      }
      // If not in cache, fetch schools for this exam
      const schoolsData = await getSchoolsForExam(examId!);
      const school = schoolsData.find((s) => s.id === id);
      if (school) {
        setCurrentSchool(school);
        setSchoolCache((prev) => new Map(prev).set(id, school));
      }
    } catch (err) {
      console.error("Error loading school details:", err);
    }
  };

  const loadSubjects = async (examId: number, schoolId: number) => {
    setLoading(true);
    setError(null);
    try {
      const subjectsData = await getSubjectsForExamAndSchool(examId, schoolId);
      setSubjects(subjectsData);
      // Cache subjects
      const newCache = new Map(subjectCache);
      subjectsData.forEach((subject) => newCache.set(subject.id, subject));
      setSubjectCache(newCache);
      setDocuments([]);
      setCurrentSubject(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load subjects");
      console.error("Error loading subjects:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjectDetails = async (id: number) => {
    try {
      // Check cache first
      if (subjectCache.has(id)) {
        setCurrentSubject(subjectCache.get(id)!);
        return;
      }
      // If not in cache, fetch subjects for this exam and school
      const subjectsData = await getSubjectsForExamAndSchool(examId!, schoolId!);
      const subject = subjectsData.find((s) => s.id === id);
      if (subject) {
        setCurrentSubject(subject);
        setSubjectCache((prev) => new Map(prev).set(id, subject));
      }
    } catch (err) {
      console.error("Error loading subject details:", err);
    }
  };

  const loadDocuments = async (examId: number, schoolId: number, subjectId: number) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all documents by paginating through results (max page_size is 100)
      let allDocuments: Document[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await listDocuments({
          exam_id: examId,
          school_id: schoolId,
          subject_id: subjectId,
          page: page,
          page_size: 100, // Backend max is 100
        });

        allDocuments = [...allDocuments, ...(response.items || [])];

        // Check if there are more pages
        hasMore = page < response.total_pages;
        page++;
      }

      setDocuments(allDocuments);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load documents";
      setError(errorMessage);
      console.error("Error loading documents:", err);
      setDocuments([]); // Ensure documents is always an array
    } finally {
      setLoading(false);
    }
  };

  const handleExamClick = (exam: Exam) => {
    router.push(`/icm-studio/folders?exam=${exam.id}`);
  };

  const handleSchoolClick = (school: School) => {
    router.push(`/icm-studio/folders?exam=${examId}&school=${school.id}`);
  };

  const handleSubjectClick = (subject: Subject) => {
    router.push(`/icm-studio/folders?exam=${examId}&school=${schoolId}&subject=${subject.id}`);
  };

  const handleDownload = async (doc: Document) => {
    try {
      const blob = await downloadDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      let downloadFilename = doc.file_name;
      if (doc.extracted_id) {
        const fileExtension = doc.file_name.split(".").pop();
        downloadFilename = fileExtension ? `${doc.extracted_id}.${fileExtension}` : doc.extracted_id;
      }

      a.download = downloadFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to download document:", error);
      alert("Failed to download document. Please try again.");
    }
  };

  if (loading && !examId && !schoolId && !subjectId) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
          {typeof error === 'string' ? error : 'An error occurred while loading data'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Breadcrumbs */}
      {(currentExam || currentSchool || currentSubject) && (
        <Breadcrumbs exam={currentExam || undefined} school={currentSchool || undefined} subject={currentSubject || undefined} />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Level 1: Examinations */}
        {!examId && exams.length > 0 && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Examinations</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-7">
              {exams.map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => handleExamClick(exam)}
                  className="flex flex-col items-center rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md aspect-square"
                >
                  <Folder className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-center truncate w-full">{exam.exam_type}</p>
                  <p className="text-xs text-muted-foreground mt-1">{exam.year}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Level 2: Schools */}
        {examId && !schoolId && schools.length > 0 && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Schools</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-7">
              {schools.map((school) => (
                <button
                  key={school.id}
                  onClick={() => handleSchoolClick(school)}
                  className="flex flex-col items-center rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md aspect-square"
                >
                  <Folder className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-center truncate w-full">{school.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{school.code}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Level 3: Subjects */}
        {examId && schoolId && !subjectId && subjects.length > 0 && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Subjects</h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-7">
              {subjects.map((subject) => (
                <button
                  key={subject.id}
                  onClick={() => handleSubjectClick(subject)}
                  className="flex flex-col items-center rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md aspect-square"
                >
                  <Folder className="h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-center truncate w-full">{subject.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{subject.code}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Level 4: Documents */}
        {examId && schoolId && subjectId && (
          <>
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="mx-6 mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-destructive">
                {error}
              </div>
            ) : (
              <DocumentList
                documents={documents || []}
                loading={false}
                currentPage={1}
                totalPages={1}
                onPageChange={() => {}}
                viewMode={viewMode}
                onSelect={onSelect}
              />
            )}
          </>
        )}

        {/* Empty states */}
        {!examId && exams.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Folder className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No examinations found</p>
            <p className="text-sm text-muted-foreground">No examinations have documents yet.</p>
          </div>
        )}

        {examId && !schoolId && schools.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Folder className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No schools found</p>
            <p className="text-sm text-muted-foreground">No schools have documents for this examination.</p>
          </div>
        )}

        {examId && schoolId && !subjectId && subjects.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Folder className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No subjects found</p>
            <p className="text-sm text-muted-foreground">No subjects have documents for this school and examination.</p>
          </div>
        )}
      </div>
    </div>
  );
}
