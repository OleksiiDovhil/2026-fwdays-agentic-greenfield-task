"use client";

// Route-segment error boundary (Next.js App Router) — spec "Shared inline error
// and empty-state pattern" / "A runtime fault degrades to the inline pattern
// silently in the console" (NFR-OBS-01). When a capability inside the shell
// throws during rendering, the visitor sees the SHARED inline error pattern
// (<Notice variant="error" />) instead of a crashed page or a generic 500.
//
// Console-SILENT for the handled case: we deliberately do NOT call
// `console.error` here (the doc example does, but the spec requires a clean
// console on an otherwise healthy session). The same <Notice> is reused by
// `components/ui/ErrorBoundary` so the error surface is identical everywhere.
//
// Reference: node_modules/next/dist/docs/.../file-conventions/error.md — props
// `{ error, reset }`; `unstable_retry` (Next 16.2) re-fetches + re-renders the
// segment to attempt recovery.
import { Notice } from "@/components/ui/Notice";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/i18n";

export default function ShellError({
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  unstable_retry?: () => void;
}) {
  const retry = unstable_retry ?? reset;
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-12">
      <Notice
        variant="error"
        action={
          <Button variant="outline" size="sm" onClick={() => retry()}>
            {t("shell.notice.error.retry")}
          </Button>
        }
      />
    </div>
  );
}
