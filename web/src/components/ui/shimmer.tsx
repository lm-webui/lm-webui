"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────
 * SHIMMER — shared chat-loading treatment.
 * ShimmerText: shimmering text label (e.g. "Searching…").
 * ShimmerBar:  indeterminate shimmering progress bar.
 * CSS lives in global.css (.shimmer-text / .shimmer-bar).
 * ────────────────────────────────────────── */

export function ShimmerText({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("shimmer-text", className)}>{children}</span>;
}

export function ShimmerBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "h-1 w-full overflow-hidden rounded-full opacity-40",
        className,
      )}
      aria-hidden
    >
      <div className="h-full w-full shimmer-bar" />
    </div>
  );
}
