"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/layout/Navbar";
import { GraduationCap, Users, Calendar, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="mb-6 text-5xl font-bold text-foreground">
                CTVET Online Services
              </h1>
              <p className="mb-8 text-xl text-muted-foreground">
                Register for technical and vocational education examinations with ease.
                Manage your registrations and stay updated on examination schedules.
              </p>
              <div className="flex justify-center gap-4">
                <Link href="/register-private-account">
                  <Button size="lg">
                    Register Now
                  </Button>
                </Link>
                <Link href="/results">
                  <Button variant="outline" size="lg">
                    View Results
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <h2 className="mb-12 text-center text-3xl font-bold">Features</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader>
                  <GraduationCap className="mb-2 h-10 w-10 text-primary" />
                  <CardTitle>Easy Registration</CardTitle>
                  <CardDescription>
                    Register for examinations quickly and securely through our online portal.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Users className="mb-2 h-10 w-10 text-primary" />
                  <CardTitle>School Portal</CardTitle>
                  <CardDescription>
                    Schools can register multiple candidates efficiently with bulk upload options.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Calendar className="mb-2 h-10 w-10 text-primary" />
                  <CardTitle>Schedule Management</CardTitle>
                  <CardDescription>
                    View and download examination timetables for all registered subjects.
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <Shield className="mb-2 h-10 w-10 text-primary" />
                  <CardTitle>Secure & Reliable</CardTitle>
                  <CardDescription>
                    Your data is protected with industry-standard security measures.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-primary/5 py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="mb-4 text-3xl font-bold">Ready to Get Started?</h2>
              <p className="mb-8 text-lg text-muted-foreground">
                Create an account or log in to begin registering for examinations.
              </p>
              <div className="flex justify-center gap-4">
                <Link href="/register-private-account">
                  <Button size="lg">Register for Exam</Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg">
                    Staff Login
                  </Button>
                </Link>
                <Link href="/login/private">
                  <Button variant="outline" size="lg">
                    Candidate Login
                  </Button>
                </Link>
              </div>
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
