"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPublicCandidateInfo } from "@/lib/api";
import { Calendar, User, School, FileText, Clock, MapPin } from "lucide-react";

interface PublicCandidateInfo {
  candidate_name: string;
  index_number: string;
  registration_number: string;
  center_name: string | null;
  center_code: string | null;
  photo_url: string | null;
  exam_type: string;
  exam_series: string;
  exam_year: number;
  schedule_entries: Array<{
    subject_code: string;
    subject_name: string;
    paper: number;
    date: string;
    start_time: string;
    end_time: string | null;
    venue: string | null;
  }>;
}

export default function PublicCandidateInfoPage() {
  const params = useParams();
  const indexNumber = params.indexNumber as string;
  const [candidateInfo, setCandidateInfo] = useState<PublicCandidateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCandidateInfo = async () => {
      if (!indexNumber) {
        setError("Index number is required");
        setLoading(false);
        return;
      }

      try {
        const info = await getPublicCandidateInfo(indexNumber);
        setCandidateInfo(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load candidate information");
      } finally {
        setLoading(false);
      }
    };

    loadCandidateInfo();
  }, [indexNumber]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatTime = (timeString: string) => {
    const time = timeString.split(":").slice(0, 2).join(":");
    return time;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading candidate information...</p>
        </div>
      </div>
    );
  }

  if (error || !candidateInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error || "Candidate information not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Candidate Information</h1>
          <p className="text-muted-foreground mt-2">Examination Index Slip Details</p>
        </div>

        {/* Candidate Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Candidate Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="text-lg font-medium">{candidateInfo.candidate_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Index Number</p>
                <p className="text-lg font-medium font-mono">{candidateInfo.index_number}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Registration Number</p>
                <p className="text-lg font-medium font-mono">{candidateInfo.registration_number}</p>
              </div>
              {candidateInfo.photo_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Photo</p>
                  <img
                    src={`${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001"}${candidateInfo.photo_url}`}
                    alt="Candidate Photo"
                    className="w-32 h-40 object-cover rounded border"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Examination Center Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="h-5 w-5" />
              Examination Center
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Center Name</p>
                <p className="text-lg font-medium">{candidateInfo.center_name || "N/A"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Center Number</p>
                <p className="text-lg font-medium font-mono">{candidateInfo.center_code || "N/A"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Examination Details Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Examination Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Exam Type</p>
                <p className="text-lg font-medium">{candidateInfo.exam_type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Series</p>
                <p className="text-lg font-medium">{candidateInfo.exam_series}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Year</p>
                <p className="text-lg font-medium">{candidateInfo.exam_year}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Examination Timetable Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Examination Timetable
            </CardTitle>
            <CardDescription>Schedule of examinations for registered subjects</CardDescription>
          </CardHeader>
          <CardContent>
            {candidateInfo.schedule_entries.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No examination schedule available</p>
            ) : (
              <div className="space-y-4">
                {candidateInfo.schedule_entries.map((entry, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-lg font-semibold">{entry.subject_name}</h3>
                          <Badge variant="outline" className="font-mono">{entry.subject_code}</Badge>
                          {entry.paper && <Badge variant="secondary">Paper {entry.paper}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium">{formatDate(entry.date)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Time:</span>
                        <span className="font-medium">
                          {formatTime(entry.start_time)}
                          {entry.end_time && ` - ${formatTime(entry.end_time)}`}
                        </span>
                      </div>
                      {entry.venue && (
                        <div className="flex items-center gap-2 md:col-span-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Venue:</span>
                          <span className="font-medium">{entry.venue}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Note */}
        <div className="text-center text-sm text-muted-foreground">
          <p>This information is displayed from the Index Slip QR code</p>
        </div>
      </div>
    </div>
  );
}
