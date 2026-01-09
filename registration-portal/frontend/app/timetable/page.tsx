"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { Calendar, Clock, ArrowLeft } from "lucide-react";

export default function TimetablePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2">
                <Badge className="bg-orange-500 text-white text-sm px-3 py-1">
                  Coming Soon
                </Badge>
              </div>
              <h1 className="mb-4 text-4xl font-bold text-foreground">
                Examination Timetables
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                View and download examination schedules and timetables for all registered subjects.
              </p>
            </div>
          </div>
        </section>

        {/* Coming Soon Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <Card className="border-2">
                <CardHeader className="text-center pb-4">
                  <div className="mb-4 flex justify-center">
                    <div className="p-4 rounded-lg bg-primary/10">
                      <Calendar className="h-16 w-16 text-primary" />
                    </div>
                  </div>
                  <CardTitle className="text-2xl mb-2">Timetable Feature Coming Soon</CardTitle>
                  <CardDescription className="text-base">
                    We are currently working on bringing you a comprehensive timetable viewing and download feature.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">View Examination Schedules</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Access detailed timetables for all examination series
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Calendar className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Download Timetables</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Download and print your examination schedules in PDF format
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                      <Clock className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">Subject-Specific Schedules</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          View schedules organized by subject and examination type
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 flex justify-center gap-4">
                    <Link href="/examinations">
                      <Button variant="outline">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Examinations
                      </Button>
                    </Link>
                    <Link href="/">
                      <Button>
                        Return to Home
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} CTVET Online Services. All rights reserved.</p>
            <p className="mt-2">
              Commission for Technical and Vocational Education and Training
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
