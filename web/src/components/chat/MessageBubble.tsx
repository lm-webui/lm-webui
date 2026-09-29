import * as React from "react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  role: "user" | "assistant";
  isMobile: boolean;
  children: React.ReactNode;
}

export function MessageBubble({
  role,
  isMobile,
  className,
  children,
  ...props
}: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "inline-block relative group/message transition-all duration-200",
        role === "user" ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md",
        role === "user"
          ? "bg-neutral-400/70 dark:bg-neutral-700/70 ml-20 pr-1 md:pr-4 mt-2"
          : "bg-neutral-200/20 dark:bg-neutral-900/20 border border-border/10",
        isMobile
          ? "max-w-full p-4 text-md"
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
