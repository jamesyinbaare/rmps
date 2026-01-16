"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Generate and download reports and timetables</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
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
