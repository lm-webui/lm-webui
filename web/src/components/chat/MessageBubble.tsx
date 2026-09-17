import * as React from "react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  role: "user" | "assistant";
  isMobile: boolean;
  contentLength?: number;
  children: React.ReactNode;
}

export function MessageBubble({
  role,
  isMobile,
  contentLength = 0,
  className,
  children,
  ...props
}: MessageBubbleProps) {
  // Adaptive border radius based on content length
  const getBorderRadius = () => {
    if (isMobile) return "rounded-4xl";

    // Short messages
    if (contentLength < 50) return "rounded-3xl";

    // Medium messages
    if (contentLength < 200) return "rounded-3xl";

    // Long messages
    return "rounded-3xl";
  };

  return (
    <div
      className={cn(
        "inline-block relative group/message transition-all duration-200",
        getBorderRadius(),
        role === "user"
          // ml-20 (80px) is a desktop inset. On mobile it was added to the bubble's width
          // instead of eating into it, so a user bubble occupied 80px + max-width and pushed the
          // chat area ~90px wider than a phone viewport — the whole area could be dragged
          // sideways. Zero below md; the row's ml-auto still right-aligns it.
          ? "bg-neutral-400/70 dark:bg-neutral-700/70 text-chat-user-foreground ml-0 md:ml-20 pr-1 md:pr-4 mt-2"
          : "bg-neutral-200/20 dark:bg-neutral-900/20 text-chat-assistant-foreground border border-border/10",
        isMobile
          // max-w-full, not a fixed px: the available width is the viewport minus the chat
          // container's padding, which is narrower than any fixed value on every common phone.
          ? "max-w-full p-3 pr-3 text-md"
          : "max-w-[698px] p-4 text-md",
        "hover:shadow-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
