import React from "react";
import { cn } from "@/lib/utils";

interface WelcomeProps {
  user: { email: string } | null;
  children: React.ReactNode;
  onAction?: (label: string) => void;
}

export function Welcome({ user, children, onAction }: WelcomeProps) {
  const userName = user?.email?.split("@")[0] || "User";

  return (
    <div className="flex flex-col items-center justify-center h-full w-full max-w-3xl mx-auto px-4 bg-transparent">
      <div className="flex-1 flex flex-col items-center justify-center w-full space-y-8 min-h-0">
        <div className="w-full max-w-2xl flex flex-col items-start space-y-2 animate-in fade-in zoom-in duration-500 px-2">
           <div className="flex items-center gap-3">
              <img src="/logo1.png" alt="Logo" className="h-10 w-10 object-contain" />
              <h1 className="text-4xl font-medium tracking-tight text-zinc-900 dark:text-zinc-100">
                <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
                  Hi, {userName}
                </span>
              </h1>
           </div>
            <p className="text-5xl font-medium text-stone-500 dark:text-stone-400">
              How can I help you today?
            </p>
        </div>

        <div className="w-full max-w-2xl animate-in slide-in-from-bottom-4 duration-700 fade-in">
          {children}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-2xl animate-in slide-in-from-bottom-8 duration-1000 fade-in">
            {[
              { label: "Create image", icon: "🍌" },
              { label: "Write docs", icon: "📝" },
              { label: "Summarize", icon: "" },
              { label: "Brainstorm", icon: "" }
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => onAction?.(item.label)}
                className="p-3 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100/50 dark:bg-zinc-800/50 rounded-3xl text-center border border-transparent cursor-pointer flex items-center justify-center gap-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
        </div>
      </div>

      {/* Spacer to push content up slightly from absolute bottom if needed */}
      <div className="h-12 md:h-24 shrink-0" />
    </div>
  );
}
