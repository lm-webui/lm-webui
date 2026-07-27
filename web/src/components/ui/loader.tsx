/** Three-dot bouncing loader */
export function LoaderDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className || ""}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}
