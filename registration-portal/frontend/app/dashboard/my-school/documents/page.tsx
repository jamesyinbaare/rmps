"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Documents</h1>
        <p className="text-muted-foreground">Download and manage documents</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" />
              Download Index Slip
            </CardTitle>
            <CardDescription>
              Download index slips for candidates based on examination filters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/my-school/documents/index-slips">
              <Button className="w-full">
                Go to Index Slip Download
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
