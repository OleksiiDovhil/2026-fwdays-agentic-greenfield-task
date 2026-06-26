import type { NextConfig } from "next";

// Security headers applied to ALL routes (review finding: a privacy-first, keyless
// app should ship a baseline header set). The values are deliberately PERMISSIVE
// enough not to break the app while still constraining egress:
//   - Content-Security-Policy:
//       * default-src 'self'            — same-origin by default (keyless posture).
//       * img-src 'self' data: https://*.tile.openstreetmap.org
//                                        — the ONLY off-origin image source is the
//                                          OSM raster tiles (TC-STACK-04/TC-MAP-01);
//                                          `data:` covers inlined/SVG assets; the
//                                          Leaflet marker icons are SAME-ORIGIN
//                                          (bundler-emitted) so no unpkg host is
//                                          allowed here.
//       * connect-src 'self'            — the only fetches are our own route
//                                          handlers (/api/forecast, /api/geocode,
//                                          /api/reverse-geocode); Open-Meteo &
//                                          Nominatim are called SERVER-SIDE, never
//                                          from the browser (TC-DATA-01), so no
//                                          third-party connect host is needed.
//       * style-src 'self' 'unsafe-inline' — Leaflet's CSS + Tailwind/Next inject
//                                          inline styles; 'unsafe-inline' for styles
//                                          is the pragmatic, low-risk allowance.
//       * script-src 'self' 'unsafe-inline' — Next's hydration/runtime uses inline
//                                          bootstrap scripts; no third-party script
//                                          host is allowed.
//       * frame-ancestors 'none' + base-uri 'self' — clickjacking / base-tag
//                                          hardening.
//   - X-Content-Type-Options: nosniff
//   - Referrer-Policy: strict-origin-when-cross-origin
//   - X-Frame-Options: DENY
//
// NOTE: full CSP conformance is a LIVE/deploy concern (a real browser + the actual
// inline-style/script hashes). This baseline is verified not to break the build,
// the static `/` prerender, or OSM tile loading; tightening 'unsafe-inline' to
// nonces/hashes is a production hardening follow-up.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data: https://*.tile.openstreetmap.org",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply the baseline security headers to every route.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
