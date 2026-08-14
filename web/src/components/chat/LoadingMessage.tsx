import React from "react";
import { Search, FileText, Eye, AudioLines, Sparkles, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { LoaderDots } from "@/components/ui/loader";

interface LoadingMessageProps {
  showRawResponse?: boolean;
  isStreaming?: boolean;
  searchStatus?: string; // live pipeline-stage message (e.g. "Searching the web…")
  isSearchEnabled?: boolean;
}

const STEPS = ["Thinking…", "Refining…", "Composing…"];

// Pick a stage icon from the live status message.
function stageIcon(message: string) {
  const m = message.toLowerCase();
  if (m.includes("web") || m.includes("search")) return Search;
  if (m.includes("retriev") || m.includes("document") || m.includes("attach")) return FileText;
  if (m.includes("imag") || m.includes("vision") || m.includes("read")) return Eye;
  if (m.includes("transcrib") || m.includes("video") || m.includes("audio")) return AudioLines;
  return Sparkles;
}

export function LoadingMessage({
  showRawResponse = false,
  searchStatus,
  isSearchEnabled = false,
}: LoadingMessageProps = {}) {
  const isMobile = useIsMobile();
  const [stepIndex, setStepIndex] = React.useState(0);

  // While a live stage is active, track it; otherwise cycle the generic steps.
  React.useEffect(() => {
    if (searchStatus) return;
    const id = setInterval(
      () => setStepIndex((i) => (i + 1) % STEPS.length),
      3000,
    );
    return () => clearInterval(id);
  }, [searchStatus]);

  const statusText = searchStatus || STEPS[stepIndex];
  const Icon = stageIcon(statusText ?? "");

  // Gemini-style: a single colorless row — animated three-dot loader, a stage
  // favicon (Globe while web search is active), and one status text. No redundant
  // duplication between a "chip" and a "bubble".
  return (
    <div
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        isMobile ? "max-w-full" : "max-w-4xl",
      )}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderDots className="text-muted-foreground" />
        {isSearchEnabled ? (
          <Globe className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="text-xs truncate">{statusText}</span>
        {showRawResponse && (
          <span className="text-[.65rem] opacity-70">Raw Response Mode</span>
        )}
      </div>
    </div>
  );
}
