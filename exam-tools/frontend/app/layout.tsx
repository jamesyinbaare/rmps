import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CTVET Certificate II Examinations Operations Portal",
  description: "Coordinate centre-level examination activities through one secure platform built for smooth delivery, oversight, and reporting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("theme")||"ctvet";var r=document.documentElement;r.classList.add("ctvet");if(t==="dark")r.classList.add("dark");r.style.colorScheme=t==="dark"?"dark":"light";}catch(e){}})();`}
        </Script>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="ctvet"
          enableSystem={false}
          themes={["ctvet", "dark"]}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
