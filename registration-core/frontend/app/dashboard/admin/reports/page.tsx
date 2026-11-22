"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function AdminReportsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Reports and Documents"
        subtitle="Generate and download reports and timetables"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer shadow-none">
          <Link href="/dashboard/reports/timetables">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timetables
              </CardTitle>
              <CardDescription>
                View and download examination timetables for entire examinations or specific schools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">View Timetables</Button>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
