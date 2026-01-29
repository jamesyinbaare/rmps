"use client";

import { useEffect, useState } from "react";
import {
  getDashboardSummary,
  getSubjectDetails,
  getElectivesDetails,
} from "@/lib/api";
import type {
  DashboardSummaryCard,
  DashboardTableRow,
  SubjectDetailsResponse,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BookOpen, Users, FileText, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ExaminersDataTable } from "@/components/admin/ExaminersDataTable";
import { cn } from "@/lib/utils";

function AdminPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1 max-w-sm" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="overflow-hidden rounded-md border">
            <div className="flex border-b bg-muted/50 p-2">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex border-b p-2 last:border-0">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20 ml-4" />
                <Skeleton className="h-4 w-12 ml-4" />
                <Skeleton className="h-4 w-12 ml-4" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailDialogSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-2 h-4 w-24" />
        <div className="overflow-hidden rounded border">
          <div className="flex border-b bg-muted/50 p-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex border-b p-3 last:border-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Skeleton className="mb-2 h-4 w-24" />
        <div className="overflow-hidden rounded border">
          <div className="flex border-b bg-muted/50 p-3">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-28" />
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex border-b p-3 last:border-0">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [cards, setCards] = useState<DashboardSummaryCard[]>([]);
  const [tableRows, setTableRows] = useState<DashboardTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSubjectId, setDetailSubjectId] = useState<string | null>(null);
  const [detailSubjectName, setDetailSubjectName] = useState<string>("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<SubjectDetailsResponse | null>(null);

  const loadSummary = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getDashboardSummary();
      setCards(data.cards);
      setTableRows(data.table);
      setLastUpdated(new Date());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load summary");
      if (!isRefresh) {
        setCards([]);
        setTableRows([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const openDetail = (subjectId: string | null, subjectName: string) => {
    setDetailSubjectId(subjectId);
    setDetailSubjectName(subjectName);
    setDetailData(null);
    setDetailOpen(true);
    setDetailLoading(true);
    (subjectId === null ? getElectivesDetails() : getSubjectDetails(subjectId))
      .then(setDetailData)
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load details");
        setDetailData(null);
      })
      .finally(() => setDetailLoading(false));
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetailSubjectId(null);
    setDetailSubjectName("");
    setDetailData(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Examiner summary</h1>
          <p className="text-sm text-muted-foreground">
            Overview of subjects, active examiners, and new applications.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          {lastUpdated != null && !loading && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSummary(true)}
            disabled={loading || refreshing}
            className="gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {loading ? (
        <AdminPageSkeleton />
      ) : (
        <>
          {/* Cards: core subjects + Electives */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => {
              const isElectives = card.subject_id == null;
              const hasNewApps = card.new_application_count > 0;
              return (
                <Card
                  key={card.subject_id ?? "electives"}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-muted/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isElectives && "border-accent/50"
                  )}
                  tabIndex={0}
                  role="button"
                  onClick={() =>
                    openDetail(card.subject_id, card.subject_name)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(card.subject_id, card.subject_name);
                    }
                  }}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex flex-wrap items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0" />
                      {card.subject_name}
                      {isElectives && (
                        <Badge
                          variant="secondary"
                          className="shrink-0 text-xs"
                        >
                          Electives
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>Active examiners: {card.active_examiner_count}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>New applications: </span>
                      {hasNewApps ? (
                        <Badge
                          variant="secondary"
                          className="bg-accent/20 text-accent-foreground shrink-0"
                        >
                          {card.new_application_count}
                        </Badge>
                      ) : (
                        <span>{card.new_application_count}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* DataTable: subjects with active examiners and new applications */}
          <Card>
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
              <p className="text-sm text-muted-foreground">
                Search and sort the table. Click a row to see breakdown by region and gender.
              </p>
            </CardHeader>
            <CardContent>
              <ExaminersDataTable
                data={tableRows}
                onRowClick={(subjectId, subjectName) =>
                  openDetail(subjectId, subjectName)
                }
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Subject detail dialog: by region and by gender */}
      <Dialog open={detailOpen} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent
          className="flex max-h-[85vh] max-w-lg flex-col gap-4 overflow-hidden sm:max-w-lg"
          aria-describedby="detail-dialog-description"
        >
          <DialogHeader className="text-left gap-0">
            <DialogTitle>{detailSubjectName}</DialogTitle>
            <DialogDescription id="detail-dialog-description">
              Breakdown by region and gender
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 max-h-[60vh] overflow-y-auto">
            {detailLoading ? (
              <DetailDialogSkeleton />
            ) : detailData ? (
              <div className="space-y-6 pt-2">
                <div>
                  <h4 className="mb-2 text-sm font-medium">By region</h4>
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Region</th>
                          <th className="p-3 text-right font-medium">Active</th>
                          <th className="p-3 text-right font-medium">
                            New applications
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detailData.by_region).map(
                          ([region, counts]) => (
                            <tr key={region} className="border-b last:border-0">
                              <td className="p-3">{region}</td>
                              <td className="p-3 text-right">
                                {counts.active}
                              </td>
                              <td className="p-3 text-right">
                                {counts.new_applications}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                  {Object.keys(detailData.by_region).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">
                      No data by region.
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-medium">By gender</h4>
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Gender</th>
                          <th className="p-3 text-right font-medium">Active</th>
                          <th className="p-3 text-right font-medium">
                            New applications
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(detailData.by_gender).map(
                          ([gender, counts]) => (
                            <tr key={gender} className="border-b last:border-0">
                              <td className="p-3">{gender}</td>
                              <td className="p-3 text-right">
                                {counts.active}
                              </td>
                              <td className="p-3 text-right">
                                {counts.new_applications}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                  {Object.keys(detailData.by_gender).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">
                      No data by gender.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="flex justify-end sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
