import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ctvet/ThemeProvider";
import "../ctvet/globals.css";

export const metadata: Metadata = {
  title: "CTVET Theme - Design System",
  description: "Modern UI design system with Ghana flag colors, featuring complete light and dark mode support",
};

export default function CTVETLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
