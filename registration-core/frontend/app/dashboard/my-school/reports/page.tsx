"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Receipt, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Generate and download invoices and reports"
      />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer shadow-none">
          <Link href="/dashboard/my-school/fees">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Fees & Invoices
              </CardTitle>
              <CardDescription>
                Amounts due, build invoices, Paystack or bank deposit, and type PDF downloads
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Open Fees & Invoices</Button>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer shadow-none">
          <Link href="/dashboard/my-school/reports/index-slips">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Index Slips
              </CardTitle>
              <CardDescription>
                Download index slips for candidates based on examination filters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">Download Index Slips</Button>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer shadow-none">
          <Link href="/dashboard/my-school/timetables">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timetables
              </CardTitle>
              <CardDescription>
                View and download examination timetables for your school
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
