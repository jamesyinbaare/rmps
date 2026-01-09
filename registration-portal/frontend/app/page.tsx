"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/layout/Navbar";
import { BookOpen, Award, ClipboardCheck, ArrowRight } from "lucide-react";

export default function Home() {
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  const words = ["regulator", "promoter"];
  const typingSpeed = 100;
  const deletingSpeed = 50;
  const pauseTime = 2000;

  useEffect(() => {
    const currentWord = words[wordIndex];

    let timeout: NodeJS.Timeout;

    if (!isDeleting) {
      // Typing
      if (displayText.length < currentWord.length) {
        timeout = setTimeout(() => {
          setDisplayText(currentWord.substring(0, displayText.length + 1));
        }, typingSpeed);
      } else {
        // Finished typing, pause then start deleting
        timeout = setTimeout(() => {
          setIsDeleting(true);
        }, pauseTime);
      }
    } else {
      // Deleting
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(currentWord.substring(0, displayText.length - 1));
        }, deletingSpeed);
      } else {
        // Finished deleting, switch to next word
        setIsDeleting(false);
        setWordIndex((prevIndex) => (prevIndex + 1) % words.length);
      }
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [displayText, isDeleting, wordIndex]);

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section with Cards Overlay */}
        <section className="relative bg-gradient-to-b from-primary/50 via-primary/20 to-background min-h-[50vh] flex items-center">
          <div className="container mx-auto px-4 w-full">
            {/* Hero Content */}
            <div className="mx-auto max-w-4xl text-center pt-20 pb-32">
              <h1 className="mb-6 text-5xl md:text-6xl font-bold text-foreground leading-[1.2] md:leading-[1.3]">
                Commission for Technical and Vocational Education and Training
              </h1>
              <p className="mb-8 text-2xl md:text-3xl font-semibold text-foreground">
                Ghana's{" "}
                <span className="inline-block min-w-[120px] md:min-w-[150px] text-left">
                  <span className="inline-block">{displayText}</span>
                  <span className="animate-pulse ml-1">|</span>
                </span>{" "}
                of skills
              </p>
            </div>

            {/* Services Cards Overlay */}
            <div className="relative -mt-16 md:-mt-24 mb-8">
              <div className="grid gap-6 md:gap-8 md:grid-cols-3 max-w-5xl mx-auto px-4">
              <Link href="/examinations" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-105 border-2 hover:border-primary/50 cursor-pointer shadow-lg bg-card">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <BookOpen className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl mb-2 group-hover:text-primary transition-colors">Examinations</CardTitle>
                    <CardDescription className="text-base">
                      Access examination registration portals for schools and private candidates
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      Explore Examinations
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/certificate" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-105 border-2 hover:border-primary/50 cursor-pointer shadow-lg bg-card">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <Award className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl mb-2 group-hover:text-primary transition-colors">Certificate</CardTitle>
                    <CardDescription className="text-base">
                      Request certificates, check status, and verify results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      View Certificate Services
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link href="/results" className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-xl hover:scale-105 border-2 hover:border-primary/50 cursor-pointer shadow-lg bg-card">
                  <CardHeader className="pb-4">
                    <div className="mb-4 p-3 rounded-lg bg-primary/10 w-fit group-hover:bg-primary/20 transition-colors">
                      <ClipboardCheck className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl mb-2 group-hover:text-primary transition-colors">Results</CardTitle>
                    <CardDescription className="text-base">
                      Check your examination results
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
                      View Results
                      <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
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
