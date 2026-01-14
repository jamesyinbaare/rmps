"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Generate and download invoices and reports</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
          <Link href="/dashboard/my-school/reports/invoices">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Invoices
              </CardTitle>
              <CardDescription>
                Generate and download invoices for free TVET and referral candidates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full">View Invoices</Button>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:shadow-lg transition-shadow">
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
      </div>
    </div>
  );
}
