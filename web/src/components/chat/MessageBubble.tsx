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
          ? "bg-neutral-400/70 dark:bg-neutral-700/70 text-chat-user-foreground ml-20 pr-1 md:pr-4 mt-2"
          : "bg-neutral-200/20 dark:bg-neutral-900/20 text-chat-assistant-foreground border border-border/10",
        isMobile
          ? "max-w-[378px] p-3 text-sm"
          : "max-w-[700px] p-4 text-base",
        "hover:shadow-none",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
