import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/ctvet/ThemeProvider";

export const metadata: Metadata = {
  title: "CTVET Online Services",
  description: "Register for examinations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'system';
                  var systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  var resolvedTheme = theme === 'system' ? systemTheme : theme;

                  // Remove all theme classes first
                  document.documentElement.classList.remove('dark', 'ctvet');

                  // Handle ctvet theme
                  if (theme === 'ctvet') {
                    document.documentElement.classList.add('ctvet');
                    if (resolvedTheme === 'dark') {
                      document.documentElement.classList.add('dark');
                      document.documentElement.style.colorScheme = 'dark';
                    } else {
                      document.documentElement.style.colorScheme = 'light';
                    }
                  } else {
                    // Handle regular light/dark themes
                    if (resolvedTheme === 'dark') {
                      document.documentElement.classList.add('dark');
                      document.documentElement.style.colorScheme = 'dark';
                    } else {
                      document.documentElement.style.colorScheme = 'light';
                    }
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
        {children}
        <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
