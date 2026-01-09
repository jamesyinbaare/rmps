"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/layout/Navbar";
import { FileText, Search, ShieldCheck, ArrowRight } from "lucide-react";

export default function CertificatePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-16">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="mb-4 text-4xl font-bold text-foreground">
                Certificate Services
              </h1>
              <p className="mb-8 text-lg text-muted-foreground">
                Request certificates, check the status of your requests, and verify examination results.
              </p>
            </div>
          </div>
        </section>

        {/* Services Cards Section */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
              {/* Certificate/Attestation Request Card */}
              <Link href="/certificate-request" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <FileText className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      Certificate/Attestation Request
                    </CardTitle>
                    <CardDescription>
                      Request a certificate or attestation for your examination results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      Make a Request
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Certificate/Attestation Request Status Card */}
              <Link href="/certificate-request/status" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <Search className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      Certificate/Attestation Request Status
                    </CardTitle>
                    <CardDescription>
                      Check the status of your certificate or attestation request
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      Check Status
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              {/* Certificate Confirmation/Verification Card */}
              <Link href="/certificate-confirmation" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 hover:border-primary/50 cursor-pointer">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <ShieldCheck className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-xl mb-2 group-hover:text-primary transition-colors">
                      Certificate Confirmation/Verification
                    </CardTitle>
                    <CardDescription>
                      Verify Certificate II examination and HND/Diploma results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      Verify Results
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
