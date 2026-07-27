import React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { LoaderDots } from "@/components/ui/loader";

interface LoadingMessageProps {
  showRawResponse?: boolean;
  isStreaming?: boolean;
  searchStatus?: string;
  isSearchEnabled?: boolean;
}

const STEPS = ["Thinking...", "Refining...", "Generating..."];

export function LoadingMessage({
  showRawResponse = false,
  searchStatus,
  isSearchEnabled = false,
}: LoadingMessageProps = {}) {
  const isMobile = useIsMobile();
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    if (isSearchEnabled && searchStatus) return; // don't cycle when search has status
    const id = setInterval(
      () => setStepIndex((i) => (i + 1) % STEPS.length),
      3000,
    );
    return () => clearInterval(id);
  }, [isSearchEnabled, searchStatus]);

  const statusText =
    isSearchEnabled && searchStatus ? searchStatus : STEPS[stepIndex];

  return (
    <div
      className={cn(
        "group animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
        "-ml-2 -mr-2 md:-ml-2 md:mr-20",
        isMobile ? "max-w-full" : "max-w-4xl",
      )}
    >
      <div className={cn("min-w-20", isMobile ? "text-[.9rem]" : "text-md")}>
        {/* Web search badge */}
        {isSearchEnabled && (
          <div className="mb-3">
            <div className="flex gap-1 flex-wrap">
              <div className="flex items-center gap-1 text-[.6rem] text-cyan-500 bg-cyan-900/5 px-2 py-1 rounded-3xl animate-pulse">
                <Search className="h-3 w-3" />
                Web Search
              </div>
            </div>
          </div>
        )}

        <MessageBubble role="assistant" isMobile={isMobile} contentLength={50}>
          <div className="flex items-center gap-3">
            {/* Three-dot loader */}
            <div className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-none">
              <LoaderDots className="text-muted-foreground" />
            </div>

            {/* Status text */}
            <div className="flex-1 text-sm text-muted-foreground">
              {statusText}
            </div>

            {showRawResponse && (
              <div className="text-xs text-muted-foreground mt-2 opacity-70">
                Raw Response Mode Active
              </div>
            )}
          </div>
        </MessageBubble>
      </div>
    </div>
  );
}
