"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Trophy } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getClerkValidationStats, getCurrentUser } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { ClerkValidationStatsItem } from "@/types/document";

export default function ClerkStatsPage() {
  const router = useRouter();
  const [clerks, setClerks] = useState<ClerkValidationStatsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const user = await getCurrentUser();
        const role = normalizeRole(user.role);
        if (role !== "SUPER_ADMIN" && role !== "REGISTRAR") {
          router.replace("/");
          return;
        }
        setAuthorized(true);
        const data = await getClerkValidationStats();
        setClerks(data.clerks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load clerk stats");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [router]);

  if (!authorized && !loading && !error) {
    return null;
  }

  return (
    <DashboardLayout title="Clerk Stats">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Clerk Stats" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8 space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
                <Trophy className="h-7 w-7" />
                Clerk resolution leaderboard
              </h1>
              <p className="text-muted-foreground mt-1">
                Attributed validation issue resolves by data entry clerk (UTC day / week).
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading stats…
              </div>
            ) : error ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-8 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </CardContent>
              </Card>
            ) : clerks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No active data clerks found.
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">#</TableHead>
                      <TableHead>Clerk</TableHead>
                      <TableHead className="text-right">Today</TableHead>
                      <TableHead className="text-right">This week</TableHead>
                      <TableHead className="text-right">All time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clerks.map((clerk, index) => (
                      <TableRow key={clerk.user_id}>
                        <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                        <TableCell className="font-medium">{clerk.full_name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {clerk.resolved_today}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {clerk.resolved_week}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {clerk.resolved_total}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
