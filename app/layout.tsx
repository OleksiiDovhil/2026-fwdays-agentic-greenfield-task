// Root layout — design.md D7 (and add-animated-bg D1/D8). A SERVER component:
// sets `<html lang="uk">` (the app is Ukrainian-first), calm metadata sourced
// from the centralized copy (no exclamation marks, BC-BRAND-01), and wraps
// `{children}` with the providers (ThemeProvider → LocationProvider →
// WeatherProvider) — NOT the whole document, so static server content stays
// static (Next.js guidance).
//
// WeatherProvider (add-animated-bg D1) is the shared, in-memory weather relay the
// forecast PUBLISHES into and the decorative `WeatherBackground` CONSUMES. It
// nests INSIDE LocationProvider, wrapping `{children}`, so it spans BOTH the
// `<WeatherBackground/>` and `<ShellContent/>`/`<ForecastSection/>` subtrees
// (siblings in `app/page.tsx`, so the provider must wrap both). It holds no fetch
// and no persistence (ADR-0003).
//
// PinProvider (add-weekend-compare D1) is the small in-memory pinned-city list the
// compare chip row + table read. It also nests INSIDE LocationProvider (so a "pin"
// can capture `useLocation().location` and "make active" can call `setLocation`),
// alongside WeatherProvider, wrapping `{children}`. In-memory only, no persistence
// (ADR-0003); it resets on reload.
//
// LocationProvider reads `useSearchParams`, which Next 16 requires to sit inside
// a `<Suspense>` boundary (otherwise the route deopts to client rendering / warns
// — design.md "Risks"). The boundary wraps the provider subtree here.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { LocationProvider } from "@/components/providers/LocationProvider";
import { PinProvider } from "@/components/providers/PinProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { WeatherProvider } from "@/components/providers/WeatherProvider";
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
            <LocationProvider>
              <WeatherProvider>
                <PinProvider>{children}</PinProvider>
              </WeatherProvider>
            </LocationProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
