// Root layout — design.md D7. A SERVER component: sets `<html lang="uk">` (the
// app is Ukrainian-first), calm metadata sourced from the centralized copy (no
// exclamation marks, BC-BRAND-01), and wraps `{children}` with the providers
// (ThemeProvider then LocationProvider) — NOT the whole document, so static
// server content stays static (Next.js guidance).
//
// LocationProvider reads `useSearchParams`, which Next 16 requires to sit inside
// a `<Suspense>` boundary (otherwise the route deopts to client rendering / warns
// — design.md "Risks"). The boundary wraps the provider subtree here.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { LocationProvider } from "@/components/providers/LocationProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { t } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: t("app.metaTitle"),
  description: t("app.metaDescription"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-svh bg-background text-foreground">
        <ThemeProvider>
          <Suspense fallback={null}>
            <LocationProvider>{children}</LocationProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
