"use client";

import * as React from "react";
import { ExternalLink, FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ShimmerText } from "@/components/ui/shimmer";

/* ──────────────────────────────────────────
 * SEARCH TOOL
 * Collapsible web-search result widget: "Searching…" shimmer label,
 * then "Found N results" header expanding into a list of result rows
 * (title + date/source). Rows link to the source URL when present.
 * ────────────────────────────────────────── */

export type SearchResult = {
  title: string;
  source: string;
  date?: string | undefined;
  domain?: string | undefined;
  provider?: string | undefined;
  snippet?: string | undefined;
};

export type SearchToolProps = {
  /** "searching" shows shimmer label; "done" shows result count. Default: "done". */
  state?: "searching" | "done";
  /** Query text shown in the panel header. */
  query: string;
  /** Result rows — empty array (or omitted) hides the panel. */
  results?: SearchResult[];
  /** Initial expand state when results exist. */
  defaultOpen?: boolean;
  /** Controlled expand state (pair with `onToggleExpand`). */
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
};

export const SearchTool = React.memo(function SearchTool({
  state = "done",
  query,
  results = [],
  defaultOpen = false,
  expanded,
  onToggleExpand,
  className,
}: SearchToolProps) {
  const isControlled = expanded !== undefined;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const isOpen = isControlled ? !!expanded : internalOpen;

  const isAnimating = state === "searching";
  const totalResults = results.length;
  const expandable = totalResults > 0;

  const handleToggle = () => {
    if (!expandable) return;
    if (isControlled) {
      onToggleExpand?.();
    } else {
      setInternalOpen((v) => !v);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 w-full", className)}>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!expandable}
        aria-expanded={expandable ? isOpen : undefined}
        className={cn(
          "group flex items-center max-w-full select-none gap-1 bg-transparent border-0 p-0 m-0 text-left",
          expandable ? "cursor-pointer" : "cursor-default",
        )}
      >
        <div className="flex items-center gap-2 min-w-0 text-sm text-muted-foreground">
          <span className="font-[450] whitespace-nowrap shrink-0">
            {isAnimating ? (
              <ShimmerText>Searching...</ShimmerText>
            ) : (
              `Web search · ${totalResults} result${totalResults === 1 ? "" : "s"}`
            )}
          </span>
        </div>
        {expandable && (
          <ChevronRight
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150 ease-out size-3",
              isOpen ? "rotate-90" : "rotate-0",
            )}
          />
        )}
      </button>
      {expandable && isOpen && (
        <div className="rounded-[10px] overflow-hidden bg-muted/30 border border-border">
          <div className="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border text-xs">
            <span className="min-w-0 truncate"><span className="font-medium">Searched for</span>{" "}<span className="text-muted-foreground">&ldquo;{query}&rdquo;</span></span>
            <span className="shrink-0 text-muted-foreground">{results[0]?.provider || "web"}</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto bg-background">
            <div className="flex flex-col gap-1 p-1">
              {results.map((result, i) => {
                const row = (
                  <>
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-medium truncate">{result.title}{result.source && <ExternalLink className="h-3 w-3 shrink-0" />}</span>
                      <span className="block text-xs text-muted-foreground truncate">{result.domain || result.source}{result.date ? ` · ${result.date}` : ""}</span>
                      {result.snippet && <span className="mt-1 block text-xs leading-4 text-muted-foreground line-clamp-2">{result.snippet}</span>}
                    </span>
                  </>
                );
                return result.source ? (
                  <a
                    key={i}
                    href={result.source}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-2 py-1 rounded-[6px] hover:bg-muted/60"
                  >
                    {row}
                  </a>
                ) : (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-[6px] hover:bg-muted/60">
                    {row}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
