"use client";

// Reusable React error boundary — design.md D4, NFR-OBS-01. When a child throws
// during render, it degrades to the shared inline error pattern (<Notice
// variant="error" />) instead of crashing the page, and stays console-SILENT for
// the handled case (the spec's "runtime fault degrades to the inline pattern
// silently in the console"). `app/error.tsx` renders the same <Notice> for the
// route-segment boundary so the surface is identical everywhere.
//
// This is a class component because `getDerivedStateFromError` /
// `componentDidCatch` (React's only render-error hooks) have no function-component
// equivalent. It is unit-testable in jsdom, unlike `app/error.tsx`.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Optional fallback override; defaults to the shared error Notice. */
  fallback?: ReactNode;
  /** Optional hook for deliberate server-side logging (never the console). */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Honest-under-failure: route the cause to a deliberate handler if provided,
    // but emit NOTHING to the console for this handled case (NFR-OBS-01).
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? <Notice variant="error" />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
