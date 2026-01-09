"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { Building2, User, Calendar, ArrowRight } from "lucide-react";

export default function ExaminationsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="mb-4 text-4xl font-bold text-foreground">
                Examinations
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                Access examination registration portals and view timetables for CTVET examinations.
              </p>
            </div>
          </div>
        </section>

        {/* Services Cards Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
              {/* CTVET School Card */}
              <Link href="/login" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <Building2 className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      CTVET School
                    </CardTitle>
                    <CardDescription>
                      School administrators can log in to register candidates in bulk
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      School Admin Login
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* CTVET Private Card */}
              <Link href="/login/private" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <User className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      CTVET Private
                    </CardTitle>
                    <CardDescription>
                      Private candidates can log in to register for examinations
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      Private Candidate Login
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Timetable Card */}
              <Link href="/timetable" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors relative">
                      <Calendar className="h-12 w-12 text-primary" />
                      <Badge className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs">
                        Coming Soon
                      </Badge>
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      Timetable
                    </CardTitle>
                    <CardDescription>
                      View examination schedules and timetables
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      View Timetable
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
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
