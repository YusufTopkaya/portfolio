"use client";

import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Known lottie-web regression with React Strict Mode (dev only):
    // ICompElement.destroyElements calls .destroy() on elements[] entries that
    // may be `true` (partially initialized), causing a TypeError. This does not
    // affect production or app functionality.
    if (error.message?.includes("destroy is not a function")) {
      return { hasError: false };
    }
    console.error("Error boundary caught an error:", error);
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (error.message?.includes("destroy is not a function")) return;
    console.error("Error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600">
              Something went wrong
            </h2>
            <p className="text-gray-600 mt-2">
              Please refresh the page or try again later.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
